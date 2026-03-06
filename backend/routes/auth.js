// Authentication routes
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../database/db');
const { sendPasswordResetEmail } = require('../services/email');
const { generateToken, authenticate } = require('../middleware/auth');
const audit = require('../services/audit');

const router = express.Router();

// Login route — returns JWT token
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Find user
    const user = await db.getOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      audit.log(req, 'login_failure', 'user', null, { email, reason: 'user_not_found' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      audit.log(req, 'login_failure', 'user', user.id, { reason: 'invalid_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = generateToken(user);

    // Return user data (without password)
    const { password_hash, ...userData } = user;

    audit.log(req, 'login_success', 'user', user.id);

    res.json({
      message: 'Login successful',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user from JWT (session restoration)
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.getOne(
      `SELECT u.id, u.email, u.role, u.name, u.dob, u.phone, u.address, u.condition,
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
    const { name, email, phone } = req.body;

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

    // Check if email is already taken by another user
    const existing = await db.getOne('SELECT id FROM users WHERE email = $1 AND id != $2', [email.trim(), req.user.id]);
    if (existing) {
      return res.status(400).json({ error: 'Email is already in use by another account' });
    }

    await db.query(
      'UPDATE users SET name = $1, email = $2, phone = $3 WHERE id = $4',
      [name.trim(), email.trim(), phone?.trim() || null, req.user.id]
    );

    // Fetch updated user to return
    const user = await db.getOne(
      `SELECT u.id, u.email, u.role, u.name, u.phone, u.is_admin, u.default_location_id,
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

// Change password (authenticated user)
router.patch('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await db.getOne('SELECT id, password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);

    audit.log(req, 'password_change', 'user', req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

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

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user by email
    const user = await db.getOne('SELECT id, email FROM users WHERE email = $1', [email]);

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists with this email, you will receive a password reset link.' });
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Delete any existing tokens for this user
    await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    // Store the token
    await db.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    // Send email
    try {
      await sendPasswordResetEmail(user.email, token);
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
      // Still return success to prevent enumeration
    }

    res.json({ message: 'If an account exists with this email, you will receive a password reset link.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify reset token
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const resetToken = await db.getOne(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );

    res.json({ valid: !!resetToken });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Find valid token
    const resetToken = await db.getOne(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id]);

    // Mark token as used
    await db.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [resetToken.id]);

    audit.log(req, 'password_reset', 'user', resetToken.user_id);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
