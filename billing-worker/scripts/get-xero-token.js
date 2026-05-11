'use strict';

// One-shot Xero OAuth consent flow. Walks you through Xero's authorize page,
// captures the authorization code on a local callback, exchanges it for
// access + refresh tokens, and writes the refresh token straight to Secret
// Manager so nothing sensitive touches your terminal.
//
// Usage (from repo root, in PowerShell):
//   $env:XERO_CLIENT_ID = gcloud secrets versions access latest --secret=XERO_CLIENT_ID
//   $env:XERO_CLIENT_SECRET = gcloud secrets versions access latest --secret=XERO_CLIENT_SECRET
//   node billing-worker/scripts/get-xero-token.js
//
// Prerequisites:
//   - http://localhost:5000/callback registered as an OAuth 2.0 redirect URI
//     on the Xero app (Xero Developer Portal → My Apps → your app).
//   - gcloud CLI installed and authenticated as a user with permission to add
//     versions to the XERO_REFRESH_TOKEN secret.

const http = require('http');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const os = require('os');

const PORT = 5000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SECRET_NAME = 'XERO_REFRESH_TOKEN';

// Trim — gcloud secrets versions access appends a trailing newline that
// silently breaks URLSearchParams (encoded as %0A) and yields invalid_client.
const CLIENT_ID = (process.env.XERO_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.XERO_CLIENT_SECRET || '').trim();

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing XERO_CLIENT_ID and/or XERO_CLIENT_SECRET in env. See script header.');
  process.exit(1);
}

const SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'accounting.banktransactions',
  'accounting.invoices',
  'accounting.payments',
  'accounting.contacts',
  'accounting.settings',
].join(' ');

const STATE = crypto.randomBytes(16).toString('hex');

// PKCE — Xero Web apps may require code_challenge.
const CODE_VERIFIER = crypto.randomBytes(32).toString('base64url');
const CODE_CHALLENGE = crypto.createHash('sha256').update(CODE_VERIFIER).digest('base64url');

const authUrl = new URL('https://login.xero.com/identity/connect/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('state', STATE);
authUrl.searchParams.set('code_challenge', CODE_CHALLENGE);
authUrl.searchParams.set('code_challenge_method', 'S256');

function openBrowser(url) {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      // Use cmd's start so we don't block on PowerShell quoting quirks
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch (_) {
    return false;
  }
}

function writeSecretVersion(secretName, value) {
  // Use gcloud to add a new version of the secret. Pipe the value via stdin
  // so it never appears in the process arg list.
  const result = require('child_process').spawnSync(
    'gcloud',
    ['secrets', 'versions', 'add', secretName, '--data-file=-'],
    {
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
    }
  );
  if (result.status !== 0) {
    throw new Error(`gcloud secrets versions add failed (exit ${result.status})`);
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`Authorization failed: ${error}`);
    console.error('Xero returned error:', error);
    process.exit(1);
  }
  if (!code) {
    res.end('Missing code');
    return;
  }
  if (state !== STATE) {
    res.end('State mismatch — aborting');
    console.error('State mismatch — possible CSRF. Aborting.');
    process.exit(1);
  }

  try {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: CODE_VERIFIER,
    }).toString();

    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.end(`Token exchange failed: ${tokenRes.status}`);
      console.error('Token exchange failed:', tokenRes.status, text);
      process.exit(1);
    }

    const tokens = await tokenRes.json();

    // Decode the access token's payload solely to surface granted scopes —
    // helpful sanity check that accounting.banktransactions is in the list.
    let grantedScopes = '(unknown)';
    try {
      const payload = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64').toString('utf8'));
      grantedScopes = Array.isArray(payload.scope) ? payload.scope.join(' ') : payload.scope || '(none)';
    } catch (_) { /* ignore */ }

    res.end('Done — you can close this tab.');

    console.log('\n==========================================================');
    console.log('Xero consent succeeded. Granted scopes:');
    console.log(grantedScopes);
    console.log('\nWriting refresh token to Secret Manager');
    console.log(`  secret: ${SECRET_NAME}`);
    console.log('==========================================================\n');

    writeSecretVersion(SECRET_NAME, tokens.refresh_token);

    console.log('\n✅ Refresh token saved as a new version of', SECRET_NAME);
    console.log('Next step: ask Claude to force a cold start of the billing worker.\n');
    process.exit(0);
  } catch (err) {
    res.end(`Token exchange error: ${err.message}`);
    console.error('Token exchange error:', err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Local callback listening on ${REDIRECT_URI}`);
  console.log(`client_id length: ${CLIENT_ID.length}, first8: ${CLIENT_ID.slice(0, 8)}`);
  console.log(`auth URL: ${authUrl.toString()}`);
  console.log('Opening browser for Xero consent ...');
  const opened = openBrowser(authUrl.toString());
  if (!opened) {
    console.log('\nCould not auto-open browser. Open this URL manually:\n');
    console.log(authUrl.toString());
    console.log('');
  }
});
