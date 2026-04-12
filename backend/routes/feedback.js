const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/ownership');
const audit = require('../services/audit');

const router = express.Router();

router.use(authenticate);

// Rate limit: 5 reports per hour per user
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `feedback-${req.user.id}`,
  message: { error: 'Too many reports. Please try again later.' }
});

// Submit a bug report (any authenticated user)
router.post('/', feedbackLimiter, async (req, res) => {
  try {
    const { category, description, page } = req.body;
    const userId = req.user.id;

    if (!category || !['bug', 'feature', 'other'].includes(category)) {
      return res.status(400).json({ error: 'Category must be "bug", "feature", or "other"' });
    }
    if (!description || description.trim().length < 10) {
      return res.status(400).json({ error: 'Description must be at least 10 characters' });
    }
    if (description.length > 2000) {
      return res.status(400).json({ error: 'Description must be under 2000 characters' });
    }

    const result = await db.getOne(
      `INSERT INTO bug_reports (user_id, category, description, page)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [userId, category, description.trim(), page || null]
    );

    audit.log(userId, 'create', 'bug_report', result.id, { category, page }, req.ip);

    res.status(201).json({ id: result.id, message: 'Report submitted successfully' });
  } catch (error) {
    console.error('Error submitting bug report:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// ===== ADMIN ENDPOINTS =====

// Get all bug reports (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT br.*, u.name as reporter_name, u.email as reporter_email, u.role as reporter_role
      FROM bug_reports br
      JOIN users u ON br.user_id = u.id
    `;
    const params = [];

    if (status && ['open', 'reviewed', 'resolved'].includes(status)) {
      query += ' WHERE br.status = $1';
      params.push(status);
    }

    query += ' ORDER BY br.created_at DESC';

    const reports = await db.query(query, params);
    res.json(reports.rows);
  } catch (error) {
    console.error('Error fetching bug reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Update bug report status (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (status && !['open', 'reviewed', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (adminNotes !== undefined) {
      updates.push(`admin_notes = $${paramIndex++}`);
      params.push(adminNotes);
    }
    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const result = await db.getOne(
      `UPDATE bug_reports SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (!result) {
      return res.status(404).json({ error: 'Report not found' });
    }

    audit.log(req.user.id, 'update', 'bug_report', id, { status, adminNotes }, req.ip);

    res.json(result);
  } catch (error) {
    console.error('Error updating bug report:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

module.exports = router;
