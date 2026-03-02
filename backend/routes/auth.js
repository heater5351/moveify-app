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
      'SELECT id, email, role, name, dob, phone, address, condition, created_at FROM users WHERE id = $1',
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
