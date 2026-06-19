// Authentication routes.
// Login itself is client-side via the Firebase SDK (signInWithEmailAndPassword)
// — there is no POST /login. These routes cover session restoration, profile,
// and password reset (Admin SDK).
const express = require('express');
const db = require('../database/db');
const { sendPasswordResetEmail } = require('../services/email');
const { authenticate } = require('../middleware/auth');
const identityPlatform = require('../lib/identity-platform');
const audit = require('../services/audit');
const { toLoginEmail } = require('../lib/login-identity');

const router = express.Router();

// Get current user from JWT (session restoration)
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.getOne(
      `SELECT u.id, u.email, u.role, u.name, u.dob, u.phone, u.address,
              u.is_admin, u.default_location_id, u.created_at,
              l.name AS location_name
       FROM users u
       LEFT JOIN locations l ON u.default_location_id = l.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile (authenticated user)
router.patch('/profile', authenticate, async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Email is a contact field, not a login key (identity is firebase_uid), and
    // households may legitimately share one. Only enforce uniqueness when the
    // user is actually *changing* to a new email — so a shared-email patient can
    // still edit their profile, while a typo'd duplicate is still caught.
    const me = await db.getOne('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if ((me?.email || '').toLowerCase() !== email.trim().toLowerCase()) {
      const existing = await db.getOne('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2', [email.trim(), req.user.id]);
      if (existing) {
        return res.status(400).json({ error: 'Email is already in use by another account' });
      }
    }

    await db.query(
      'UPDATE users SET name = $1, email = $2, phone = $3, address = $4 WHERE id = $5',
      [name.trim(), email.trim(), phone?.trim() || null, address?.trim() || null, req.user.id]
    );

    // Fetch updated user to return
    const user = await db.getOne(
      `SELECT u.id, u.email, u.role, u.name, u.phone, u.address, u.is_admin, u.default_location_id,
              l.name AS location_name
       FROM users u
       LEFT JOIN locations l ON u.default_location_id = l.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    audit.log(req, 'profile_update', 'user', req.user.id);

    res.json({ message: 'Profile updated', user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password — handled entirely on the frontend via Firebase SDK
// (reauthenticateWithCredential + updatePassword). No backend route needed.

// Set default location (clinician)
router.patch('/default-location', authenticate, async (req, res) => {
  try {
    const { locationId } = req.body;

    // Allow null to clear location
    if (locationId !== null && locationId !== undefined) {
      const location = await db.getOne('SELECT id FROM locations WHERE id = $1', [locationId]);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
    }

    await db.query('UPDATE users SET default_location_id = $1 WHERE id = $2', [locationId || null, req.user.id]);

    // Return updated location info
    let locationName = null;
    if (locationId) {
      const loc = await db.getOne('SELECT name FROM locations WHERE id = $1', [locationId]);
      locationName = loc?.name || null;
    }

    res.json({ message: 'Default location updated', defaultLocationId: locationId || null, locationName });
  } catch (error) {
    console.error('Set default location error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Request password reset — Identity Platform issues the action code; we
// email Firebase's reset link via our existing Gmail template.
router.post('/forgot-password', async (req, res) => {
  const genericMessage = 'If an account exists, you will receive a password reset link.';
  try {
    // Accepts either an email or a login name (shared-email patients).
    const identifier = (req.body.email || '').trim();

    if (!identifier) {
      return res.status(400).json({ error: 'Email or login name is required' });
    }

    const auth = identityPlatform.auth();
    if (!auth) {
      console.error('forgot-password called but Identity Platform not initialized');
      // Don't leak config state to clients
      return res.json({ message: genericMessage });
    }

    // Resolve what to reset (the IP account email) and where to deliver (the
    // patient's contact email). For a login name these differ: the IP account
    // is the synthetic "<name>@login.moveifyapp.com", but the link must go to
    // the real shared inbox on the user row.
    let ipEmail;
    let deliverTo;
    if (identifier.includes('@')) {
      ipEmail = identifier;
      deliverTo = identifier;
    } else {
      const u = await db.getOne('SELECT email FROM users WHERE LOWER(login_username) = LOWER($1) LIMIT 1', [identifier]);
      if (!u) {
        // Unknown login name — generic success, no enumeration.
        return res.json({ message: genericMessage });
      }
      ipEmail = toLoginEmail(identifier);
      deliverTo = u.email;
    }

    // Always return success to prevent enumeration. If the user doesn't exist
    // in IP, generatePasswordResetLink throws auth/user-not-found.
    try {
      const continueUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const link = await auth.generatePasswordResetLink(ipEmail, { url: continueUrl });
      try {
        await sendPasswordResetEmail(deliverTo, link);
      } catch (emailError) {
        console.error('Failed to send reset email:', emailError);
      }
      audit.log(req, 'password_reset_requested', 'user', null, {});
    } catch (ipError) {
      if (ipError.code !== 'auth/user-not-found' && ipError.code !== 'auth/email-not-found') {
        console.error('generatePasswordResetLink error:', ipError);
      }
    }

    res.json({ message: genericMessage });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
