// Custom exercises routes (per-clinician library)
const express = require('express');
const db = require('../database/db');

const router = express.Router();

// Get all exercises for a clinician (includes default exercises)
router.get('/clinician/:clinicianId', async (req, res) => {
  try {
    const { clinicianId } = req.params;

    const exercises = await db.getAll(`
      SELECT * FROM exercises
      WHERE clinician_id = $1
      ORDER BY created_at DESC
    `, [clinicianId]);

    res.json(exercises);
  } catch (error) {
    console.error('Get exercises error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new exercise
router.post('/', async (req, res) => {
  try {
    const { clinicianId, name, category, difficulty, duration, description, videoUrl } = req.body;

    // Validate required fields
    if (!clinicianId || !name || !category || !difficulty || !duration || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate difficulty
    const validDifficulties = ['Beginner', 'Intermediate', 'Advanced'];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty level' });
    }

    const result = await db.query(`
      INSERT INTO exercises (clinician_id, name, category, difficulty, duration, description, video_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [clinicianId, name, category, difficulty, duration, description, videoUrl || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create exercise error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update an exercise
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, difficulty, duration, description, videoUrl, clinicianId } = req.body;

    // Verify ownership
    const existing = await db.getOne('SELECT * FROM exercises WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Exercise not found' });
    }
    if (existing.clinician_id !== parseInt(clinicianId)) {
      return res.status(403).json({ error: 'Not authorized to edit this exercise' });
    }

    const result = await db.query(`
      UPDATE exercises
      SET name = $1, category = $2, difficulty = $3, duration = $4, description = $5, video_url = $6
      WHERE id = $7
      RETURNING *
    `, [name, category, difficulty, duration, description, videoUrl || null, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update exercise error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete an exercise
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clinicianId } = req.body;

    // Verify ownership
    const existing = await db.getOne('SELECT * FROM exercises WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Exercise not found' });
    }
    if (existing.clinician_id !== parseInt(clinicianId)) {
      return res.status(403).json({ error: 'Not authorized to delete this exercise' });
    }

    await db.query('DELETE FROM exercises WHERE id = $1', [id]);

    res.json({ message: 'Exercise deleted successfully' });
  } catch (error) {
    console.error('Delete exercise error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
