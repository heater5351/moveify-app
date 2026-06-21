const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { generateHandout } = require('../services/scribe-llm');
const { generateHandoutDocx } = require('../services/scribe-handout-docx');
const { getPatientDemographics } = require('../services/scribe-demographics');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// POST /api/scribe/sessions/:sessionId/handout/generate
// Ephemeral — no content saved. Audit log only.
router.post('/:sessionId/handout/generate', async (req, res) => {
  try {
    const { transcript, patientFirstName, assessmentDate } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript required' });
    if (!patientFirstName) return res.status(400).json({ error: 'patientFirstName required' });
    if (!assessmentDate) return res.status(400).json({ error: 'assessmentDate required' });

    const session = await db.query(
      'SELECT id, clinician_id, patient_id FROM scribe_sessions WHERE id = $1',
      [req.params.sessionId]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    // Pull demographics for normative-data grounding (age/sex). Never logged.
    const demographics = await getPatientDemographics(session.rows[0].patient_id);

    // In-session structured measurements (tap-captured in the Assessment tab). When
    // present, these authoritative values build the objective findings table instead
    // of extracting it from the transcript. Best-effort — never block the handout.
    let measurementRows = [];
    try {
      const rows = await db.query(
        `SELECT assessment_key, measure_key, side, value, value2, unit
         FROM scribe_session_measurements WHERE session_id = $1 ORDER BY id ASC`,
        [req.params.sessionId]
      );
      measurementRows = rows.rows;
    } catch (err) {
      console.error('Handout measurement fetch failed (continuing without it):', err.message);
    }

    const { sections, model } = await generateHandout(transcript, patientFirstName, assessmentDate, demographics, measurementRows);
    const wordCount = transcript.split(/\s+/).length;
    audit.log(req, 'handout_generated', 'scribe_session', parseInt(req.params.sessionId), { wordCount, model });

    // Surface when age/sex was missing so the clinician knows the norm grounding was
    // skipped (the table falls back to neutral baselines rather than graded results).
    // Only matters when there were measured findings to ground.
    res.json({
      sections,
      model,
      grounding: {
        missingSex: !demographics.sex,
        missingAge: demographics.age == null,
        hasFindings: !!sections.clinicalContext,
      },
    });
  } catch (err) {
    console.error('Generate handout error:', err.message);
    res.status(500).json({ error: 'Failed to generate handout' });
  }
});

// POST /api/scribe/sessions/:sessionId/handout/docx
// Generate a DOCX from edited handout content. Ephemeral — nothing saved.
router.post('/:sessionId/handout/docx', async (req, res) => {
  try {
    const session = await db.query(
      'SELECT id, clinician_id FROM scribe_sessions WHERE id = $1',
      [req.params.sessionId]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const buffer = await generateHandoutDocx(req.body);
    const safeName = (req.body.patientFirstName || 'Patient').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    audit.log(req, 'handout_docx_generated', 'scribe_session', parseInt(req.params.sessionId), {});
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Handout_${safeName}.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    console.error('Generate handout DOCX error:', err.message);
    res.status(500).json({ error: 'Failed to generate handout DOCX' });
  }
});

module.exports = router;
