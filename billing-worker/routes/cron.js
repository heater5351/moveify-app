'use strict';

const express = require('express');
const router = express.Router();
const { syncCliniko } = require('../jobs/sync-cliniko');
const { ingestAnzCsv } = require('../jobs/ingest-anz');
const { runReconciliation } = require('../jobs/reconcile');
const { runDailySummary } = require('../jobs/daily-summary');
const { processReferrals } = require('../jobs/process-referrals');
const { ingestTyroFromDrive } = require('../jobs/ingest-tyro-drive');
const { pollClinikoAppointments } = require('../jobs/poll-cliniko-appointments');
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

router.post('/ingest-anz-csv', express.text({ type: 'text/csv', limit: '5mb' }), async (req, res) => {
  const log = withCorrelation(req);
  if (!req.body) return res.status(400).json({ error: 'Empty CSV body' });
  try {
    const result = await ingestAnzCsv(req.body, log);
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err: err.message }, 'ingest-anz-csv job failed');
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
