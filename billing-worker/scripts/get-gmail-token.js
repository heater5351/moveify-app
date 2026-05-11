'use strict';

// One-time script to authorise Gmail with gmail.modify scope and save the
// refresh token to Secret Manager.
//
// Before running:
//   1. Go to GCP Console → APIs & Services → Credentials
//   2. Click your OAuth 2.0 Client ID (billing worker's client)
//   3. Add  http://localhost:8085  to "Authorised redirect URIs" and save
//
// Then run:  node scripts/get-gmail-token.js

const http = require('http');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { google } = require('googleapis');

const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}`;
const PROJECT = process.env.GCP_PROJECT_ID || 'moveify-app';

async function main() {
  const sm = new SecretManagerServiceClient();

  const getSecret = async (name) => {
    const [v] = await sm.accessSecretVersion({ name: `projects/${PROJECT}/secrets/${name}/versions/latest` });
    return v.payload.data.toString('utf8').trim();
  };

  console.log('Loading OAuth credentials from Secret Manager...');
  const [clientId, clientSecret] = await Promise.all([
    getSecret('billing-gmail-client-id'),
    getSecret('billing-gmail-client-secret'),
  ]);

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
    prompt: 'consent', // forces refresh_token to be returned even if previously authorised
  });

  // Try to open the browser automatically on Windows
  require('child_process').exec(`start "" "${authUrl}"`);

  console.log('\nA browser window should have opened. If not, visit this URL:\n');
  console.log(authUrl);
  console.log('\nWaiting for you to authorise (5 min timeout)...\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const params = new URL(req.url, REDIRECT_URI).searchParams;
      const error = params.get('error');
      const code  = params.get('code');

      if (error) {
        res.end(`<h2>Error: ${error} — check the terminal.</h2>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      if (code) {
        res.end('<h2>Authorised — you can close this tab.</h2>');
        server.close();
        resolve(code);
      }
    });

    server.listen(PORT, () => console.log(`Listening on http://localhost:${PORT} ...`));
    setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for browser authorisation (5 min)'));
    }, 300_000);
  });

  console.log('Exchanging code for tokens...');
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    console.error('\nNo refresh token returned.');
    console.error('Revoke the app at https://myaccount.google.com/permissions then re-run this script.');
    process.exit(1);
  }

  console.log('Saving to Secret Manager (billing-gmail-refresh-token)...');
  await sm.addSecretVersion({
    parent: `projects/${PROJECT}/secrets/billing-gmail-refresh-token`,
    payload: { data: Buffer.from(tokens.refresh_token) },
  });

  console.log('\nDone. New refresh token saved.');
  console.log('Redeploy the billing worker (or wait for the current deploy to finish) to pick it up.\n');
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
