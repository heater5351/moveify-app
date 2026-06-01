'use strict';

const express = require('express');
const router = express.Router();
const { syncCliniko } = require('../jobs/sync-cliniko');
const { runReconciliation } = require('../jobs/reconcile');
const { runDailySummary } = require('../jobs/daily-summary');
const { processReferrals } = require('../jobs/process-referrals');
const { ingestTyroFromDrive } = require('../jobs/ingest-tyro-drive');
const { pollClinikoAppointments } = require('../jobs/poll-cliniko-appointments');
const { syncBlockProgress } = require('../jobs/sync-block-progress');
const { runDashboardSync } = require('../jobs/dashboard-sync');
const { withCorrelation, logger } = require('../lib/logger');
const { OAuth2Client } = require('google-auth-library');

// Real Google OIDC verification. Cloud Run is deployed --allow-unauthenticated
// (so the Stripe webhook can hit /webhooks/stripe), which means Cloud Run does
// NOT verify the OIDC token for /cron/* — we must do it here.
//
// Cloud Scheduler signs each request with a Google-issued OIDC token whose
// `email` claim equals the configured service account, and whose `aud` claim
// equals the configured token audience (we use the Cloud Run service URL).
// Both are checked.
const ALLOWED_SA = 'billing-worker@moveify-app.iam.gserviceaccount.com';
const EXPECTED_AUD = process.env.OIDC_EXPECTED_AUDIENCE
  || 'https://moveify-billing-worker-1097567971198.australia-southeast1.run.app';

const oidcClient = new OAuth2Client();

async function requireOidc(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing OIDC token' });
  }
  const token = auth.slice(7);
  try {
    const ticket = await oidcClient.verifyIdToken({ idToken: token, audience: EXPECTED_AUD });
    const payload = ticket.getPayload();
    if (payload.email !== ALLOWED_SA || !payload.email_verified) {
      return res.status(403).json({ error: 'Unauthorized caller' });
    }
    next();
  } catch (err) {
    logger.warn({ err: err.message }, 'OIDC verification failed');
    return res.status(401).json({ error: 'Invalid OIDC token' });
  }
}

router.use(requireOidc);

router.post('/sync-cliniko', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const counts = await syncCliniko(log);
    res.json({ ok: true, counts });
  } catch (err) {
    log.error({ err: err.message }, 'sync-cliniko job failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/reconcile', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const stats = await runReconciliation(log);
    res.json({ ok: true, ...stats });
  } catch (err) {
    log.error({ err: err.message }, 'reconcile job failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/daily-summary', async (req, res) => {
  const log = withCorrelation(req);
  try {
    await runDailySummary(log);
    res.json({ ok: true });
  } catch (err) {
    log.error({ err: err.message }, 'daily-summary job failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/process-referrals', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const counts = await processReferrals(log);
    res.json({ ok: true, ...counts });
  } catch (err) {
    log.error({ err: err.message }, 'process-referrals job failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/ingest-tyro-drive', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const result = await ingestTyroFromDrive(log);
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err: err.message }, 'ingest-tyro-drive job failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-block-progress', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const dryRun = req.body?.dryRun === true;
    const stats = await syncBlockProgress(log, { dryRun });
    res.json({ ok: true, ...stats });
  } catch (err) {
    log.error({ err: err.message }, 'sync-block-progress job failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/dashboard-sync', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const stats = await runDashboardSync(log);
    res.json({ ok: true, ...stats });
  } catch (err) {
    log.error({ err: err.message }, 'dashboard-sync failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/sweep-idempotency', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const billingDb = require('../services/billing-db');
    const removed = await billingDb.sweepIdempotencyKeys(90);
    log.info({ removed }, 'idempotency sweep complete');
    res.json({ ok: true, removed });
  } catch (err) {
    log.error({ err: err.message }, 'sweep-idempotency failed');
    res.status(500).json({ error: err.message });
  }
});

// Backfill Stripe processing fees for historical payments (pre-fee-booking).
// Dry-run by default — set dryRun:false to actually write SPEND txns to Xero.
// Idempotent (shared stripe-fee:<invoice> key); safe to re-run.
router.post('/backfill-stripe-fees', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { since, until, dryRun = true } = req.body || {};
  try {
    const { backfillStripeFees } = require('../jobs/stripe-handler');
    const result = await backfillStripeFees({ since, until, dryRun }, log);
    res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    log.error({ err: err.message }, 'backfill-stripe-fees failed');
    res.status(500).json({ error: err.message });
  }
});

// Bulk-resolve open reconciliation flags by id or type. Used for housekeeping
// (clearing noise flags after manual review). Sets resolved_at so they drop off
// the open list; does NOT touch any Xero/invoice state.
router.post('/resolve-flags', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { ids, types, resolution = 'dismissed', notes = '' } = req.body || {};
  if ((!Array.isArray(ids) || ids.length === 0) && (!Array.isArray(types) || types.length === 0)) {
    return res.status(400).json({ error: 'ids[] or types[] required' });
  }
  try {
    const { run } = require('../db/pool');
    const now = new Date().toISOString();
    const result = (Array.isArray(ids) && ids.length)
      ? await run(`UPDATE reconciliation_flags SET resolved_at = $1, resolution = $2, notes = $3 WHERE id = ANY($4) AND resolved_at IS NULL`, [now, resolution, notes, ids])
      : await run(`UPDATE reconciliation_flags SET resolved_at = $1, resolution = $2, notes = $3 WHERE type = ANY($4) AND resolved_at IS NULL`, [now, resolution, notes, types]);
    log.info({ resolved: result.rowCount, types: types || null, ids: ids || null }, 'resolve-flags complete');
    res.json({ ok: true, resolved: result.rowCount });
  } catch (err) {
    log.error({ err: err.message }, 'resolve-flags failed');
    res.status(500).json({ error: err.message });
  }
});

// READ-ONLY audit: compares the backend billing DB against Xero and surfaces
// likely replay/test cruft. Writes nothing. Logs PHI-safe (IDs, amounts,
// invoice numbers, statuses — never names or health data). Optional
// clinikoIds[] triggers a per-patient Xero-vs-backend deep dive.
router.post('/billing-audit', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { clinikoIds = [] } = req.body || {};
  try {
    const { getAll } = require('../db/pool');
    const xero = require('../lib/xero');

    // 1) Overall backend table health
    const counts = {};
    for (const t of ['stripe_payments', 'appointment_invoices', 'stripe_cliniko_links', 'reconciliation_flags', 'idempotency_keys']) {
      const r = await getAll(`SELECT COUNT(*)::int AS n FROM ${t}`);
      counts[t] = r[0].n;
    }
    const openFlags = await getAll(`SELECT type, COUNT(*)::int AS n FROM reconciliation_flags WHERE resolved_at IS NULL GROUP BY type ORDER BY n DESC`);
    log.info({ counts, open_flags_by_type: openFlags }, 'AUDIT: backend table counts');

    // 2) Duplicate / multiplicity detection
    const dupApptInv = await getAll(`SELECT cliniko_appointment_id, COUNT(*)::int AS n FROM appointment_invoices GROUP BY cliniko_appointment_id HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 50`);
    const dupStripeInv = await getAll(`SELECT stripe_invoice_id, COUNT(*)::int AS n FROM stripe_payments GROUP BY stripe_invoice_id HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 50`);
    const multiLink = await getAll(`SELECT cliniko_id, COUNT(*)::int AS n FROM stripe_cliniko_links GROUP BY cliniko_id HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 50`);
    log.info({
      appt_invoices_with_dupes: dupApptInv.length,
      stripe_invoices_with_dupes: dupStripeInv.length,
      cliniko_ids_with_multiple_links: multiLink.length,
      sample_dup_appt: dupApptInv.slice(0, 10),
      sample_dup_stripe_inv: dupStripeInv.slice(0, 10),
      sample_multi_link: multiLink.slice(0, 10),
    }, 'AUDIT: backend multiplicity check');

    // 3) Per-patient Xero-vs-backend deep dive
    for (const cid of clinikoIds.map(String)) {
      const sp = await getAll(`SELECT stripe_invoice_id, amount, pp_invoice_id, pp_amount, xero_overpayment_id, paid_at FROM stripe_payments WHERE cliniko_id = $1 ORDER BY paid_at`, [cid]);
      const ai = await getAll(`SELECT cliniko_appointment_id, xero_invoice_number, casual_price, overpayment_allocated, gap_amount, appointment_date FROM appointment_invoices WHERE cliniko_patient_id = $1 ORDER BY appointment_date`, [cid]);
      const links = await getAll(`SELECT stripe_customer_id, match_method FROM stripe_cliniko_links WHERE cliniko_id = $1`, [cid]);

      let xeroState = { contact_found: false };
      const contact = await xero.getContactByClinikoId(cid).catch((e) => { log.warn({ cid, err: e.message }, 'AUDIT: Xero contact lookup failed'); return null; });
      if (contact) {
        const invoices = await xero.getContactInvoices(contact.ContactID).catch(() => []);
        const ops = await xero.getContactOverpayments(contact.ContactID).catch(() => []);
        xeroState = {
          contact_found: true,
          xero_contact_id: contact.ContactID,
          invoices: (invoices || []).map((i) => ({ num: i.InvoiceNumber, status: i.Status, total: i.Total, due: i.AmountDue })),
          overpayments: (ops || []).map((o) => ({ id: o.overpaymentId, total: o.total, remaining: o.remaining })),
        };
      }

      log.info({
        cliniko_id: cid,
        backend: {
          stripe_payments: sp.length,
          stripe_payments_amount_sum: sp.reduce((a, r) => a + Number(r.amount || 0), 0),
          links: links.length,
          appointment_invoices: ai.map((r) => ({ appt: r.cliniko_appointment_id, num: r.xero_invoice_number, price: r.casual_price, alloc: r.overpayment_allocated, gap: r.gap_amount, date: r.appointment_date })),
          stripe_payment_rows: sp.map((r) => ({ inv: r.stripe_invoice_id, amt: r.amount, pp: r.pp_amount, op: r.xero_overpayment_id })),
        },
        xero: xeroState,
      }, 'AUDIT: per-patient Xero-vs-backend');
    }

    res.json({ ok: true, counts });
  } catch (err) {
    log.error({ err: err.message }, 'billing-audit failed');
    res.status(500).json({ error: err.message });
  }
});

// Targeted reprocess for appointments that were skipped before their patient's
// Stripe link existed (poller link-store bug). Finds arrived individual
// appointments since `since` for the given Cliniko patient IDs, clears ONLY
// those appointment idempotency keys, rewinds the cursor, and runs the poller
// once so they invoice + allocate the now-resolvable overpayment credit.
// Scoped by patient ID so already-invoiced appointments for other patients in
// the window keep their keys and are not re-billed.
router.post('/reprocess-appointments', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { clinikoPatientIds, since } = req.body || {};
  if (!Array.isArray(clinikoPatientIds) || clinikoPatientIds.length === 0) {
    return res.status(400).json({ error: 'clinikoPatientIds (non-empty array) required' });
  }
  if (!since || !Number.isFinite(new Date(since).getTime())) {
    return res.status(400).json({ error: 'since (valid ISO timestamp) required' });
  }
  try {
    const cliniko = require('../services/cliniko').finance;
    const billingDb = require('../services/billing-db');
    const targets = new Set(clinikoPatientIds.map(String));

    const appts = await cliniko.getAppointmentsAll(since);
    const keys = [];
    const matched = [];
    for (const a of appts) {
      const pid = a.patient?.links?.self?.split('/').pop();
      if (!targets.has(String(pid))) continue;
      if (!a.patient_arrived || a.did_not_arrive || a.cancelled_at) continue;
      keys.push(`appointment:${a.id}`);
      matched.push({ appt_id: String(a.id), cliniko_patient_id: String(pid), starts_at: a.starts_at });
    }

    const removed = keys.length ? await billingDb.clearIdempotencyKeys({ keys }) : 0;
    await billingDb.setWorkerState('cliniko_appointments_last_polled', since);
    log.info({ matched_count: matched.length, keys_cleared: removed, since }, 'reprocess-appointments: cleared keys, running poller');

    const stats = await pollClinikoAppointments(log);
    res.json({ ok: true, matched, keys_cleared: removed, cursor_rewound_to: since, ...stats });
  } catch (err) {
    log.error({ err: err.message }, 'reprocess-appointments failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/poll-cliniko-appointments', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const stats = await pollClinikoAppointments(log);
    res.json({ ok: true, ...stats });
  } catch (err) {
    log.error({ err: err.message }, 'poll-cliniko-appointments job failed');
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
