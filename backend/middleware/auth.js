// JWT authentication and role-based authorization middleware
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
// Session durations by role
const EXPIRY_PATIENT = '14d';
const EXPIRY_CLINICIAN = '12h';
const EXPIRY_CLINICIAN_REMEMBER = '7d';

// Fail fast if JWT_SECRET is not configured
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

/**
 * Generate a JWT token for a user
 * @param {object} options - Optional: { rememberMe: boolean }
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

/**
 * Middleware: verify JWT from Authorization header, set req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: decoded.id, role: decoded.role, email: decoded.email, is_admin: !!decoded.is_admin };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
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

module.exports = { generateToken, authenticate, requireRole };
