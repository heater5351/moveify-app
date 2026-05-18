// Identity Platform (Firebase Admin) SDK bootstrap.
// Lazy-initialized so the backend still starts when IP env vars are absent
// (e.g. local dev pre-Phase-2). Returns null if not configured.
const admin = require('firebase-admin');

let initialized = false;
let enabled = false;

function init() {
  if (initialized) return enabled;
  initialized = true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Identity Platform not configured (FIREBASE_* env vars missing) — IP token verification disabled, legacy JWT only');
    return false;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      // Secret Manager stores the key with literal "\n" sequences — unescape them
      privateKey: privateKey.replace(/\\n/g, '\n'),
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
