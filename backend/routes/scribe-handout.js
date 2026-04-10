const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { generateHandout } = require('../services/scribe-llm');
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
      'SELECT id, clinician_id FROM scribe_sessions WHERE id = $1',
      [req.params.sessionId]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].clinician_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const { sections, model } = await generateHandout(transcript, patientFirstName, assessmentDate);
    const wordCount = transcript.split(/\s+/).length;
    audit.log(req, 'handout_generated', 'scribe_session', parseInt(req.params.sessionId), { wordCount, model });

    res.json({ sections, model });
  } catch (err) {
    console.error('Generate handout error:', err.message);
    res.status(500).json({ error: 'Failed to generate handout' });
  }
});

module.exports = router;
