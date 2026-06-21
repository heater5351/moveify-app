// Identity Platform (Firebase Admin) SDK bootstrap.
// Lazy-initialized so the backend still starts when IP env vars are absent
// (e.g. local dev pre-Phase-2). Returns null if not configured.
const admin = require('firebase-admin');

let initialized = false;
let enabled = false;

function init() {
  if (initialized) return enabled;
  initialized = true;

  // Prefer single-JSON env (whole service account file as a string —
  // mounted from Secret Manager secret identity_platform_service_account).
  // Fall back to split FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY env vars.
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let serviceAccount = null;
  if (json) {
    try {
      serviceAccount = JSON.parse(json);
    } catch (err) {
      console.error('FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON — IP verification disabled');
      return false;
    }
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (projectId && clientEmail && privateKey) {
      serviceAccount = {
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      };
    }
  }

  if (!serviceAccount) {
    // Keyless fallback: Application Default Credentials (the Cloud Run runtime
    // service account) against an explicit project. Used where org policy forbids
    // service-account key files — e.g. the dedicated staging auth project
    // (moveify-staging), which has no key. Requires the runtime SA to hold
    // roles/firebaseauth.admin on FIREBASE_PROJECT_ID's project. Prod is
    // unaffected: its FIREBASE_SERVICE_ACCOUNT_JSON path is taken above.
    const adcProjectId = process.env.FIREBASE_PROJECT_ID;
    if (adcProjectId) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: adcProjectId,
      });
      enabled = true;
      console.log(`Identity Platform Admin SDK initialized (ADC, project ${adcProjectId})`);
      return true;
    }
    console.warn('Identity Platform not configured (no FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_* creds, or FIREBASE_PROJECT_ID) — IP token verification disabled');
    return false;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
  });

  enabled = true;
  console.log('Identity Platform Admin SDK initialized');
  return true;
}

function isEnabled() {
  return enabled;
}

function auth() {
  if (!enabled) return null;
  return admin.auth();
}

module.exports = { init, isEnabled, auth };
