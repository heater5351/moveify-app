// Authentication and role-based authorization middleware.
// Identity Platform only (Phase 4 complete): verifies RS256 ID tokens via
// firebase-admin and maps the IP uid to the local users row. The legacy
// HS256 JWT path (and JWT_SECRET) was removed 2026-06-10 — see
// docs/identity-platform-migration.md.
const db = require('../database/db');
const identityPlatform = require('../lib/identity-platform');

async function verifyIdentityPlatformToken(token, { checkRevoked = true } = {}) {
  const ipAuth = identityPlatform.auth();
  if (!ipAuth) {
    const err = new Error('Identity Platform not configured');
    err.code = 'IP_DISABLED';
    throw err;
  }
  const decoded = await ipAuth.verifyIdToken(token, checkRevoked);

  // Map IP uid → local users row to get id/role/is_admin. Fall back to email
  // lookup so newly-imported users (where firebase_uid backfill ran but the
  // join is still by email) keep working.
  let result = await db.query(
    'SELECT id, role, email, is_admin FROM users WHERE firebase_uid = $1 LIMIT 1',
    [decoded.uid]
  );
  if (result.rows.length === 0 && decoded.email) {
    // Only trust the email fallback when it resolves to exactly one row — a
    // shared contact email maps to multiple users, and synthetic login-name
    // accounts (firebase_uid always set) never reach here, so a 0-or-many
    // match means "can't safely identify" rather than "pick the first".
    const byEmail = await db.query(
      'SELECT id, role, email, is_admin FROM users WHERE LOWER(email) = LOWER($1)',
      [decoded.email]
    );
    if (byEmail.rows.length === 1) {
      result = byEmail;
      // Opportunistic backfill — link this user row to the IP uid for next time
      await db.query('UPDATE users SET firebase_uid = $1 WHERE id = $2 AND firebase_uid IS NULL', [decoded.uid, result.rows[0].id]);
    }
  }
  if (result.rows.length === 0) {
    const err = new Error('User record not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const u = result.rows[0];
  return { id: u.id, role: u.role, email: u.email, is_admin: !!u.is_admin };
}

/**
 * Verify an Identity Platform ID token. Reusable outside Express (e.g.
 * WebSocket handlers). Throws on failure.
 *
 * `checkRevoked` defaults to true (extra HTTP roundtrip to Firebase to
 * confirm the token hasn't been revoked). Set to false for short-lived
 * contexts like WebSocket session establishment where the 100-400ms
 * cost outweighs the security gain.
 */
async function verifyToken(token, { checkRevoked = true } = {}) {
  return await verifyIdentityPlatformToken(token, { checkRevoked });
}

/**
 * Middleware: verify bearer token (Identity Platform ID token), set req.user.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];

  try {
    req.user = await verifyIdentityPlatformToken(token);
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ error: 'Token revoked' });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(401).json({ error: 'User not found' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware: check that req.user.role is one of the allowed roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, verifyToken };
