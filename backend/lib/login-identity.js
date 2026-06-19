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

module.exports = { LOGIN_USERNAME_DOMAIN, toLoginEmail, slugifyName };
