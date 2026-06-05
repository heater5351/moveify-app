const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { decrypt } = require('../services/scribe-encryption');
const { generateReassessment, regenerateNarrative, regradeComparison } = require('../services/scribe-reassessment');
const { generateReassessmentDocx } = require('../services/scribe-reassessment-docx');
const { generateGPReassessmentDocx } = require('../services/scribe-gp-reassessment-docx');
const { getPatientDemographics } = require('../services/scribe-demographics');

// Substitute the [PATIENT_NAME] placeholder used by the GP narrative (kept off the
// wire to AWS) with the real name, server-side. Applies to the GP narrative fields.
function fillName(obj, name) {
  const sub = s => (s || '').replace(/\[PATIENT_NAME\]/g, name || '');
  return {
    executiveSummary: sub(obj.executiveSummary),
    clinicalInterpretation: sub(obj.clinicalInterpretation),
    recommendations: sub(obj.recommendations),
  };
}
async function patientName(patientId) {
  try {
    const r = await db.query('SELECT name FROM users WHERE id = $1', [patientId]);
    return r.rows[0] ? r.rows[0].name : '';
  } catch { return ''; }
}
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
    const { baselineSessionId, audience = 'patient', previousReportText } = req.body;
    let { currentSourceText } = req.body;
    const hasReport = !!(previousReportText && previousReportText.trim());
    if (!baselineSessionId && !hasReport) {
      return res.status(400).json({ error: 'Select a baseline session or provide a previous report.' });
    }

    // Current session (this :sessionId) is always required.
    const current = (await db.query(
      'SELECT id, clinician_id, patient_id FROM scribe_sessions WHERE id = $1', [req.params.sessionId]
    )).rows[0];
    if (!current) return res.status(404).json({ error: 'Session not found' });
    if (current.clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    // Build the baseline source: a prior session's note and/or an uploaded report.
    let baselineSourceText = '';
    if (baselineSessionId) {
      const baseline = (await db.query(
        'SELECT id, clinician_id, patient_id FROM scribe_sessions WHERE id = $1', [parseInt(baselineSessionId)]
      )).rows[0];
      if (!baseline) return res.status(404).json({ error: 'Baseline session not found' });
      if (baseline.clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      if (baseline.patient_id !== current.patient_id) {
        return res.status(400).json({ error: 'Both sessions must belong to the same patient' });
      }
      baselineSourceText = await getSessionSource(baseline.id);
    }
    if (hasReport) {
      const report = previousReportText.trim();
      baselineSourceText = baselineSourceText
        ? `${baselineSourceText}\n\n--- Additional previous report supplied by the clinician ---\n${report}`
        : report;
    }

    if (!currentSourceText) currentSourceText = await getSessionSource(current.id);
    if (!baselineSourceText) {
      return res.status(422).json({ error: 'No baseline to compare against — the baseline session has no saved note. Select a session with a note, or upload/paste the previous report.' });
    }
    if (!currentSourceText) {
      return res.status(422).json({ error: 'No transcript or saved note for the current session.' });
    }

    const demographics = await getPatientDemographics(current.patient_id);
    const result = await generateReassessment(baselineSourceText, currentSourceText, demographics, { audience });

    // GP narrative names the patient via a placeholder kept off the wire — fill it here.
    if (audience === 'gp') {
      const name = await patientName(current.patient_id);
      Object.assign(result, fillName(result, name));
    }

    audit.log(req, 'reassessment_generated', 'scribe_session', parseInt(req.params.sessionId), {
      audience, baselineSessionId: baselineSessionId ? parseInt(baselineSessionId) : null, usedReport: hasReport, ...result.counts,
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

// POST /api/scribe/sessions/:sessionId/reassessment/regrade
// Re-grade an EDITED comparison table — recompute Change + What-it-means from each
// row's values (e.g. after the clinician fills in a baseline the note missed).
// Deterministic, no LLM. Ephemeral — audit log only.
router.post('/:sessionId/reassessment/regrade', async (req, res) => {
  try {
    const { comparison, audience = 'patient' } = req.body;
    if (!comparison) return res.status(400).json({ error: 'comparison required' });

    const session = await db.query(
      'SELECT id, clinician_id, patient_id FROM scribe_sessions WHERE id = $1', [req.params.sessionId]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const demographics = await getPatientDemographics(session.rows[0].patient_id);
    const regraded = regradeComparison(comparison, demographics.age ?? null, demographics.sex ?? null, audience);
    audit.log(req, 'reassessment_regraded', 'scribe_session', parseInt(req.params.sessionId), {});
    res.json({
      comparison: regraded,
      grounding: { missingSex: !demographics.sex, missingAge: demographics.age == null, hasFindings: true },
    });
  } catch (err) {
    console.error('Regrade reassessment error:', err.message);
    res.status(500).json({ error: 'Failed to re-grade results' });
  }
});

// POST /api/scribe/sessions/:sessionId/reassessment/narrative
// Re-write only the narrative from an EDITED comparison table (+ the original
// goals/pain context), without re-reading the notes. Ephemeral — audit log only.
router.post('/:sessionId/reassessment/narrative', async (req, res) => {
  try {
    const { comparison, subjectiveContext, audience = 'patient' } = req.body;
    if (!comparison) return res.status(400).json({ error: 'comparison required' });

    const session = await db.query(
      'SELECT id, clinician_id, patient_id FROM scribe_sessions WHERE id = $1', [req.params.sessionId]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    let out = await regenerateNarrative(comparison, subjectiveContext || '', audience);
    if (audience === 'gp') out = fillName(out, await patientName(session.rows[0].patient_id));
    audit.log(req, 'reassessment_narrative_regenerated', 'scribe_session', parseInt(req.params.sessionId), { audience });
    res.json(out);
  } catch (err) {
    console.error('Regenerate reassessment narrative error:', err.message);
    res.status(500).json({ error: 'Failed to regenerate narrative' });
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

    const isGp = req.body.variant === 'gp';
    const buffer = isGp ? await generateGPReassessmentDocx(req.body) : await generateReassessmentDocx(req.body);
    const safeName = (req.body.patientName || req.body.patientFirstName || 'Patient').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    audit.log(req, 'reassessment_docx_generated', 'scribe_session', parseInt(req.params.sessionId), { variant: req.body.variant || 'patient' });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${isGp ? 'GP_Reassessment' : 'Reassessment'}_${safeName}.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    console.error('Generate reassessment DOCX error:', err.message);
    res.status(500).json({ error: 'Failed to generate reassessment DOCX' });
  }
});

module.exports = router;
