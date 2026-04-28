const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { decrypt } = require('../services/scribe-encryption');
const { generateReport } = require('../services/scribe-llm');
const { generateGPReportDocx } = require('../services/scribe-docx');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// GET /api/scribe/report-templates
router.get('/report-templates', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, type, name FROM report_templates ORDER BY id',
    );
    res.json({ templates: result.rows });
  } catch (err) {
    console.error('List report templates error:', err.message);
    res.status(500).json({ error: 'Failed to list report templates' });
  }
});

// POST /api/scribe/sessions/:id/report/generate
router.post('/sessions/:id/report/generate', async (req, res) => {
  try {
    const { type = 'cdmp', patientName, sessionDate } = req.body;

    const sessionResult = await db.query(
      'SELECT id, clinician_id FROM scribe_sessions WHERE id = $1',
      [req.params.id]
    );
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (sessionResult.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const noteResult = await db.query(
      'SELECT subjective_enc FROM soap_notes WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.id]
    );
    if (noteResult.rows.length === 0) return res.status(404).json({ error: 'No saved note for this session' });
    const noteContent = decrypt(noteResult.rows[0].subjective_enc);

    const templateResult = await db.query(
      'SELECT system_prompt FROM report_templates WHERE type = $1 AND is_default = true LIMIT 1',
      [type]
    );
    if (templateResult.rows.length === 0) return res.status(404).json({ error: 'Report template not found' });
    const systemPrompt = templateResult.rows[0].system_prompt;

    // patientName and sessionDate are substituted locally after the API returns —
    // they are never sent to AWS.
    const result = await generateReport(noteContent, systemPrompt);

    const substitute = (text) => (text || '')
      .replace(/\[PATIENT_NAME\]/g, patientName || '')
      .replace(/\[SESSION_DATE\]/g, sessionDate || '');

    const wordCount = noteContent.split(/\s+/).length;
    audit.log(req, 'report_generated', 'scribe_session', parseInt(req.params.id), { type, wordCount, model: result.model });

    res.json({
      sections: {
        executiveSummary:    substitute(result.executiveSummary),
        objectiveAssessment: substitute(result.objectiveAssessment),
        goals:               substitute(result.goals),
        managementPlan:      substitute(result.managementPlan),
      },
      model: result.model,
    });
  } catch (err) {
    console.error('Generate report error:', err.message);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// POST /api/scribe/sessions/:id/report/docx — generate DOCX from edited report content
router.post('/sessions/:id/report/docx', async (req, res) => {
  try {
    const sessionResult = await db.query(
      'SELECT id, clinician_id FROM scribe_sessions WHERE id = $1', [req.params.id]
    );
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (sessionResult.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const buffer = await generateGPReportDocx(req.body);
    const safeName = (req.body.patientName || 'Patient').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="GP_Report_${safeName}.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    console.error('Generate DOCX error:', err.message);
    res.status(500).json({ error: 'Failed to generate DOCX' });
  }
});

module.exports = router;
