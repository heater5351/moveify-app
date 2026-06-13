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
  VALID_PATHS,
  tierLabel,
} = require('../lib/agreement-template');
const { buildAgreement } = require('../lib/agreement-content');
const {
  NDIS_AGREEMENT_VERSION,
  NDIS_RATE_CAP_CENTS,
  MANAGEMENT_TYPES,
  FUNDING_PERIODS,
  isValidLineItem,
  buildNdisAgreement,
} = require('../lib/ndis-agreement-content');

const router = express.Router();

const automationEnabled = () => process.env.AGREEMENT_AUTOMATION_ENABLED === 'true';

// Best-effort Cliniko name/email/dob lookup. Never throws — the agreement flow
// must not hard-fail on a Cliniko blip. Returns { name, email, dob } (blanks ok).
async function clinikoNameEmail(clinikoPatientId) {
  try {
    const cp = await cliniko.getPatient(clinikoPatientId);
    return {
      name: `${cp.first_name || ''} ${cp.last_name || ''}`.trim(),
      email: cp.email || '',
      dob: cp.date_of_birth || '',
    };
  } catch {
    return { name: '', email: '', dob: '' };
  }
}

// Mints + stores a tokenised agreement row, invalidating any earlier UNSIGNED
// link for the same patient. Shared by the private + NDIS generate paths.
async function mintAgreement({ req, clinikoPatientId, tier, path, kind, details, startDate, version }) {
  const existing = await db.getOne('SELECT id FROM users WHERE cliniko_patient_id = $1', [String(clinikoPatientId)]);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await db.query(
    `UPDATE service_agreements SET status = 'expired', updated_at = NOW()
     WHERE cliniko_patient_id = $1 AND status = 'pending'`,
    [String(clinikoPatientId)]
  );
  const row = await db.getOne(`
    INSERT INTO service_agreements
      (patient_id, cliniko_patient_id, clinician_id, kind, tier, path, details, start_date, status, token, token_expires_at, agreement_version)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11)
    RETURNING id
  `, [existing?.id || null, String(clinikoPatientId), req.user.id, kind, tier, path, details ? JSON.stringify(details) : null, startDate || null, token, expiresAt, version]);
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return { agreementId: row.id, token, link: `${baseUrl}/agreement?token=${token}`, expiresAt };
}

// NDIS generate path — signature-only agreement (no Stripe). Validates the NDIS
// payload, rejects NDIA-managed (unregistered provider), enforces the price cap.
async function generateNdis(req, res) {
  const { clinikoPatientId, ndis } = req.body || {};
  if (!clinikoPatientId || !/^\d+$/.test(String(clinikoPatientId))) {
    return res.status(400).json({ error: 'clinikoPatientId must be numeric' });
  }
  const d = ndis || {};
  // NDIA-managed is a hard stop — Moveify is not a registered NDIS provider.
  if (d.managementType === 'ndia_managed' || d.managementType === 'NDIA-managed') {
    return res.status(422).json({ error: 'NDIA-managed plans are not supported — Moveify is not a registered NDIS provider. Use self-managed or plan-managed.' });
  }
  if (!MANAGEMENT_TYPES.includes(d.managementType)) {
    return res.status(400).json({ error: 'A valid plan management type is required (self_managed or plan_managed)' });
  }
  if (!isValidLineItem(d.lineItem)) return res.status(400).json({ error: 'A valid NDIS line item is required' });
  for (const [k, label] of [['planStart', 'Plan start'], ['planEnd', 'Plan end']]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d[k] || ''))) return res.status(400).json({ error: `${label} must be YYYY-MM-DD` });
  }
  // Rate arrives in dollars; store cents. Must be positive and within the cap.
  const rateCents = Math.round(Number(d.rate) * 100);
  if (!Number.isFinite(rateCents) || rateCents <= 0) return res.status(400).json({ error: 'A valid hourly rate is required' });
  if (rateCents > NDIS_RATE_CAP_CENTS) {
    return res.status(400).json({ error: `Rate exceeds the NDIS price limit of $${(NDIS_RATE_CAP_CENTS / 100).toFixed(2)}/hr` });
  }
  const clean = (s) => (typeof s === 'string' ? s.trim().slice(0, 500) : undefined);
  // Indicative estimate quantity: a non-negative number, clamped to a sane cap.
  const estHours = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : undefined;
  };
  const obj = (o, keys) => {
    const out = {};
    let any = false;
    for (const key of keys) { const v = clean(o?.[key]); if (v) { out[key] = v; any = true; } }
    return any ? out : undefined;
  };
  const details = {
    ndisNumber: clean(d.ndisNumber),
    planStart: d.planStart,
    planEnd: d.planEnd,
    lineItem: d.lineItem,
    rateCents,
    managementType: d.managementType,
    delivery: clean(d.delivery),
    frequency: clean(d.frequency),
    travelApplicable: d.travelApplicable === true,
    // Non-face-to-face supports default ON (claimable only because listed); the
    // operator can disable. Custom item list optional — falls back to defaults.
    nonFaceToFace: d.nonFaceToFace !== false,
    nffItems: Array.isArray(d.nffItems) ? d.nffItems.map(clean).filter(Boolean).slice(0, 12) : undefined,
    // Optional indicative funding estimate (hours / km). Clamp to sane bounds.
    estSessionHours: estHours(d.estSessionHours),
    estReportingHours: estHours(d.estReportingHours),
    estTravelHours: estHours(d.estTravelHours),
    estTravelKm: estHours(d.estTravelKm),
    // Funding period (NDIS s33). Optional; clause renders generically if unset.
    fundingPeriod: Object.prototype.hasOwnProperty.call(FUNDING_PERIODS, d.fundingPeriod) ? d.fundingPeriod : undefined,
    fundingPeriodAmountCents: (() => {
      const c = Math.round(Number(d.fundingPeriodAmount) * 100);
      return Number.isFinite(c) && c > 0 ? c : undefined;
    })(),
    planManager: obj(d.planManager, ['name', 'contact']),
    supportCoordinator: obj(d.supportCoordinator, ['name', 'org', 'contact']),
    representative: obj(d.representative, ['name', 'relationship', 'authority']),
    goals: Array.isArray(d.goals) ? d.goals.map(clean).filter(Boolean).slice(0, 10) : undefined,
    endingNoticeDays: Number.isFinite(Number(d.endingNoticeDays)) ? Number(d.endingNoticeDays) : undefined,
  };

  try {
    const out = await mintAgreement({
      req, clinikoPatientId, tier: 'ndis', path: 'ndis', kind: 'ndis',
      details, startDate: d.planStart, version: NDIS_AGREEMENT_VERSION,
    });
    audit.log(req, 'agreement_generate', 'service_agreement', out.agreementId, { kind: 'ndis', managementType: d.managementType });
    res.json(out);
  } catch (err) {
    console.error('NDIS agreement generate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /generate — clinician mints a tokenised agreement link.
router.post('/generate', authenticate, requireRole('clinician'), async (req, res) => {
  if (!automationEnabled()) return res.status(503).json({ error: 'Agreement automation is disabled' });

  if ((req.body || {}).kind === 'ndis') return generateNdis(req, res);

  const { clinikoPatientId, tier, path, startDate } = req.body || {};
  if (!clinikoPatientId || !tier || !path) {
    return res.status(400).json({ error: 'clinikoPatientId, tier and path are required' });
  }
  // Cliniko ids are numeric — reject anything else. This value flows through to a
  // Stripe customer-search query in the worker; validating here is the first line
  // of defence against search-query injection / mis-linking a payment method.
  if (!/^\d+$/.test(String(clinikoPatientId))) {
    return res.status(400).json({ error: 'clinikoPatientId must be numeric' });
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
    return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
  }
  if (!VALID_PATHS.includes(path)) return res.status(400).json({ error: 'Invalid path' });
  if (!tierLabel(tier, path)) return res.status(400).json({ error: 'Unknown tier/path combination' });

  try {
    // Link to an existing Moveify user if one is already mapped to this Cliniko id.
    const existing = await db.getOne('SELECT id FROM users WHERE cliniko_patient_id = $1', [String(clinikoPatientId)]);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Invalidate any earlier UNSIGNED agreement links for this patient, so only
    // the latest link is signable. Prevents two pending links both being signed
    // and creating two schedules (double billing). Already-signed/active rows are
    // left untouched. Mirrors the invitation-token reissue pattern.
    await db.query(
      `UPDATE service_agreements SET status = 'expired', updated_at = NOW()
       WHERE cliniko_patient_id = $1 AND status = 'pending'`,
      [String(clinikoPatientId)]
    );

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

    const { name, dob } = await clinikoNameEmail(a.cliniko_patient_id);

    if (a.kind === 'ndis') {
      const agreement = buildNdisAgreement({ details: a.details, patientName: name, patientDob: dob });
      return res.json({
        valid: true,
        kind: 'ndis',
        patientName: name,
        tier: a.tier,
        path: a.path,
        tierLabel: agreement ? agreement.tierLabel : null,
        startDate: a.start_date,
        agreementVersion: a.agreement_version,
        agreement,
      });
    }

    res.json({
      valid: true,
      kind: 'private',
      patientName: name,
      tier: a.tier,
      path: a.path,
      tierLabel: tierLabel(a.tier, a.path),
      startDate: a.start_date,
      agreementVersion: a.agreement_version,
      // Full structured agreement (provider header, Part A clinical, Part B DDRSA)
      // — mirrors the Cliniko service agreements. The sign page renders this.
      agreement: buildAgreement({ tier: a.tier, path: a.path, startDate: a.start_date }),
    });
  } catch (err) {
    console.error('Agreement validate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /:token/pdf — public, token-gated. Streams a printable PDF of the
// agreement. For a still-pending link this is an UNSIGNED preview copy (the
// operator/participant can read or hand-sign it); once signed, it renders the
// captured signature + audit trail. Same secret (the 32-byte token) as validate.
router.get('/:token/pdf', async (req, res) => {
  if (!automationEnabled()) return res.status(503).json({ error: 'Agreement automation is disabled' });
  try {
    const a = await db.getOne(
      `SELECT * FROM service_agreements WHERE token = $1 AND status IN ('pending', 'signed')`,
      [req.params.token]
    );
    if (!a) return res.status(404).json({ error: 'Invalid or expired agreement link' });
    if (a.status === 'pending' && new Date(a.token_expires_at) < new Date()) {
      return res.status(404).json({ error: 'Invalid or expired agreement link' });
    }

    const { name, dob } = await clinikoNameEmail(a.cliniko_patient_id);
    const isSigned = a.status === 'signed';
    const common = {
      patientName: name,
      draft: !isSigned,
      signedName: isSigned ? a.signed_name : undefined,
      signedAt: isSigned && a.signed_at ? new Date(a.signed_at).toISOString() : undefined,
      signedIp: isSigned ? a.signed_ip : undefined,
      signature: isSigned ? a.signed_signature : undefined,
    };

    let pdf;
    if (a.kind === 'ndis') {
      const agreement = buildNdisAgreement({ details: a.details, patientName: name, patientDob: dob });
      if (!agreement) return res.status(404).json({ error: 'Agreement could not be rendered' });
      pdf = await renderAgreementPdf({ ...common, agreement, signedCapacity: isSigned ? a.signed_capacity : undefined });
    } else {
      pdf = await renderAgreementPdf({ ...common, tier: a.tier, path: a.path, startDate: a.start_date });
    }

    const fname = `${a.kind === 'ndis' ? 'NDIS-' : ''}Service-Agreement${isSigned ? '-signed' : '-preview'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (err) {
    console.error('Agreement PDF error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Shared drawn-signature validation. Returns an error string, or null if valid.
function validateSignature(signature) {
  if (typeof signature !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)) {
    return 'A drawn signature is required';
  }
  if (signature.length > 90_000) return 'Signature image is too large';
  return null;
}

// NDIS sign path — signature-only. Records the signature, stores the signed PDF
// in Cliniko, and finishes ('signed' is terminal — no Stripe / checkout). A PDF
// upload failure is best-effort and does not undo the signature.
async function signNdis(req, res) {
  const { signedName, consent, signature, signedCapacity } = req.body || {};
  if (!signedName || consent !== true) {
    return res.status(400).json({ error: 'A typed name and consent are required' });
  }
  const sigErr = validateSignature(signature);
  if (sigErr) return res.status(400).json({ error: sigErr });
  const capacity = typeof signedCapacity === 'string' ? signedCapacity.trim().slice(0, 200) : '';

  try {
    const a = await db.getOne(`
      UPDATE service_agreements
      SET status = 'signed', signed_name = $2, signed_at = NOW(), signed_ip = $3,
          signed_signature = $4, signed_capacity = $5, updated_at = NOW()
      WHERE token = $1 AND status = 'pending' AND token_expires_at > NOW() AND kind = 'ndis'
      RETURNING *
    `, [req.params.token, String(signedName).slice(0, 200), req.ip, signature, capacity || null]);
    if (!a) return res.status(410).json({ error: 'This link is invalid, expired, or already used' });

    const { name: patientName, dob } = await clinikoNameEmail(a.cliniko_patient_id);

    // Render + store the signed PDF in Cliniko, once. Best-effort: the signature
    // is already the record, so a Cliniko blip must not fail the request.
    if (!a.cliniko_attachment_id) {
      try {
        const agreement = buildNdisAgreement({ details: a.details, patientName, patientDob: dob });
        const pdf = await renderAgreementPdf({
          agreement,
          patientName,
          signedName: a.signed_name,
          signedAt: new Date(a.signed_at).toISOString(),
          signedIp: a.signed_ip,
          signature: a.signed_signature,
          signedCapacity: a.signed_capacity,
        });
        const att = await cliniko.uploadAttachment(
          a.cliniko_patient_id,
          pdf,
          `NDIS Service Agreement ${new Date().toISOString().slice(0, 10)}.pdf`,
          'application/pdf',
          'Signed NDIS service agreement (Moveify)'
        );
        if (att?.id) {
          await db.query('UPDATE service_agreements SET cliniko_attachment_id = $1, updated_at = NOW() WHERE id = $2', [String(att.id), a.id]);
        }
      } catch (pdfErr) {
        console.error('NDIS agreement PDF upload failed (signature still recorded):', pdfErr.message);
      }
    }

    audit.log(req, 'agreement_sign', 'service_agreement', a.id, { kind: 'ndis' });
    res.json({ signed: true });
  } catch (err) {
    console.error('NDIS agreement sign error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /:token/sign — public. Records the signature, stores the PDF in Cliniko.
// Private agreements then open a Stripe setup Checkout and return its URL; NDIS
// agreements are signature-only and finish on signing.
router.post('/:token/sign', async (req, res) => {
  if (!automationEnabled()) return res.status(503).json({ error: 'Agreement automation is disabled' });

  // Peek the kind before claiming, so the right validation + flow applies.
  let peekKind;
  try {
    const peek = await db.getOne(
      `SELECT kind FROM service_agreements WHERE token = $1 AND status = 'pending' AND token_expires_at > NOW()`,
      [req.params.token]
    );
    peekKind = peek ? peek.kind : null;
  } catch (e) {
    console.error('Agreement sign peek error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
  if (!peekKind) return res.status(410).json({ error: 'This link is invalid, expired, or already used' });
  if (peekKind === 'ndis') return signNdis(req, res);

  const { signedName, consent, signature, ddAuthorised } = req.body || {};
  if (!signedName || consent !== true) {
    return res.status(400).json({ error: 'A typed name and consent are required' });
  }
  if (ddAuthorised !== true) {
    return res.status(400).json({ error: 'The Direct Debit authorisation must be confirmed' });
  }
  // The drawn signature is a base64 PNG data URL. Require it, sanity-check the
  // shape, and cap the size (a thin-line signature is well under this — the cap
  // just stops an oversized payload slipping past express.json's 100kb limit).
  if (typeof signature !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)) {
    return res.status(400).json({ error: 'A drawn signature is required' });
  }
  if (signature.length > 90_000) {
    return res.status(400).json({ error: 'Signature image is too large' });
  }

  try {
    // Atomically claim the pending agreement — defends against double-sign races.
    const a = await db.getOne(`
      UPDATE service_agreements
      SET status = 'signed', signed_name = $2, signed_at = NOW(), signed_ip = $3,
          signed_signature = $4, dd_authorised = true, updated_at = NOW()
      WHERE token = $1 AND status = 'pending' AND token_expires_at > NOW()
      RETURNING *
    `, [req.params.token, String(signedName).slice(0, 200), req.ip, signature]);
    if (!a) return res.status(410).json({ error: 'This link is invalid, expired, or already used' });

    const { name: patientName, email } = await clinikoNameEmail(a.cliniko_patient_id);

    // If the worker call (below) fails, revert to 'pending' so the SAME link can
    // be retried by the patient rather than dead-ending as 'signed' with no
    // checkout. Only reverts if still 'signed' (don't clobber a later state).
    const revertToPending = () => db.query(
      `UPDATE service_agreements SET status = 'pending', updated_at = NOW() WHERE id = $1 AND status = 'signed'`,
      [a.id]
    ).catch((e) => console.error('Failed to revert agreement to pending:', e.message));

    // Render + store the signed PDF in Cliniko — but only once (guard against a
    // retry re-uploading a duplicate). Best-effort: a failure must not block the
    // patient from reaching payment.
    if (!a.cliniko_attachment_id) {
      try {
        const pdf = await renderAgreementPdf({
          patientName,
          tier: a.tier,
          path: a.path,
          startDate: a.start_date,
          signedName: a.signed_name,
          signedAt: new Date(a.signed_at).toISOString(),
          signedIp: a.signed_ip,
          signature: a.signed_signature,
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
    }

    // Ask the billing-worker to open a setup-mode Checkout session.
    const workerUrl = process.env.BILLING_WORKER_URL;
    const adminToken = process.env.BILLING_ADMIN_TOKEN;
    if (!workerUrl || !adminToken) {
      console.error('BILLING_WORKER_URL / BILLING_ADMIN_TOKEN not configured');
      await revertToPending();
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
      await revertToPending();
      return res.status(502).json({ error: 'Could not start payment setup. Please try again or contact the clinic.' });
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
