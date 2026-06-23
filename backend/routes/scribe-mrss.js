const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { computeMrss } = require('../services/mrss-scoring');
const { generateMrssDocx } = require('../services/mrss-docx');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// Verify the session belongs to this clinician (mirrors the other scribe routes).
async function verifySession(sessionId, clinicianId) {
  const r = await db.query('SELECT id, clinician_id, patient_id FROM scribe_sessions WHERE id = $1', [sessionId]);
  if (r.rows.length === 0) return { status: 404, error: 'Session not found' };
  if (r.rows[0].clinician_id !== clinicianId) return { status: 403, error: 'Access denied' };
  return { session: r.rows[0] };
}

// Pull the stored component measurements + IKDC PROM score for the session. The
// MRSS is recomputed from these on every call (deterministic, ephemeral) — the
// client never supplies the scored values, only the involved-limb context.
async function gatherInputs(sessionId) {
  const meas = await db.query(
    `SELECT assessment_key, measure_key, side, value, value2, unit
     FROM scribe_session_measurements WHERE session_id = $1`,
    [sessionId]
  );
  const ikdc = await db.query(
    `SELECT score FROM scribe_session_outcomes WHERE session_id = $1 AND prom_key = 'ikdc' LIMIT 1`,
    [sessionId]
  );
  const ikdcScore = ikdc.rows.length && ikdc.rows[0].score != null ? Number(ikdc.rows[0].score) : null;
  return { rows: meas.rows, ikdcScore };
}

function parseOpts(body) {
  const involvedSide = body.involvedSide === 'right' ? 'right' : body.involvedSide === 'left' ? 'left' : null;
  return { involvedSide, involvedIsDominant: !!body.involvedIsDominant };
}

// POST /api/scribe/sessions/:sessionId/mrss/generate — score the MRSS from the
// session's stored components. Ephemeral — audit log only.
router.post('/:sessionId/mrss/generate', async (req, res) => {
  try {
    const v = await verifySession(req.params.sessionId, req.user.id);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const { involvedSide, involvedIsDominant } = parseOpts(req.body);
    if (!involvedSide) return res.status(400).json({ error: 'involvedSide must be "left" or "right"' });

    const { rows, ikdcScore } = await gatherInputs(v.session.id);
    const result = computeMrss({ rows, ikdcScore, involvedSide, involvedIsDominant });
    // Audit the outcome shape only — never the captured patient values.
    audit.log(req, 'mrss_generated', 'scribe_session', parseInt(req.params.sessionId), {
      involvedSide, involvedIsDominant, total: result.total, complete: result.complete,
    });
    res.json(result);
  } catch (err) {
    console.error('Generate MRSS error:', err.message);
    res.status(500).json({ error: 'Failed to score MRSS' });
  }
});

// POST /api/scribe/sessions/:sessionId/mrss/docx — printable score sheet.
// Recomputes server-side from stored components (authoritative). Ephemeral.
router.post('/:sessionId/mrss/docx', async (req, res) => {
  try {
    const v = await verifySession(req.params.sessionId, req.user.id);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const { involvedSide, involvedIsDominant } = parseOpts(req.body);
    if (!involvedSide) return res.status(400).json({ error: 'involvedSide must be "left" or "right"' });

    const { rows, ikdcScore } = await gatherInputs(v.session.id);
    const result = computeMrss({ rows, ikdcScore, involvedSide, involvedIsDominant });
    const buffer = await generateMrssDocx({
      result,
      patientName: req.body.patientName || 'Patient',
      assessmentDate: req.body.assessmentDate || '',
      confidentEager: !!req.body.confidentEager,
      preventionPlan: !!req.body.preventionPlan,
    });
    const safeName = (req.body.patientName || 'Patient').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    audit.log(req, 'mrss_docx_generated', 'scribe_session', parseInt(req.params.sessionId), { total: result.total });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="MRSS_${safeName}.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    console.error('Generate MRSS DOCX error:', err.message);
    res.status(500).json({ error: 'Failed to generate MRSS DOCX' });
  }
});

module.exports = router;
