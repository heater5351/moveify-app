const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/ownership');
const cliniko = require('../services/cliniko');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('clinician'));

// GET /api/cliniko/patients?q=john
router.get('/patients', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }
  try {
    const patients = await cliniko.searchPatients(q.trim());
    audit.log(req, 'cliniko_read', 'cliniko_patient_search', null, { query: q.trim(), resultCount: patients.length });
    res.json({ patients });
  } catch (err) {
    console.error('Cliniko patient search error:', err);
    const status = err.status === 401 ? 503 : 502;
    res.status(status).json({ error: 'Could not reach Cliniko. Please try again.' });
  }
});

// POST /api/cliniko/link/:patientId — link an existing Moveify patient to a Cliniko record
router.post('/link/:patientId', requireAdmin, async (req, res) => {
  const { patientId } = req.params;
  const { clinikoPatientId } = req.body;

  if (!clinikoPatientId) {
    return res.status(400).json({ error: 'clinikoPatientId is required' });
  }

  try {
    const patient = await db.getOne('SELECT id FROM users WHERE id = $1 AND role = $2', [patientId, 'patient']);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // Verify the Cliniko patient exists
    await cliniko.getPatient(clinikoPatientId);

    await db.query(
      'UPDATE users SET cliniko_patient_id = $1, cliniko_synced_at = NOW() WHERE id = $2',
      [clinikoPatientId, patientId]
    );

    audit.log(req, 'cliniko_link', 'patient', parseInt(patientId), { clinikoPatientId });
    res.json({ success: true, clinikoPatientId, clinikoSyncedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Cliniko link error:', err);
    if (err.status === 404) return res.status(404).json({ error: 'Cliniko patient not found' });
    res.status(502).json({ error: 'Could not reach Cliniko. Please try again.' });
  }
});

// POST /api/cliniko/sync/:patientId — re-pull demographics from Cliniko and update cached fields
router.post('/sync/:patientId', async (req, res) => {
  const { patientId } = req.params;

  try {
    const patient = await db.getOne(
      'SELECT id, cliniko_patient_id FROM users WHERE id = $1 AND role = $2',
      [patientId, 'patient']
    );
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    if (!patient.cliniko_patient_id) return res.status(400).json({ error: 'Patient is not linked to Cliniko' });

    const cp = await cliniko.getPatient(patient.cliniko_patient_id);

    const name = `${cp.first_name} ${cp.last_name}`.trim();
    const dob = cp.date_of_birth || null;
    const phone = cp.patient_phone_numbers?.[0]?.number || null;
    const addressParts = [cp.address_1, cp.address_2, cp.address_3, cp.city, cp.state, cp.post_code]
      .map(p => (p || '').trim()).filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(', ') : null;

    // Email is never synced — it's the login credential in Moveify and must not be overwritten
    // COALESCE preserves existing Moveify data if Cliniko has no value for that field
    await db.query(
      `UPDATE users SET name = $1, dob = COALESCE($2, dob), phone = COALESCE($3, phone), address = COALESCE($4, address), cliniko_synced_at = NOW() WHERE id = $5`,
      [name, dob, phone, address, patientId]
    );

    audit.log(req, 'cliniko_sync', 'patient', parseInt(patientId), { clinikoPatientId: patient.cliniko_patient_id });
    res.json({ success: true, name, dob, phone, address, clinikoSyncedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Cliniko sync error:', err);
    res.status(502).json({ error: 'Could not reach Cliniko. Please try again.' });
  }
});

module.exports = router;
