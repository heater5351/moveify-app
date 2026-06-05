const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { decrypt } = require('../services/scribe-encryption');
const { generateReassessment } = require('../services/scribe-reassessment');
const { generateReassessmentDocx } = require('../services/scribe-reassessment-docx');
const { getPatientDemographics } = require('../services/scribe-demographics');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// Fetch the source text for a session, transcript-first (purged 48h after the
// session), falling back to the saved SOAP note's full content. Returns '' if
// neither is available. The note column is named subjective_enc for legacy
// reasons but holds the entire note incl. the Objective/measurements section.
async function getSessionSource(sessionId) {
  const sess = await db.query('SELECT started_at FROM scribe_sessions WHERE id = $1', [sessionId]);
  if (sess.rows.length === 0) return '';
  const fresh = Date.now() - new Date(sess.rows[0].started_at).getTime() <= 48 * 60 * 60 * 1000;
  if (fresh) {
    const t = await db.query('SELECT content_enc FROM transcripts WHERE session_id = $1', [sessionId]);
    if (t.rows.length && t.rows[0].content_enc) return decrypt(t.rows[0].content_enc);
  }
  const n = await db.query(
    'SELECT subjective_enc FROM soap_notes WHERE session_id = $1 ORDER BY version DESC LIMIT 1',
    [sessionId]
  );
  if (n.rows.length && n.rows[0].subjective_enc) return decrypt(n.rows[0].subjective_enc);
  return '';
}

// POST /api/scribe/sessions/:sessionId/reassessment/generate
// Compare a baseline session against this (latest) session. Ephemeral — nothing
// saved. Audit log only. Body: { baselineSessionId, currentSourceText? }.
router.post('/:sessionId/reassessment/generate', async (req, res) => {
  try {
    const { baselineSessionId } = req.body;
    let { currentSourceText } = req.body;
    if (!baselineSessionId) return res.status(400).json({ error: 'baselineSessionId required' });

    const both = await db.query(
      'SELECT id, clinician_id, patient_id FROM scribe_sessions WHERE id = ANY($1::int[])',
      [[parseInt(req.params.sessionId), parseInt(baselineSessionId)]]
    );
    const current = both.rows.find(s => s.id === parseInt(req.params.sessionId));
    const baseline = both.rows.find(s => s.id === parseInt(baselineSessionId));
    if (!current || !baseline) return res.status(404).json({ error: 'Session not found' });
    if (current.clinician_id !== req.user.id || baseline.clinician_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (current.patient_id !== baseline.patient_id) {
      return res.status(400).json({ error: 'Both sessions must belong to the same patient' });
    }

    // Current source: prefer the caller-supplied text (the client already resolves
    // transcript→note); otherwise resolve it server-side. Baseline is always
    // resolved server-side (its transcript is long purged → saved note).
    if (!currentSourceText) currentSourceText = await getSessionSource(current.id);
    const baselineSourceText = await getSessionSource(baseline.id);
    if (!baselineSourceText) {
      return res.status(422).json({ error: 'The baseline session has no saved note to compare against. Save a SOAP note on that session first.' });
    }
    if (!currentSourceText) {
      return res.status(422).json({ error: 'No transcript or saved note for the current session.' });
    }

    const demographics = await getPatientDemographics(current.patient_id);
    const result = await generateReassessment(baselineSourceText, currentSourceText, demographics);
    audit.log(req, 'reassessment_generated', 'scribe_session', parseInt(req.params.sessionId), {
      baselineSessionId: parseInt(baselineSessionId), ...result.counts,
    });

    res.json({
      ...result,
      grounding: {
        missingSex: !demographics.sex,
        missingAge: demographics.age == null,
        hasFindings: result.counts.matched > 0 || result.counts.new > 0,
      },
    });
  } catch (err) {
    console.error('Generate reassessment error:', err.message);
    res.status(500).json({ error: 'Failed to generate reassessment' });
  }
});

// POST /api/scribe/sessions/:sessionId/reassessment/docx
// Generate a DOCX from edited reassessment content. Ephemeral — nothing saved.
router.post('/:sessionId/reassessment/docx', async (req, res) => {
  try {
    const session = await db.query(
      'SELECT id, clinician_id FROM scribe_sessions WHERE id = $1', [req.params.sessionId]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const buffer = await generateReassessmentDocx(req.body);
    const safeName = (req.body.patientFirstName || 'Patient').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    audit.log(req, 'reassessment_docx_generated', 'scribe_session', parseInt(req.params.sessionId), {});
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Reassessment_${safeName}.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    console.error('Generate reassessment DOCX error:', err.message);
    res.status(500).json({ error: 'Failed to generate reassessment DOCX' });
  }
});

module.exports = router;
