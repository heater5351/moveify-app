const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/ownership');
const cliniko = require('../services/cliniko');
const clinikoSync = require('../services/cliniko-sync');
const { syncClinikoPatients } = require('../jobs/sync-cliniko-patients');
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

    // Verify the Cliniko patient exists, and pull demographics in the same call so
    // age/sex are populated immediately on link (needed for normative grounding).
    // COALESCE only fills blanks — never overwrites data already entered in Moveify.
    const cp = await cliniko.getPatient(clinikoPatientId);

    await db.query(
      'UPDATE users SET cliniko_patient_id = $1, dob = COALESCE(dob, $2), sex = COALESCE(sex, $3), cliniko_synced_at = NOW() WHERE id = $4',
      [clinikoPatientId, cp.date_of_birth || null, cp.sex || null, patientId]
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

    // applySync owns the field mapping + COALESCE UPDATE (email is never synced) —
    // shared with the scheduled auto-sync job so both paths behave identically.
    const fields = await clinikoSync.applySync(patientId, cp);

    audit.log(req, 'cliniko_sync', 'patient', parseInt(patientId), { clinikoPatientId: patient.cliniko_patient_id });
    res.json({ success: true, ...fields, clinikoSyncedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Cliniko sync error:', err);
    res.status(502).json({ error: 'Could not reach Cliniko. Please try again.' });
  }
});

// POST /api/cliniko/sync-all — on-demand run of the scheduled auto-sync job that
// refreshes every Cliniko-linked patient. Same work Cloud Scheduler triggers; this
// route is the admin/manual entry point (testing + a future "sync everyone" button).
router.post('/sync-all', requireAdmin, async (req, res) => {
  try {
    const stats = await syncClinikoPatients();
    audit.log(req, 'cliniko_sync_all', 'patient', null, stats);
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error('Cliniko sync-all error:', err);
    res.status(502).json({ error: 'Cliniko sync failed. Please try again.' });
  }
});

module.exports = router;
