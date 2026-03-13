// Admin routes — clinician management, locations
const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/ownership');
const { sendClinicianInvitationEmail } = require('../services/email');
const audit = require('../services/audit');

const router = express.Router();

// All routes require admin
router.use(authenticate, requireAdmin);

// ===== CLINICIANS =====

// List all clinicians
router.get('/clinicians', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.name, u.email, u.is_admin, u.default_location_id, u.created_at,
             l.name AS location_name
      FROM users u
      LEFT JOIN locations l ON u.default_location_id = l.id
      WHERE u.role = 'clinician'
      ORDER BY u.created_at ASC
    `);
    res.json({ clinicians: result.rows });
  } catch (error) {
    console.error('List clinicians error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle admin status
router.patch('/clinicians/:id/toggle-admin', async (req, res) => {
  try {
    const clinicianId = parseInt(req.params.id);

    const clinician = await db.getOne(
      "SELECT id, is_admin FROM users WHERE id = $1 AND role = 'clinician'",
      [clinicianId]
    );
    if (!clinician) {
      return res.status(404).json({ error: 'Clinician not found' });
    }

    // Prevent removing last admin
    if (clinician.is_admin) {
      const adminCount = await db.getOne(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'clinician' AND is_admin = TRUE"
      );
      if (parseInt(adminCount.count) <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin' });
      }
    }

    const newStatus = !clinician.is_admin;
    await db.query('UPDATE users SET is_admin = $1 WHERE id = $2', [newStatus, clinicianId]);

    audit.log(req, 'toggle_admin', 'user', clinicianId, { new_status: newStatus });

    res.json({ message: `Admin status ${newStatus ? 'granted' : 'revoked'}`, isAdmin: newStatus });
  } catch (error) {
    console.error('Toggle admin error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete clinician
router.delete('/clinicians/:id', async (req, res) => {
  try {
    const clinicianId = parseInt(req.params.id);

    if (clinicianId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const clinician = await db.getOne(
      "SELECT id FROM users WHERE id = $1 AND role = 'clinician'",
      [clinicianId]
    );
    if (!clinician) {
      return res.status(404).json({ error: 'Clinician not found' });
    }

    await db.query('DELETE FROM users WHERE id = $1', [clinicianId]);

    audit.log(req, 'delete_clinician', 'user', clinicianId);

    res.json({ message: 'Clinician removed' });
  } catch (error) {
    console.error('Delete clinician error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Invite clinician
router.post('/clinicians/invite', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const existingUser = await db.getOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Use transaction to ensure token + user are created atomically
    const client = await db.getClient();
    let newClinicianId;
    try {
      await client.query('BEGIN');

      // Save invitation with clinician role
      await client.query(`
        INSERT INTO invitation_tokens (token, email, role, name, expires_at, clinician_id)
        VALUES ($1, $2, 'clinician', $3, $4, $5)
      `, [token, email, name, expiresAt, req.user.id]);

      // Create user with null password
      const userResult = await client.query(`
        INSERT INTO users (email, password_hash, role, name)
        VALUES ($1, NULL, 'clinician', $2)
        RETURNING id
      `, [email, name]);

      newClinicianId = userResult.rows[0].id;

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invitationUrl = `${baseUrl}/setup-password?token=${token}`;

    try {
      await sendClinicianInvitationEmail(email, name, invitationUrl);
    } catch (emailError) {
      console.error('Failed to send clinician invitation email:', emailError);
    }

    audit.log(req, 'clinician_invite', 'user', newClinicianId, { email });

    res.json({
      message: 'Clinician invitation sent',
      token,
      invitationUrl,
      expiresAt,
      userId: newClinicianId
    });
  } catch (error) {
    console.error('Invite clinician error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== LOCATIONS =====

// List all locations
router.get('/locations', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM locations ORDER BY name ASC');
    res.json({ locations: result.rows });
  } catch (error) {
    console.error('List locations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create location
router.post('/locations', async (req, res) => {
  try {
    const { name, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Location name is required' });
    }

    const result = await db.query(
      'INSERT INTO locations (name, address) VALUES ($1, $2) RETURNING *',
      [name.trim(), address?.trim() || null]
    );

    audit.log(req, 'create_location', 'location', result.rows[0].id);

    res.json({ location: result.rows[0] });
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update location
router.put('/locations/:id', async (req, res) => {
  try {
    const { name, address } = req.body;
    const locationId = parseInt(req.params.id);

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Location name is required' });
    }

    const result = await db.query(
      'UPDATE locations SET name = $1, address = $2 WHERE id = $3 RETURNING *',
      [name.trim(), address?.trim() || null, locationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ location: result.rows[0] });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete location
router.delete('/locations/:id', async (req, res) => {
  try {
    const locationId = parseInt(req.params.id);

    const result = await db.query('DELETE FROM locations WHERE id = $1 RETURNING id', [locationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    audit.log(req, 'delete_location', 'location', locationId);

    res.json({ message: 'Location deleted' });
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
