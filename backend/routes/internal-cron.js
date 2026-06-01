// Internal cron endpoints, triggered by Cloud Scheduler with an OIDC token.
//
// The backend Cloud Run service is deployed --allow-unauthenticated (patient
// traffic), so Cloud Run does NOT verify the OIDC token for us — we verify it
// here. Cloud Scheduler signs each request with a Google-issued OIDC token whose
// `email` claim equals the configured service account and whose `aud` claim equals
// the configured audience (the backend's Cloud Run URL). Both are checked.
//
// Config (env):
//   CRON_OIDC_SA       — service-account email allowed to invoke these routes
//   CRON_OIDC_AUDIENCE — expected `aud` (this service's Cloud Run URL)
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { syncClinikoPatients } = require('../jobs/sync-cliniko-patients');

const router = express.Router();
const oidcClient = new OAuth2Client();

async function requireOidc(req, res, next) {
  const expectedSa = process.env.CRON_OIDC_SA;
  const expectedAud = process.env.CRON_OIDC_AUDIENCE;
  if (!expectedSa || !expectedAud) {
    console.error('Internal cron called but CRON_OIDC_SA / CRON_OIDC_AUDIENCE not configured');
    return res.status(503).json({ error: 'Cron not configured' });
  }

  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing OIDC token' });
  }
  const token = auth.slice(7);
  try {
    const ticket = await oidcClient.verifyIdToken({ idToken: token, audience: expectedAud });
    const payload = ticket.getPayload();
    if (payload.email !== expectedSa || !payload.email_verified) {
      return res.status(403).json({ error: 'Unauthorized caller' });
    }
    next();
  } catch (err) {
    console.warn('Internal cron OIDC verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid OIDC token' });
  }
}

router.use(requireOidc);

router.post('/sync-cliniko-patients', async (req, res) => {
  try {
    const stats = await syncClinikoPatients();
    // PHI-safe — counts only, no patient data. Makes the unattended cron observable.
    console.log('cliniko auto-sync complete:', JSON.stringify(stats));
    res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('sync-cliniko-patients job failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
