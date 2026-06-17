const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { encrypt } = require('../services/scribe-encryption');
const { loadProms, getProm } = require('../services/prom-catalog');
const { scoreProm, validateResponses } = require('../services/prom-scoring');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

async function verifySession(sessionId, clinicianId) {
  const r = await db.query('SELECT id, clinician_id, patient_id FROM scribe_sessions WHERE id = $1', [sessionId]);
  if (r.rows.length === 0 || r.rows[0].clinician_id !== clinicianId) return null;
  return r.rows[0];
}

// ── Kiosk PIN (gates leaving the patient-facing kiosk) ───────────────────────
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(pin), salt, 32).toString('hex')}`;
}
function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const a = Buffer.from(h, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GET /api/scribe/prom-catalog
router.get('/prom-catalog', (req, res) => {
  try {
    res.json({ proms: loadProms().proms });
  } catch (err) {
    console.error('Load PROM catalog error:', err.message);
    res.status(500).json({ error: 'Failed to load PROM catalog' });
  }
});

// GET /api/scribe/kiosk-pin → whether this clinician has set one
router.get('/kiosk-pin', async (req, res) => {
  try {
    const r = await db.query('SELECT kiosk_pin_hash FROM clinician_preferences WHERE user_id = $1', [req.user.id]);
    res.json({ set: !!(r.rows[0] && r.rows[0].kiosk_pin_hash) });
  } catch (err) {
    console.error('Get kiosk pin error:', err.message);
    res.status(500).json({ error: 'Failed to read kiosk PIN' });
  }
});

// POST /api/scribe/kiosk-pin  { pin }
router.post('/kiosk-pin', async (req, res) => {
  try {
    const pin = String(req.body.pin || '');
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4–6 digits' });
    // Ensure a prefs row exists (seed the default prompt on first insert; only the
    // PIN is touched on conflict so an existing custom prompt is preserved).
    const tmpl = await db.query("SELECT system_prompt FROM soap_templates WHERE is_default = true LIMIT 1");
    const defaultPrompt = tmpl.rows[0]?.system_prompt || 'Exercise physiology SOAP note.';
    await db.query(
      `INSERT INTO clinician_preferences (user_id, system_prompt_enc, kiosk_pin_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET kiosk_pin_hash = $3, updated_at = NOW()`,
      [req.user.id, encrypt(defaultPrompt), hashPin(pin)]
    );
    audit.log(req, 'kiosk_pin_set', 'scribe_preferences', null);
    res.json({ ok: true });
  } catch (err) {
    console.error('Set kiosk pin error:', err.message);
    res.status(500).json({ error: 'Failed to set kiosk PIN' });
  }
});

// POST /api/scribe/kiosk-pin/verify  { pin }
router.post('/kiosk-pin/verify', async (req, res) => {
  try {
    const r = await db.query('SELECT kiosk_pin_hash FROM clinician_preferences WHERE user_id = $1', [req.user.id]);
    const ok = verifyPin(String(req.body.pin || ''), r.rows[0] && r.rows[0].kiosk_pin_hash);
    res.json({ ok });
  } catch (err) {
    console.error('Verify kiosk pin error:', err.message);
    res.status(500).json({ error: 'Failed to verify kiosk PIN' });
  }
});

// POST /api/scribe/sessions/:sessionId/outcomes  { promKey, responses }
// The patient completes this in the kiosk; the score is computed HERE (authoritative).
router.post('/sessions/:sessionId/outcomes', async (req, res) => {
  try {
    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { promKey, responses } = req.body;
    const prom = getProm(promKey);
    if (!prom) return res.status(400).json({ error: 'Unknown outcome measure' });
    const err = validateResponses(prom, responses);
    if (err) return res.status(400).json({ error: err });

    const { score, band } = scoreProm(prom, responses);

    const result = await db.query(
      `INSERT INTO scribe_session_outcomes (session_id, patient_id, prom_key, responses_enc, score, score_band)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, prom_key)
       DO UPDATE SET responses_enc = EXCLUDED.responses_enc, score = EXCLUDED.score, score_band = EXCLUDED.score_band, completed_at = NOW()
       RETURNING id, completed_at`,
      [session.id, session.patient_id, promKey, encrypt(JSON.stringify(responses)), score, band]
    );
    // Audit which PROM was completed — never the raw responses (sensitive self-report).
    audit.log(req, 'prom_completed', 'scribe_session', session.id, { promKey });
    res.json({ id: result.rows[0].id, promKey, score, band, completedAt: result.rows[0].completed_at });
  } catch (err) {
    console.error('Submit outcome error:', err.message);
    res.status(500).json({ error: 'Failed to save outcome measure' });
  }
});

// GET /api/scribe/sessions/:sessionId/outcomes — score+band only (no raw responses)
router.get('/sessions/:sessionId/outcomes', async (req, res) => {
  try {
    const session = await verifySession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const r = await db.query(
      `SELECT prom_key, score, score_band, completed_at FROM scribe_session_outcomes WHERE session_id = $1 ORDER BY id ASC`,
      [req.params.sessionId]
    );
    res.json({ outcomes: r.rows.map(o => ({ promKey: o.prom_key, score: o.score != null ? Number(o.score) : null, band: o.score_band, completedAt: o.completed_at })) });
  } catch (err) {
    console.error('Get outcomes error:', err.message);
    res.status(500).json({ error: 'Failed to load outcomes' });
  }
});

// GET /api/scribe/patients/:patientId/outcomes — longitudinal score series per PROM
router.get('/patients/:patientId/outcomes', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT o.prom_key, o.score, o.score_band, s.session_date
       FROM scribe_session_outcomes o JOIN scribe_sessions s ON o.session_id = s.id
       WHERE o.patient_id = $1 ORDER BY s.session_date ASC, o.id ASC`,
      [req.params.patientId]
    );
    const byProm = new Map();
    for (const row of r.rows) {
      if (!byProm.has(row.prom_key)) byProm.set(row.prom_key, []);
      byProm.get(row.prom_key).push({ date: row.session_date, score: row.score != null ? Number(row.score) : null, band: row.score_band });
    }
    const series = [...byProm.entries()].map(([promKey, points]) => {
      const prom = getProm(promKey);
      return { promKey, name: prom ? (prom.shortName || prom.name) : promKey, higherIsBetter: prom ? !!prom.higherIsBetter : null, points };
    });
    res.json({ series });
  } catch (err) {
    console.error('Get outcome series error:', err.message);
    res.status(500).json({ error: 'Failed to load outcome trends' });
  }
});

module.exports = router;
