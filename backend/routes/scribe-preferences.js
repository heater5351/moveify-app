const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/scribe-encryption');
const { generateSoapNote } = require('../services/scribe-llm');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

const TEST_TRANSCRIPT = `Clinician: Good morning Sarah, how have you been since our last session?
Patient: Yeah not bad, the knee's been feeling a lot better actually. I've been doing those exercises you gave me most days.
Clinician: How many times a week would you say?
Patient: Probably four or five times. The quad sets and the bridges are fine but the single leg squats are still a bit painful.
Clinician: Where exactly are you feeling the pain?
Patient: It's like a sharp pain just below my kneecap, maybe a 4 out of 10. It's worse going down stairs.
Clinician: Can you do a single leg squat for me? Good, I can see your knee is tracking inward a bit. Range of motion is looking good, I'd say you're at about 130 degrees flexion now, up from 120 last session.
Patient: Oh that's good. I've also been walking more, doing about 6000 steps a day now.
Clinician: Excellent progress. Let's add some step-downs and increase the resistance on your leg press. We'll keep the home exercises but bump up to 3 sets instead of 2. I'd like to see you again in two weeks.`;

// GET /api/scribe/preferences
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT system_prompt_enc, discipline, updated_at FROM clinician_preferences WHERE user_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      const template = await db.query(
        'SELECT system_prompt, discipline FROM soap_templates WHERE is_default = true LIMIT 1'
      );
      return res.json({
        systemPrompt: template.rows[0]?.system_prompt || '',
        discipline: template.rows[0]?.discipline || 'exercise_physiology',
        isDefault: true,
      });
    }
    res.json({
      systemPrompt: decrypt(result.rows[0].system_prompt_enc),
      discipline: result.rows[0].discipline,
      updatedAt: result.rows[0].updated_at,
      isDefault: false,
    });
  } catch (err) {
    console.error('Get preferences error:', err.message);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// PUT /api/scribe/preferences
router.put('/', async (req, res) => {
  try {
    const { systemPrompt, discipline } = req.body;
    if (!systemPrompt || systemPrompt.trim().length < 10)
      return res.status(400).json({ error: 'System prompt must be at least 10 characters' });
    if (systemPrompt.length > 5000)
      return res.status(400).json({ error: 'System prompt must be under 5000 characters' });

    const disc = discipline || 'exercise_physiology';
    const enc = encrypt(systemPrompt);

    await db.query(
      `INSERT INTO clinician_preferences (user_id, system_prompt_enc, discipline)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET system_prompt_enc = $2, discipline = $3, updated_at = NOW()`,
      [req.user.id, enc, disc]
    );
    await db.query(
      'INSERT INTO prompt_versions (user_id, system_prompt_enc, discipline) VALUES ($1, $2, $3)',
      [req.user.id, enc, disc]
    );
    audit.log(req, 'preferences_updated', 'scribe_preferences', null, { discipline: disc, promptLength: systemPrompt.length });
    res.json({ ok: true });
  } catch (err) {
    console.error('Save preferences error:', err.message);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// GET /api/scribe/preferences/versions
router.get('/versions', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, discipline, created_at FROM prompt_versions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json(result.rows.map(r => ({ id: r.id, discipline: r.discipline, createdAt: r.created_at })));
  } catch (err) {
    console.error('Get versions error:', err.message);
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

// GET /api/scribe/preferences/versions/:id
router.get('/versions/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, system_prompt_enc, discipline, created_at FROM prompt_versions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Version not found' });
    const row = result.rows[0];
    res.json({ id: row.id, systemPrompt: decrypt(row.system_prompt_enc), discipline: row.discipline, createdAt: row.created_at });
  } catch (err) {
    console.error('Get version error:', err.message);
    res.status(500).json({ error: 'Failed to get version' });
  }
});

// POST /api/scribe/preferences/test
router.post('/test', async (req, res) => {
  try {
    const { systemPrompt } = req.body;
    if (!systemPrompt || systemPrompt.trim().length < 10)
      return res.status(400).json({ error: 'System prompt required' });
    const { content, model } = await generateSoapNote(TEST_TRANSCRIPT, systemPrompt);
    audit.log(req, 'prompt_test', 'scribe_preferences', null, { model, promptLength: systemPrompt.length });
    res.json({ content, model, transcript: TEST_TRANSCRIPT });
  } catch (err) {
    console.error('Test prompt error:', err.message);
    res.status(500).json({ error: 'Failed to test prompt' });
  }
});

// GET /api/scribe/preferences/templates
router.get('/templates', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, discipline, system_prompt, is_default FROM soap_templates ORDER BY is_default DESC, name ASC'
    );
    res.json(result.rows.map(r => ({
      id: r.id, name: r.name, discipline: r.discipline, systemPrompt: r.system_prompt, isDefault: r.is_default,
    })));
  } catch (err) {
    console.error('Get templates error:', err.message);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

module.exports = router;
