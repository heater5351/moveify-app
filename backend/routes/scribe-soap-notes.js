const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/scribe-encryption');
const { generateSoapNote } = require('../services/scribe-llm');
const { getPatientSummary } = require('../services/scribe-summary');
const { renderProgramDiff } = require('../services/program-diff');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// Verify session belongs to this clinician
async function verifySession(sessionId, clinicianId) {
  const result = await db.query(
    'SELECT id, clinician_id, patient_id, started_at, ended_at FROM scribe_sessions WHERE id = $1',
    [sessionId]
  );
  if (result.rows.length === 0) return null;
  if (result.rows[0].clinician_id !== clinicianId) return null;
  return result.rows[0];
}

// GET /api/scribe/sessions/:sessionId/transcript
router.get('/:sessionId/transcript', async (req, res) => {
  try {
    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (Date.now() - new Date(session.started_at).getTime() > 48 * 60 * 60 * 1000) {
      await db.query('DELETE FROM transcripts WHERE session_id = $1', [req.params.sessionId]);
      return res.status(410).json({ expired: true, error: 'Transcript expired after 48 hours' });
    }

    const result = await db.query(
      'SELECT id, content_enc, word_count, duration_secs, created_at FROM transcripts WHERE session_id = $1',
      [req.params.sessionId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No transcript for this session' });

    const t = result.rows[0];
    audit.log(req, 'transcript_viewed', 'transcript', t.id);
    res.json({
      id: t.id,
      content: decrypt(t.content_enc),
      wordCount: t.word_count,
      durationSecs: t.duration_secs,
      createdAt: t.created_at,
    });
  } catch (err) {
    console.error('Get transcript error:', err.message);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

// GET /api/scribe/sessions/:sessionId/soap-note
router.get('/:sessionId/soap-note', async (req, res) => {
  try {
    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const result = await db.query(
      `SELECT id, subjective_enc, version, generated_by, llm_model, created_at, updated_at
       FROM soap_notes WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
      [req.params.sessionId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No SOAP note for this session' });

    const note = result.rows[0];
    audit.log(req, 'soap_note_viewed', 'soap_note', note.id);
    res.json({
      id: note.id,
      content: decrypt(note.subjective_enc),
      version: note.version,
      generatedBy: note.generated_by,
      llmModel: note.llm_model,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    });
  } catch (err) {
    console.error('Get SOAP note error:', err.message);
    res.status(500).json({ error: 'Failed to get SOAP note' });
  }
});

// POST /api/scribe/sessions/:sessionId/transcript — save draft transcript without generating note
router.post('/:sessionId/transcript', async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript required' });
    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const wordCount = transcript.split(/\s+/).length;
    await db.query(
      `INSERT INTO transcripts (session_id, content_enc, word_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO UPDATE SET content_enc = $2, word_count = $3`,
      [req.params.sessionId, encrypt(transcript), wordCount]
    );
    res.json({ saved: true });
  } catch (err) {
    console.error('Save transcript error:', err.message);
    res.status(500).json({ error: 'Failed to save transcript' });
  }
});

// POST /api/scribe/sessions/:sessionId/soap-note/generate
router.post('/:sessionId/soap-note/generate', async (req, res) => {
  try {
    const { transcript, useHistory } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript required' });

    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await db.query(
      "UPDATE scribe_sessions SET status = 'generating', updated_at = NOW() WHERE id = $1",
      [req.params.sessionId]
    );

    const wordCount = transcript.split(/\s+/).length;
    await db.query(
      `INSERT INTO transcripts (session_id, content_enc, word_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO UPDATE SET content_enc = $2, word_count = $3`,
      [req.params.sessionId, encrypt(transcript), wordCount]
    );

    const prefResult = await db.query(
      'SELECT system_prompt_enc FROM clinician_preferences WHERE user_id = $1',
      [req.user.id]
    );
    const customPrompt = prefResult.rows.length > 0 ? decrypt(prefResult.rows[0].system_prompt_enc) : undefined;

    // Prior-note context: rolling summary + most recent completed prior note.
    // Default on; client sends useHistory: false for a "fresh note". Failures here
    // degrade to a history-free generation — never block the note.
    let priorContext = null;
    if (useHistory !== false) {
      try {
        const [summary, lastNoteRes] = await Promise.all([
          getPatientSummary(session.patient_id),
          db.query(
            `SELECT sn.subjective_enc, ss.session_date
             FROM soap_notes sn JOIN scribe_sessions ss ON sn.session_id = ss.id
             WHERE ss.patient_id = $1 AND ss.id <> $2 AND ss.status = 'completed'
             ORDER BY sn.created_at DESC LIMIT 1`,
            [session.patient_id, session.id]
          ),
        ]);
        const lastNoteRow = lastNoteRes.rows[0];
        if (summary || lastNoteRow) {
          priorContext = {
            summary: summary ? summary.summary : undefined,
            sessionCount: summary ? summary.sessionCount : undefined,
            lastNote: lastNoteRow ? decrypt(lastNoteRow.subjective_enc) : undefined,
            lastNoteDaysAgo: lastNoteRow
              ? Math.max(0, Math.round((Date.now() - new Date(lastNoteRow.session_date).getTime()) / 86400000))
              : undefined,
          };
        }
      } catch (err) {
        console.error('Prior-context fetch failed (continuing without history):', err.message);
      }
    }

    // Program changes made around this session (write-time link OR time-window
    // sweep — covers edits made shortly before recording started). Best-effort.
    let programDiff = [];
    try {
      const revisions = await db.query(
        `SELECT snapshot_before, snapshot_after FROM program_revisions
         WHERE patient_id = $1
           AND (scribe_session_id = $2
                OR (changed_at >= $3::timestamptz - INTERVAL '30 minutes'
                    AND changed_at <= COALESCE($4::timestamptz + INTERVAL '60 minutes', NOW())))
         ORDER BY changed_at ASC`,
        [session.patient_id, session.id, session.started_at, session.ended_at]
      );
      for (const r of revisions.rows) {
        programDiff.push(...renderProgramDiff(r.snapshot_before, r.snapshot_after));
      }
    } catch (err) {
      console.error('Program-diff fetch failed (continuing without it):', err.message);
    }

    const { content, model } = await generateSoapNote({ transcript, priorContext, programDiff }, customPrompt);

    const result = await db.query(
      `INSERT INTO soap_notes (session_id, subjective_enc, generated_by, llm_model)
       VALUES ($1, $2, 'llm', $3)
       RETURNING id, version, created_at`,
      [req.params.sessionId, encrypt(content), model]
    );

    await db.query(
      "UPDATE scribe_sessions SET status = 'recording', updated_at = NOW() WHERE id = $1",
      [req.params.sessionId]
    );

    audit.log(req, 'soap_note_generated', 'soap_note', result.rows[0].id, { model, wordCount, historyUsed: !!priorContext, programChanges: programDiff.length });

    res.status(201).json({
      id: result.rows[0].id,
      content,
      version: result.rows[0].version,
      model,
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    console.error('Generate SOAP note error:', err.message);
    // Reset status so the session remains actionable as a draft
    await db.query(
      "UPDATE scribe_sessions SET status = 'recording', updated_at = NOW() WHERE id = $1",
      [req.params.sessionId]
    ).catch(() => {});
    res.status(500).json({ error: 'Failed to generate SOAP note' });
  }
});

// POST /api/scribe/sessions/:sessionId/soap-note — save/update note content
router.post('/:sessionId/soap-note', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const existing = await db.query(
      'SELECT id, version, subjective_enc FROM soap_notes WHERE session_id = $1 ORDER BY version DESC LIMIT 1',
      [req.params.sessionId]
    );

    if (existing.rows.length > 0) {
      const note = existing.rows[0];
      const newVersion = note.version + 1;
      await db.query(
        'INSERT INTO soap_note_versions (soap_note_id, version, subjective_enc, edited_by) VALUES ($1, $2, $3, $4)',
        [note.id, note.version, note.subjective_enc, req.user.id]
      );
      await db.query(
        'UPDATE soap_notes SET subjective_enc = $1, version = $2, updated_at = NOW() WHERE id = $3',
        [encrypt(content), newVersion, note.id]
      );
      audit.log(req, 'soap_note_edited', 'soap_note', note.id, { version: newVersion });
      res.json({ id: note.id, version: newVersion });
    } else {
      const result = await db.query(
        `INSERT INTO soap_notes (session_id, subjective_enc, generated_by)
         VALUES ($1, $2, 'manual') RETURNING id, version, created_at`,
        [req.params.sessionId, encrypt(content)]
      );
      audit.log(req, 'soap_note_created', 'soap_note', result.rows[0].id);
      res.status(201).json({ id: result.rows[0].id, version: result.rows[0].version });
    }
  } catch (err) {
    console.error('Save SOAP note error:', err.message);
    res.status(500).json({ error: 'Failed to save SOAP note' });
  }
});

// POST /api/scribe/sessions/:sessionId/soap-note/copy — audit only
router.post('/:sessionId/soap-note/copy', async (req, res) => {
  try {
    const note = await db.query(
      `SELECT sn.id FROM soap_notes sn JOIN scribe_sessions ss ON sn.session_id = ss.id
       WHERE sn.session_id = $1 AND ss.clinician_id = $2`,
      [req.params.sessionId, req.user.id]
    );
    if (note.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
    audit.log(req, 'soap_note_copied', 'soap_note', note.rows[0].id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Copy audit error:', err.message);
    res.status(500).json({ error: 'Failed to log copy' });
  }
});

module.exports = router;
