const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { loadCatalog, findMeasure } = require('../services/assessment-catalog');
const { scoreInstrument, validateDetail } = require('../services/instrument-scoring');
const { aggregateTrials } = require('../services/measurement-trials');
const { buildSeries } = require('../services/measurement-series');
const { getPatientDemographics } = require('../services/scribe-demographics');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// Verify the session belongs to this clinician (mirrors scribe-soap-notes).
async function verifySession(sessionId, clinicianId) {
  const result = await db.query('SELECT id, clinician_id FROM scribe_sessions WHERE id = $1', [sessionId]);
  if (result.rows.length === 0) return null;
  if (result.rows[0].clinician_id !== clinicianId) return null;
  return result.rows[0];
}

// GET /api/scribe/assessment-catalog — static; drives the capture panel.
router.get('/assessment-catalog', (req, res) => {
  try {
    res.json({ assessments: loadCatalog().assessments });
  } catch (err) {
    console.error('Load assessment catalog error:', err.message);
    res.status(500).json({ error: 'Failed to load assessment catalog' });
  }
});

// GET /api/scribe/patients/:patientId/measurements — longitudinal trend series
// across all of a patient's sessions (any clinician; shared-access model).
router.get('/patients/:patientId/measurements', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT m.session_id, s.session_date, m.assessment_key, m.measure_key, m.side, m.value, m.value2, m.unit
       FROM scribe_session_measurements m
       JOIN scribe_sessions s ON m.session_id = s.id
       WHERE s.patient_id = $1
       ORDER BY s.session_date ASC, m.id ASC`,
      [req.params.patientId]
    );
    const { age = null, sex = null } = await getPatientDemographics(req.params.patientId);
    res.json({ series: buildSeries(rows.rows, age, sex) });
  } catch (err) {
    console.error('Get measurement series error:', err.message);
    res.status(500).json({ error: 'Failed to load measurement trends' });
  }
});

// GET /api/scribe/sessions/:sessionId/measurements
router.get('/sessions/:sessionId/measurements', async (req, res) => {
  try {
    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const result = await db.query(
      `SELECT id, assessment_key, side, measure_key, value, value2, unit, detail, recorded_at
       FROM scribe_session_measurements WHERE session_id = $1 ORDER BY id ASC`,
      [req.params.sessionId]
    );
    res.json({ measurements: result.rows.map(r => ({ ...r, value: Number(r.value), value2: r.value2 != null ? Number(r.value2) : null })) });
  } catch (err) {
    console.error('Get measurements error:', err.message);
    res.status(500).json({ error: 'Failed to get measurements' });
  }
});

// POST /api/scribe/sessions/:sessionId/measurements — upsert one tapped value
router.post('/sessions/:sessionId/measurements', async (req, res) => {
  try {
    const { assessmentKey, measureKey, side, value, value2 } = req.body;
    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const found = findMeasure(assessmentKey, measureKey);
    if (!found) return res.status(400).json({ error: 'Unknown assessment or measure' });
    const { assessment, measure } = found;

    // Laterality can be overridden per measure (e.g. cervical: flexion single,
    // rotation bilateral). Bilateral → left/right; single → 'bilateral'.
    const lat = measure.laterality || assessment.laterality;
    const allowedSides = lat === 'bilateral' ? ['left', 'right'] : ['bilateral'];
    const sideVal = lat === 'bilateral' ? side : 'bilateral';
    if (!allowedSides.includes(sideVal)) {
      return res.status(400).json({ error: 'Invalid side for this assessment' });
    }

    const inputMode = measure.input || 'keypad';
    let num, v2 = null, storeDetail = null;

    if (inputMode === 'instrument') {
      // Multi-item instrument (Berg / Mini-BEST): the client sends per-item scores;
      // the TOTAL is computed here (never trusted from the client) and graded.
      const inst = assessment.instrument;
      if (!inst) return res.status(400).json({ error: 'Not an instrument' });
      const err = validateDetail(inst.items, req.body.detail);
      if (err) return res.status(400).json({ error: err });
      num = scoreInstrument(inst.items, req.body.detail).total;
      storeDetail = req.body.detail;
    } else if (measure.trials && Array.isArray(req.body.trials)) {
      // Multi-trial numeric measure (HHD, grip, hops, SEBT): the client sends the raw
      // attempts; the aggregate is computed HERE (never trusted from the client) and
      // the raw trials are kept in detail. Mean/max per the measure's `aggregate`.
      const trials = req.body.trials.map(Number);
      const cap = Number(measure.trials) || 1;
      if (trials.length < 1 || trials.length > cap) {
        return res.status(400).json({ error: `Provide 1–${cap} trial values` });
      }
      if (trials.some(t => !Number.isFinite(t) || t < measure.min || t > measure.max)) {
        return res.status(400).json({ error: 'Trial value out of range' });
      }
      num = aggregateTrials(trials, measure.aggregate || 'mean');
      storeDetail = { trials, aggregate: measure.aggregate || 'mean' };
    } else {
      num = Number(value);
      if (!Number.isFinite(num)) return res.status(400).json({ error: 'Value must be a number' });
      if (inputMode === 'toggle') {
        const opts = (measure.options || []).map(o => o.value);
        if (!opts.includes(num)) return res.status(400).json({ error: 'Invalid option' });
      } else if (inputMode === 'compound') {
        if (num < measure.min || num > measure.max) return res.status(400).json({ error: 'Value out of range' });
        const d = Number(value2);
        if (!Number.isFinite(d)) return res.status(400).json({ error: 'Second value required' });
        const min2 = measure.min2 != null ? measure.min2 : measure.min;
        const max2 = measure.max2 != null ? measure.max2 : measure.max;
        if (d < min2 || d > max2) return res.status(400).json({ error: 'Second value out of range' });
        v2 = d;
      } else {
        if (num < measure.min || num > measure.max) return res.status(400).json({ error: 'Value out of range' });
      }
    }

    const result = await db.query(
      `INSERT INTO scribe_session_measurements (session_id, assessment_key, side, measure_key, value, value2, unit, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (session_id, assessment_key, side, measure_key)
       DO UPDATE SET value = EXCLUDED.value, value2 = EXCLUDED.value2, unit = EXCLUDED.unit, detail = EXCLUDED.detail, recorded_at = NOW()
       RETURNING id, assessment_key, side, measure_key, value, value2, unit, detail, recorded_at`,
      [req.params.sessionId, assessmentKey, sideVal, measureKey, num, v2, measure.unit, storeDetail ? JSON.stringify(storeDetail) : null]
    );
    const row = result.rows[0];
    // Audit which test was captured — never the value (it's health data).
    audit.log(req, 'measurement_recorded', 'scribe_session', Number(req.params.sessionId), { assessmentKey, measureKey, side: sideVal });
    res.json({ measurement: { ...row, value: Number(row.value), value2: row.value2 != null ? Number(row.value2) : null } });
  } catch (err) {
    console.error('Save measurement error:', err.message);
    res.status(500).json({ error: 'Failed to save measurement' });
  }
});

// DELETE /api/scribe/sessions/:sessionId/measurements/:measurementId
router.delete('/sessions/:sessionId/measurements/:measurementId', async (req, res) => {
  try {
    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    await db.query(
      'DELETE FROM scribe_session_measurements WHERE id = $1 AND session_id = $2',
      [req.params.measurementId, req.params.sessionId]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete measurement error:', err.message);
    res.status(500).json({ error: 'Failed to delete measurement' });
  }
});

module.exports = router;
