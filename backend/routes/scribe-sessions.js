const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/scribe-encryption');
const { updatePatientSummary, getPatientSummary } = require('../services/scribe-summary');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// Verify patient belongs to this clinician via junction table
async function verifyPatientAccess(clinicianId, patientId) {
  const result = await db.query(
    'SELECT 1 FROM clinician_patients WHERE clinician_id = $1 AND patient_id = $2',
    [clinicianId, patientId]
  );
  return result.rows.length > 0;
}

// POST /api/scribe/sessions
router.post('/', async (req, res) => {
  try {
    const { patientId } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId required' });

    const hasAccess = await verifyPatientAccess(req.user.id, patientId);
    if (!hasAccess) return res.status(404).json({ error: 'Patient not found' });

    const patientResult = await db.query(
      'SELECT id, name FROM users WHERE id = $1 AND role = $2',
      [patientId, 'patient']
    );
    if (patientResult.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    const patientName = patientResult.rows[0].name;
    const result = await db.query(
      `INSERT INTO scribe_sessions (clinician_id, patient_id, patient_name_enc, status)
       VALUES ($1, $2, $3, 'recording')
       RETURNING id, session_date, started_at, status`,
      [req.user.id, patientId, encrypt(patientName)]
    );
    const session = result.rows[0];
    audit.log(req, 'session_start', 'scribe_session', session.id);

    res.status(201).json({
      id: session.id,
      patientId,
      patientName,
      sessionDate: session.session_date,
      startedAt: session.started_at,
      status: session.status,
    });
  } catch (err) {
    console.error('Create session error:', err.message);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/scribe/sessions?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const result = await db.query(
      `SELECT id, patient_name_enc, patient_id, session_date, started_at, ended_at, status
       FROM scribe_sessions
       WHERE clinician_id = $1 AND session_date = $2
       ORDER BY started_at DESC`,
      [req.user.id, date]
    );
    res.json({
      sessions: result.rows.map(row => ({
        id: row.id,
        patientId: row.patient_id,
        patientName: decrypt(row.patient_name_enc),
        sessionDate: row.session_date,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        status: row.status,
      })),
      date,
    });
  } catch (err) {
    console.error('List sessions error:', err.message);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// GET /api/scribe/sessions/history
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const patientId = req.query.patientId ? parseInt(req.query.patientId) : null;

    const where = patientId
      ? 'WHERE s.clinician_id = $1 AND s.patient_id = $2'
      : 'WHERE s.clinician_id = $1';
    const params = patientId ? [req.user.id, patientId] : [req.user.id];

    const result = await db.query(
      `SELECT s.id, s.patient_name_enc, s.patient_id, s.session_date,
              s.started_at, s.ended_at, s.status,
              (SELECT COUNT(*) FROM soap_notes sn WHERE sn.session_id = s.id) AS has_note
       FROM scribe_sessions s
       ${where}
       ORDER BY s.started_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countResult = await db.query(
      `SELECT COUNT(*) FROM scribe_sessions ${where.replace(/s\./g, '')}`,
      params
    );
    res.json({
      sessions: result.rows.map(row => ({
        id: row.id,
        patientId: row.patient_id,
        patientName: decrypt(row.patient_name_enc),
        sessionDate: row.session_date,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        status: row.status,
        hasNote: parseInt(row.has_note) > 0,
      })),
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error('Session history error:', err.message);
    res.status(500).json({ error: 'Failed to get session history' });
  }
});

// DELETE /api/scribe/sessions/:id — draft only
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, clinician_id, status FROM scribe_sessions WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const row = result.rows[0];
    if (row.clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    if (row.status !== 'recording') return res.status(403).json({ error: 'Only draft sessions can be deleted' });

    await db.query('DELETE FROM transcripts WHERE session_id = $1', [req.params.id]);
    await db.query('DELETE FROM soap_notes WHERE session_id = $1', [req.params.id]);
    await db.query('DELETE FROM scribe_sessions WHERE id = $1', [req.params.id]);
    audit.log(req, 'session_deleted', 'scribe_session', row.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete session error:', err.message);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// POST /api/scribe/sessions/:id/revert-draft
router.post('/:id/revert-draft', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE scribe_sessions
       SET status = 'recording', ended_at = NULL, updated_at = NOW()
       WHERE id = $1 AND clinician_id = $2
         AND status IN ('review','completed')
         AND started_at > NOW() - INTERVAL '48 hours'
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      const check = await db.query(
        'SELECT clinician_id, status, started_at FROM scribe_sessions WHERE id = $1',
        [req.params.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
      if (check.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      const age = Date.now() - new Date(check.rows[0].started_at).getTime();
      if (age > 48 * 60 * 60 * 1000) return res.status(403).json({ error: 'Revert window expired (48 hours)' });
      return res.status(403).json({ error: 'Cannot revert this session to draft' });
    }
    audit.log(req, 'session_reverted_draft', 'scribe_session', result.rows[0].id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Revert draft error:', err.message);
    res.status(500).json({ error: 'Failed to revert session' });
  }
});

// GET /api/scribe/sessions/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, clinician_id, patient_name_enc, patient_id, session_date, started_at, ended_at, status FROM scribe_sessions WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const row = result.rows[0];
    if (row.clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    audit.log(req, 'session_viewed', 'scribe_session', row.id);
    res.json({
      id: row.id,
      patientId: row.patient_id,
      patientName: decrypt(row.patient_name_enc),
      sessionDate: row.session_date,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
    });
  } catch (err) {
    console.error('Get session error:', err.message);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// PATCH /api/scribe/sessions/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['recording','transcribing','generating','review','completed','discarded'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const endedAt = ['completed','discarded'].includes(status) ? new Date() : null;
    const result = await db.query(
      `UPDATE scribe_sessions SET status = $1, ended_at = COALESCE($2, ended_at), updated_at = NOW()
       WHERE id = $3 AND clinician_id = $4 RETURNING id, status`,
      [status, endedAt, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    audit.log(req, `session_${status}`, 'scribe_session', result.rows[0].id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update session status error:', err.message);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// POST /api/scribe/sessions/:id/complete
router.post('/:id/complete', async (req, res) => {
  try {
    const session = await db.query(
      `SELECT s.id, s.clinician_id, s.patient_id, sn.subjective_enc
       FROM scribe_sessions s
       LEFT JOIN soap_notes sn ON sn.session_id = s.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const row = session.rows[0];

    await db.query(
      "UPDATE scribe_sessions SET status = 'completed', ended_at = NOW(), updated_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    audit.log(req, 'session_completed', 'scribe_session', row.id);

    if (row.patient_id && row.subjective_enc) {
      const soapContent = decrypt(row.subjective_enc);
      updatePatientSummary(row.patient_id, soapContent, row.id)
        .catch(err => console.error('Summary generation failed:', err.message));
    }

    res.json({ ok: true, status: 'completed' });
  } catch (err) {
    console.error('Complete session error:', err.message);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// GET /api/scribe/sessions/patient/:patientId/summary
router.get('/patient/:patientId/summary', async (req, res) => {
  try {
    const hasAccess = await verifyPatientAccess(req.user.id, parseInt(req.params.patientId));
    if (!hasAccess) return res.status(404).json({ error: 'Patient not found' });

    const summary = await getPatientSummary(parseInt(req.params.patientId));
    if (!summary) return res.status(404).json({ error: 'No summary for this patient' });

    audit.log(req, 'patient_summary_viewed', 'patient_summary', parseInt(req.params.patientId));
    res.json(summary);
  } catch (err) {
    console.error('Get patient summary error:', err.message);
    res.status(500).json({ error: 'Failed to get patient summary' });
  }
});

module.exports = router;
