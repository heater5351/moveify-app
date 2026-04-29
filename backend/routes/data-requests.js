// Data request routes — patient data export/deletion (APP 12, APP 13 compliance)
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/ownership');
const audit = require('../services/audit');

const router = express.Router();

router.use(authenticate);

// Rate limit data request creation (5 per hour per user)
const dataRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `data-req-${req.user.id}`,
  message: { error: 'Too many data requests. Please try again later.' }
});

// ===== PATIENT ENDPOINTS =====

// Create a data request (patient only)
router.post('/', requireRole('patient'), dataRequestLimiter, async (req, res) => {
  try {
    const { requestType } = req.body;
    const userId = req.user.id;

    if (!requestType || !['export', 'deletion'].includes(requestType)) {
      return res.status(400).json({ error: 'Request type must be "export" or "deletion"' });
    }

    // Check for existing pending/approved request of same type
    const existing = await db.getOne(
      `SELECT id FROM data_requests
       WHERE user_id = $1 AND request_type = $2 AND status IN ('pending', 'approved')`,
      [userId, requestType]
    );
    if (existing) {
      return res.status(400).json({ error: `You already have a pending ${requestType} request` });
    }

    const result = await db.query(
      `INSERT INTO data_requests (user_id, request_type)
       VALUES ($1, $2) RETURNING *`,
      [userId, requestType]
    );

    audit.log(req, 'data_request_created', 'data_request', result.rows[0].id, { type: requestType });

    res.status(201).json({ request: result.rows[0] });
  } catch (error) {
    console.error('Create data request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my requests (patient only)
router.get('/my', requireRole('patient'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM data_requests WHERE user_id = $1 ORDER BY requested_at DESC`,
      [req.user.id]
    );
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Get my data requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== ADMIN ENDPOINTS =====

// List all data requests (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT dr.*, u.name AS patient_name, u.email AS patient_email
      FROM data_requests dr
      JOIN users u ON dr.user_id = u.id
      ORDER BY
        CASE dr.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        dr.requested_at DESC
    `);
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('List data requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Deny a request (admin only)
router.patch('/:id/deny', requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { adminNotes } = req.body;

    const request = await db.getOne(
      `SELECT * FROM data_requests WHERE id = $1`,
      [requestId]
    );
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be denied' });
    }

    await db.query(
      `UPDATE data_requests SET status = 'denied', admin_notes = $1, processed_by = $2, processed_at = NOW()
       WHERE id = $3`,
      [adminNotes || null, req.user.id, requestId]
    );

    audit.log(req, 'data_request_denied', 'data_request', requestId, { user_id: request.user_id });

    res.json({ message: 'Request denied' });
  } catch (error) {
    console.error('Deny data request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve & process export (admin only)
router.patch('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);

    const request = await db.getOne(
      `SELECT * FROM data_requests WHERE id = $1`,
      [requestId]
    );
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be approved' });
    }

    if (request.request_type === 'export') {
      // Mark as completed immediately — export is served on-demand via /download
      await db.query(
        `UPDATE data_requests SET status = 'completed', processed_by = $1, processed_at = NOW()
         WHERE id = $2`,
        [req.user.id, requestId]
      );

      audit.log(req, 'data_request_approved', 'data_request', requestId, {
        type: 'export', user_id: request.user_id
      });

      res.json({ message: 'Export request approved. Patient can now download their data.' });
    } else {
      // Deletion: mark as approved (admin must confirm separately)
      await db.query(
        `UPDATE data_requests SET status = 'approved', processed_by = $1, processed_at = NOW()
         WHERE id = $2`,
        [req.user.id, requestId]
      );

      audit.log(req, 'data_request_approved', 'data_request', requestId, {
        type: 'deletion', user_id: request.user_id
      });

      res.json({ message: 'Deletion request approved. Use the execute endpoint to proceed.' });
    }
  } catch (error) {
    console.error('Approve data request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Execute deletion (admin only — separate step for safety)
router.post('/:id/execute-deletion', requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);

    const request = await db.getOne(
      `SELECT * FROM data_requests WHERE id = $1`,
      [requestId]
    );
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.request_type !== 'deletion') {
      return res.status(400).json({ error: 'This is not a deletion request' });
    }
    if (request.status !== 'approved') {
      return res.status(400).json({ error: 'Request must be approved before execution' });
    }

    const userId = request.user_id;

    // Get user info for audit before deletion
    const user = await db.getOne('SELECT email, name FROM users WHERE id = $1', [userId]);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Delete health data (cascades handle most, but be explicit for clarity)
      await client.query('DELETE FROM patient_education_modules WHERE patient_id = $1', [userId]);
      await client.query('DELETE FROM clinician_flags WHERE patient_id = $1', [userId]);
      await client.query('DELETE FROM daily_check_ins WHERE patient_id = $1', [userId]);
      await client.query('DELETE FROM exercise_completions WHERE patient_id = $1', [userId]);
      await client.query(
        `DELETE FROM program_exercises WHERE program_id IN (SELECT id FROM programs WHERE patient_id = $1)`,
        [userId]
      );
      await client.query('DELETE FROM programs WHERE patient_id = $1', [userId]);

      // Anonymize user record (keep for audit trail integrity)
      await client.query(
        `UPDATE users SET
          name = 'Deleted User',
          email = $1,
          phone = NULL,
          dob = NULL,
          address = NULL,
          password_hash = NULL
        WHERE id = $2`,
        [`deleted_${userId}@removed.local`, userId]
      );

      // Mark request as completed
      await client.query(
        `UPDATE data_requests SET status = 'completed', processed_at = NOW() WHERE id = $1`,
        [requestId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    audit.log(req, 'data_deletion_executed', 'data_request', requestId, {
      user_id: userId, email: user?.email, name: user?.name
    });

    res.json({ message: 'Patient data has been deleted and account anonymized' });
  } catch (error) {
    console.error('Execute deletion error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download patient data export (admin only)
router.get('/:id/download', requireAdmin, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);

    const request = await db.getOne(
      `SELECT * FROM data_requests WHERE id = $1`,
      [requestId]
    );
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.request_type !== 'export' || request.status !== 'completed') {
      return res.status(400).json({ error: 'Export is not ready for download' });
    }

    const userId = request.user_id;

    // Gather all patient data
    const user = await db.getOne(
      'SELECT id, name, email, phone, dob, address, created_at FROM users WHERE id = $1',
      [userId]
    );
    const programs = await db.getAll(
      'SELECT * FROM programs WHERE patient_id = $1 ORDER BY created_at',
      [userId]
    );
    const programIds = programs.map(p => p.id);

    let exercises = [];
    if (programIds.length > 0) {
      exercises = await db.getAll(
        `SELECT * FROM program_exercises WHERE program_id = ANY($1) ORDER BY program_id, exercise_order`,
        [programIds]
      );
    }

    const completions = await db.getAll(
      'SELECT * FROM exercise_completions WHERE patient_id = $1 ORDER BY completion_date',
      [userId]
    );
    const checkIns = await db.getAll(
      'SELECT * FROM daily_check_ins WHERE patient_id = $1 ORDER BY check_in_date',
      [userId]
    );

    const exportData = {
      exportDate: new Date().toISOString(),
      requestId,
      patient: user,
      programs: programs.map(p => ({
        ...p,
        exercises: exercises.filter(e => e.program_id === p.id)
      })),
      exerciseCompletions: completions,
      dailyCheckIns: checkIns
    };

    audit.log(req, 'data_export_download', 'data_request', requestId, { user_id: userId });

    const filename = `moveify-export-${user.name?.replace(/\s+/g, '-').toLowerCase() || userId}-${new Date().toISOString().split('T')[0]}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(exportData);
  } catch (error) {
    console.error('Download export error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
