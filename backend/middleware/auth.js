// JWT authentication and role-based authorization middleware.
// Phase 1 of Identity Platform migration: dual-mode authenticate() accepts
// both legacy HS256 JWTs (current behavior) and Identity Platform RS256
// ID tokens. See docs/identity-platform-migration.md.
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const identityPlatform = require('../lib/identity-platform');

const JWT_SECRET = process.env.JWT_SECRET;
// Session durations by role (legacy JWT path only)
const EXPIRY_PATIENT = '14d';
const EXPIRY_CLINICIAN = '12h';
const EXPIRY_CLINICIAN_REMEMBER = '7d';

// Fail fast if JWT_SECRET is not configured
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

/**
 * Generate a legacy JWT token for a user. Retained during Phase 1–3 so the
 * existing login flow keeps working alongside Identity Platform.
 */
function generateToken(user, options = {}) {
  let expiresIn;
  if (user.role === 'patient') {
    expiresIn = EXPIRY_PATIENT;
  } else if (options.rememberMe) {
    expiresIn = EXPIRY_CLINICIAN_REMEMBER;
  } else {
    expiresIn = EXPIRY_CLINICIAN;
  }

  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, is_admin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn }
  );
}

function isLikelyIdentityPlatformToken(token) {
  // ID tokens are RS256 with a kid; legacy tokens are HS256 with no kid.
  // jwt.decode() returns null on malformed input.
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header) return false;
  return decoded.header.alg === 'RS256' && !!decoded.header.kid;
}

async function verifyIdentityPlatformToken(token) {
  const ipAuth = identityPlatform.auth();
  if (!ipAuth) {
    const err = new Error('Identity Platform not configured');
    err.code = 'IP_DISABLED';
    throw err;
  }
  const decoded = await ipAuth.verifyIdToken(token, true /* checkRevoked */);

  // Map IP uid → local users row to get id/role/is_admin. Fall back to email
  // lookup so newly-imported users (where firebase_uid backfill ran but the
  // join is still by email) keep working.
  let result = await db.query(
    'SELECT id, role, email, is_admin FROM users WHERE firebase_uid = $1 LIMIT 1',
    [decoded.uid]
  );
  if (result.rows.length === 0 && decoded.email) {
    result = await db.query(
      'SELECT id, role, email, is_admin FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [decoded.email]
    );
    // Opportunistic backfill — link this user row to the IP uid for next time
    if (result.rows.length > 0) {
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

function verifyLegacyToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  return { id: decoded.id, role: decoded.role, email: decoded.email, is_admin: !!decoded.is_admin };
}

/**
 * Verify a bearer token in either Identity Platform or legacy JWT mode.
 * Reusable outside Express (e.g. WebSocket handlers). Throws on failure.
 */
async function verifyTokenAnyMode(token) {
  if (isLikelyIdentityPlatformToken(token) && identityPlatform.isEnabled()) {
    return await verifyIdentityPlatformToken(token);
  }
  return verifyLegacyToken(token);
}

/**
 * Middleware: verify bearer token (IP RS256 or legacy HS256), set req.user.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];

  try {
    if (isLikelyIdentityPlatformToken(token) && identityPlatform.isEnabled()) {
      req.user = await verifyIdentityPlatformToken(token);
      return next();
    }
    req.user = verifyLegacyToken(token);
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

module.exports = { generateToken, authenticate, requireRole, verifyTokenAnyMode };
