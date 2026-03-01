// Invitation routes
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { sendInvitationEmail } = require('../services/email');

const router = express.Router();

// Generate invitation for new user (called by clinician)
router.post('/generate', async (req, res) => {
  try {
    const { email, role, name, dob, phone, address, condition } = req.body;

    // Validate required fields
    if (!email || !role || !name) {
      return res.status(400).json({ error: 'Email, role, and name are required' });
    }

    // Check if user already exists
    const existingUser = await db.getOne('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiration (7 days from now)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Save invitation
    await db.query(`
      INSERT INTO invitation_tokens (token, email, role, name, dob, phone, address, condition, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [token, email, role, name, dob, phone, address, condition, expiresAt]);

    // Create user immediately with null password (they'll set it when accepting invitation)
    const userResult = await db.query(`
      INSERT INTO users (email, password_hash, role, name, dob, phone, address, condition)
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [email, role, name, dob, phone, address, condition]);

    // Generate invitation URL - use env var in production
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invitationUrl = `${baseUrl}/setup-password?token=${token}`;

    // Send invitation email
    try {
      await sendInvitationEmail(email, name, invitationUrl);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Still return success — invitation was created, email just failed
    }

    res.json({
      message: 'Invitation created successfully',
      token,
      invitationUrl,
      expiresAt,
      userId: userResult.rows[0].id
    });
  } catch (error) {
    console.error('Generate invitation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate invitation token
router.get('/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const invitation = await db.getOne(`
      SELECT * FROM invitation_tokens
      WHERE token = $1 AND used = 0 AND expires_at > NOW()
    `, [token]);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    res.json({
      valid: true,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Set password using invitation token
router.post('/set-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    // Validate invitation
    const invitation = await db.getOne(`
      SELECT * FROM invitation_tokens
      WHERE token = $1 AND used = 0 AND expires_at > NOW()
    `, [token]);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user account with password
    await db.query(`
      UPDATE users
      SET password_hash = $1
      WHERE email = $2 AND role = $3
    `, [passwordHash, invitation.email, invitation.role]);

    // Mark invitation as used
    await db.query('UPDATE invitation_tokens SET used = 1 WHERE token = $1', [token]);

    // Get the user ID
    const user = await db.getOne('SELECT id FROM users WHERE email = $1', [invitation.email]);

    res.json({
      message: 'Password set successfully. You can now login.',
      userId: user.id
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
