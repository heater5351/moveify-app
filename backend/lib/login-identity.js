// Shared-email login identity helpers.
//
// Most patients log in with their email. But older patients often share one
// email/phone with a spouse, and email must be unique per Identity Platform
// account. So when two patients share a contact email, the *second* one gets
// an auto-generated login name (e.g. "john-smith") instead of logging in by
// email. Under the hood that name maps to a synthetic IP account email
// "<username>@login.moveifyapp.com" — a domain we control, but nothing is ever
// mailed there. The patient only ever sees/types the login name; the frontend
// appends the domain before calling signInWithEmailAndPassword.
//
// ⚠ LOGIN_USERNAME_DOMAIN must stay in sync with the frontend constant in
// frontend/src/config.ts.
const LOGIN_USERNAME_DOMAIN = 'login.moveifyapp.com';

// Map a login name → the synthetic IP account email it authenticates against.
function toLoginEmail(username) {
  return `${String(username).trim().toLowerCase()}@${LOGIN_USERNAME_DOMAIN}`;
}

// Turn a patient name into a base login-name slug ("John Smith" → "john-smith").
// Caller is responsible for appending a numeric suffix if the slug is taken.
function slugifyName(name) {
  return (
    String(name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-') // spaces & punctuation → hyphen
      .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    || 'patient'
  );
}

// Best-effort removal of a patient's Identity Platform credential when their
// Moveify row goes away (hard delete or data-deletion anonymization). Leaving it
// behind orphans the auth account — and for a shared-email login name, the
// synthetic email "<name>@login.moveifyapp.com" would collide when the freed
// slug is later reused, breaking the new patient's login. Prefer the exact
// firebase_uid; fall back to the synthetic login-name email for rows whose uid
// was never recorded (or diverged historically). Caller passes the IP auth
// instance so this stays dependency-free; a missing account is not an error.
async function deleteLoginAccount(auth, { firebaseUid, loginUsername } = {}) {
  if (!auth) return;
  try {
    if (firebaseUid) {
      await auth.deleteUser(String(firebaseUid));
      return;
    }
    if (loginUsername) {
      const existing = await auth.getUserByEmail(toLoginEmail(loginUsername)).catch(() => null);
      if (existing) await auth.deleteUser(existing.uid);
    }
  } catch (err) {
    // Already gone is fine; anything else propagates to the caller's best-effort
    // handler (which logs without blocking the deletion).
    if (err.code !== 'auth/user-not-found') throw err;
  }
}

module.exports = { LOGIN_USERNAME_DOMAIN, toLoginEmail, slugifyName, deleteLoginAccount };
