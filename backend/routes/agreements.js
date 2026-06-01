// Service-agreement sign-up automation.
//
// Flow: a clinician mints a one-time tokenised link (POST /generate) for a
// Cliniko patient + chosen tier/path/start-date. The patient opens the link,
// reads Part A, and signs (POST /:token/sign). On signing, the backend renders
// the signed PDF into Cliniko, then asks the billing-worker to open a Stripe
// setup-mode Checkout and returns its URL for the patient to authorise a Direct
// Debit / card. The checkout.session.completed webhook (worker) then builds the
// self-capping Subscription Schedule / rolling subscription.
//
// Gated behind AGREEMENT_AUTOMATION_ENABLED so it ships dormant. Public routes
// (validate/sign) are rate-limited via the auth limiter in server.js.
const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const audit = require('../services/audit');
const cliniko = require('../services/cliniko');
const { renderAgreementPdf } = require('../services/agreement-pdf');
const {
  AGREEMENT_VERSION,
  PART_A_TITLE,
  PART_A_PARAGRAPHS,
  VALID_PATHS,
  tierLabel,
} = require('../lib/agreement-template');

const router = express.Router();

const automationEnabled = () => process.env.AGREEMENT_AUTOMATION_ENABLED === 'true';

// Best-effort Cliniko name/email lookup. Never throws — the agreement flow must
// not hard-fail on a Cliniko blip. Returns { name, email } (possibly blank).
async function clinikoNameEmail(clinikoPatientId) {
  try {
    const cp = await cliniko.getPatient(clinikoPatientId);
    return {
      name: `${cp.first_name || ''} ${cp.last_name || ''}`.trim(),
      email: cp.email || '',
    };
  } catch {
    return { name: '', email: '' };
  }
}

// POST /generate — clinician mints a tokenised agreement link.
router.post('/generate', authenticate, requireRole('clinician'), async (req, res) => {
  if (!automationEnabled()) return res.status(503).json({ error: 'Agreement automation is disabled' });

  const { clinikoPatientId, tier, path, startDate } = req.body || {};
  if (!clinikoPatientId || !tier || !path) {
    return res.status(400).json({ error: 'clinikoPatientId, tier and path are required' });
  }
  if (!VALID_PATHS.includes(path)) return res.status(400).json({ error: 'Invalid path' });
  if (!tierLabel(tier, path)) return res.status(400).json({ error: 'Unknown tier/path combination' });

  try {
    // Link to an existing Moveify user if one is already mapped to this Cliniko id.
    const existing = await db.getOne('SELECT id FROM users WHERE cliniko_patient_id = $1', [String(clinikoPatientId)]);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const row = await db.getOne(`
      INSERT INTO service_agreements
        (patient_id, cliniko_patient_id, clinician_id, tier, path, start_date, status, token, token_expires_at, agreement_version)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
      RETURNING id
    `, [existing?.id || null, String(clinikoPatientId), req.user.id, tier, path, startDate || null, token, expiresAt, AGREEMENT_VERSION]);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${baseUrl}/agreement?token=${token}`;
    audit.log(req, 'agreement_generate', 'service_agreement', row.id, { tier, path });
    res.json({ link, token, expiresAt, agreementId: row.id });
  } catch (err) {
    console.error('Agreement generate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /validate/:token — public. Returns Part A + read-only program summary.
router.get('/validate/:token', async (req, res) => {
  try {
    const a = await db.getOne(`
      SELECT * FROM service_agreements
      WHERE token = $1 AND status = 'pending' AND token_expires_at > NOW()
    `, [req.params.token]);
    if (!a) return res.status(404).json({ error: 'Invalid or expired agreement link' });

    const { name } = await clinikoNameEmail(a.cliniko_patient_id);
    res.json({
      valid: true,
      patientName: name,
      tier: a.tier,
      path: a.path,
      tierLabel: tierLabel(a.tier, a.path),
      startDate: a.start_date,
      agreementVersion: a.agreement_version,
      title: PART_A_TITLE,
      paragraphs: PART_A_PARAGRAPHS,
    });
  } catch (err) {
    console.error('Agreement validate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /:token/sign — public. Records the signature, stores the PDF in Cliniko,
// opens the Stripe setup Checkout, returns its URL.
router.post('/:token/sign', async (req, res) => {
  if (!automationEnabled()) return res.status(503).json({ error: 'Agreement automation is disabled' });

  const { signedName, consent } = req.body || {};
  if (!signedName || consent !== true) {
    return res.status(400).json({ error: 'A typed name and consent are required' });
  }

  try {
    // Atomically claim the pending agreement — defends against double-sign races.
    const a = await db.getOne(`
      UPDATE service_agreements
      SET status = 'signed', signed_name = $2, signed_at = NOW(), signed_ip = $3, updated_at = NOW()
      WHERE token = $1 AND status = 'pending' AND token_expires_at > NOW()
      RETURNING *
    `, [req.params.token, String(signedName).slice(0, 200), req.ip]);
    if (!a) return res.status(410).json({ error: 'This link is invalid, expired, or already used' });

    const { name: patientName, email } = await clinikoNameEmail(a.cliniko_patient_id);

    // Render + store the signed PDF in Cliniko. Best-effort: a failure must not
    // block the patient from reaching payment — log and continue.
    try {
      const pdf = await renderAgreementPdf({
        patientName,
        tier: a.tier,
        path: a.path,
        startDate: a.start_date,
        signedName: a.signed_name,
        signedAt: new Date(a.signed_at).toISOString(),
        signedIp: a.signed_ip,
      });
      const att = await cliniko.uploadAttachment(
        a.cliniko_patient_id,
        pdf,
        `Service Agreement ${new Date().toISOString().slice(0, 10)}.pdf`,
        'application/pdf',
        'Signed service agreement (Moveify)'
      );
      if (att?.id) {
        await db.query('UPDATE service_agreements SET cliniko_attachment_id = $1, updated_at = NOW() WHERE id = $2', [String(att.id), a.id]);
      }
    } catch (pdfErr) {
      console.error('Agreement PDF upload failed (continuing to checkout):', pdfErr.message);
    }

    // Ask the billing-worker to open a setup-mode Checkout session.
    const workerUrl = process.env.BILLING_WORKER_URL;
    const adminToken = process.env.BILLING_ADMIN_TOKEN;
    if (!workerUrl || !adminToken) {
      console.error('BILLING_WORKER_URL / BILLING_ADMIN_TOKEN not configured');
      return res.status(500).json({ error: 'Payment setup is temporarily unavailable' });
    }
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    let checkoutUrl;
    let customerId;
    try {
      const wr = await fetch(`${workerUrl.replace(/\/$/, '')}/admin/agreements/checkout-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
        body: JSON.stringify({
          clinikoId: a.cliniko_patient_id,
          name: patientName,
          email,
          tier: a.tier,
          path: a.path,
          startDate: a.start_date,
          successUrl: `${baseUrl}/agreement/success`,
          cancelUrl: `${baseUrl}/agreement/cancelled?token=${a.token}`,
        }),
      });
      if (!wr.ok) {
        const body = await wr.text().catch(() => '');
        throw new Error(`worker ${wr.status}: ${body.slice(0, 200)}`);
      }
      const data = await wr.json();
      checkoutUrl = data.checkoutUrl;
      customerId = data.customerId;
    } catch (workerErr) {
      console.error('checkout-setup call failed:', workerErr.message);
      return res.status(502).json({ error: 'Could not start payment setup. Please contact the clinic.' });
    }

    if (customerId) {
      await db.query('UPDATE service_agreements SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2', [customerId, a.id]);
    }
    audit.log(req, 'agreement_sign', 'service_agreement', a.id, { tier: a.tier, path: a.path });
    res.json({ checkoutUrl });
  } catch (err) {
    console.error('Agreement sign error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
