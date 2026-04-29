// Invitation routes
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { sendInvitationEmail } = require('../services/email');
const { authenticate, requireRole } = require('../middleware/auth');
const audit = require('../services/audit');
const cliniko = require('../services/cliniko');

const router = express.Router();

// Generate invitation for new patient (called by clinician)
router.post('/generate', authenticate, requireRole('clinician'), async (req, res) => {
  try {
    let { email, name, dob, phone, address, condition, clinikoPatientId } = req.body;

    // If a Cliniko patient ID was provided, pull authoritative data from Cliniko
    if (clinikoPatientId) {
      try {
        const cp = await cliniko.getPatient(clinikoPatientId);
        name = name || `${cp.first_name} ${cp.last_name}`.trim();
        email = email || cp.email;
        dob = dob || cp.date_of_birth || '';
        phone = phone || cp.patient_phone_numbers?.[0]?.number || '';
      } catch (clinikoErr) {
        console.error('Cliniko fetch during invite:', clinikoErr);
        return res.status(502).json({ error: 'Could not fetch patient details from Cliniko. Please try again.' });
      }
    }

    // Validate required fields
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if user already exists
    const existingUser = await db.getOne('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    if (existingUser && existingUser.password_hash !== null) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const clinicianId = req.user.id;

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiration (14 days from now)
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Use transaction to ensure token + user are created atomically
    const client = await db.getClient();
    let patientId;
    try {
      await client.query('BEGIN');

      // Invalidate any previous invitation tokens for this email
      await client.query(`UPDATE invitation_tokens SET used = 1 WHERE email = $1 AND used = 0`, [email]);

      // Save invitation (always patient role)
      await client.query(`
        INSERT INTO invitation_tokens (token, email, role, name, dob, phone, address, condition, expires_at, clinician_id)
        VALUES ($1, $2, 'patient', $3, $4, $5, $6, $7, $8, $9)
      `, [token, email, name, dob, phone, address, condition, expiresAt, clinicianId]);

      if (existingUser) {
        // Resend: user row already exists with no password — just reuse it
        patientId = existingUser.id;
        // Update cliniko link if provided
        if (clinikoPatientId) {
          await client.query(
            `UPDATE users SET cliniko_patient_id = $1, cliniko_synced_at = NOW() WHERE id = $2`,
            [clinikoPatientId, patientId]
          );
        }
      } else {
        // New invite: create user with null password
        const userResult = await client.query(`
          INSERT INTO users (email, password_hash, role, name, dob, phone, address, condition,
                             cliniko_patient_id, cliniko_synced_at)
          VALUES ($1, NULL, 'patient', $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [email, name, dob, phone, address, condition,
            clinikoPatientId || null,
            clinikoPatientId ? new Date().toISOString() : null]);
        patientId = userResult.rows[0].id;
      }

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // Generate invitation URL - use env var in production
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invitationUrl = `${baseUrl}/setup-password?token=${token}`;

    // Send invitation email
    try {
      await sendInvitationEmail(email, name, invitationUrl);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      return res.status(500).json({ error: 'Invitation created but failed to send email. Please check email configuration.' });
    }

    audit.log(req, 'patient_invite', 'patient', patientId, { email });

    res.json({
      message: 'Invitation created successfully',
      token,
      invitationUrl,
      expiresAt,
      userId: patientId
    });
  } catch (error) {
    console.error('Generate invitation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate invitation token (public — used by setup-password page)
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

// Set password using invitation token (public — used by setup-password page)
router.post('/set-password', async (req, res) => {
  try {
    const { token, password, healthDataConsent } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Atomically claim the invitation token (prevents race condition with concurrent requests)
    const invitation = await db.getOne(`
      UPDATE invitation_tokens
      SET used = 1
      WHERE token = $1 AND used = 0 AND expires_at > NOW()
      RETURNING *
    `, [token]);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Only require health data consent for patients
    if (invitation.role === 'patient' && healthDataConsent !== true) {
      // Undo the claim so the patient can retry with consent
      await db.query('UPDATE invitation_tokens SET used = 0 WHERE token = $1', [token]);
      return res.status(400).json({ error: 'You must consent to health data collection to create an account' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user account with password (and consent for patients)
    if (invitation.role === 'patient') {
      await db.query(`
        UPDATE users
        SET password_hash = $1, health_data_consent = TRUE, health_data_consent_date = NOW(), consent_version = '1.0'
        WHERE email = $2 AND role = $3
      `, [passwordHash, invitation.email, invitation.role]);
    } else {
      await db.query(`
        UPDATE users SET password_hash = $1 WHERE email = $2 AND role = $3
      `, [passwordHash, invitation.email, invitation.role]);
    }

    // Get the user ID
    const user = await db.getOne('SELECT id FROM users WHERE email = $1', [invitation.email]);

    // Audit log consent
    audit.log(req, 'health_data_consent', 'user', user.id, { consent_version: '1.0' });

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
