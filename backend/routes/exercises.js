// Custom exercises routes (per-clinician library)
const express = require('express');
const db = require('../database/db');

const router = express.Router();

// Get all exercises for a clinician with optional filters
router.get('/clinician/:clinicianId', async (req, res) => {
  try {
    const { clinicianId } = req.params;
    const { joint_area, muscle_group, movement_type, equipment, position, category, difficulty } = req.query;

    let query = 'SELECT * FROM exercises WHERE clinician_id = $1';
    let params = [clinicianId];
    let paramIndex = 2;

    // Add filter conditions dynamically (using LIKE for comma-separated values)
    if (joint_area) {
      query += ` AND joint_area LIKE $${paramIndex}`;
      params.push(`%${joint_area}%`);
      paramIndex++;
    }
    if (muscle_group) {
      query += ` AND muscle_group LIKE $${paramIndex}`;
      params.push(`%${muscle_group}%`);
      paramIndex++;
    }
    if (movement_type) {
      query += ` AND movement_type LIKE $${paramIndex}`;
      params.push(`%${movement_type}%`);
      paramIndex++;
    }
    if (equipment) {
      query += ` AND equipment LIKE $${paramIndex}`;
      params.push(`%${equipment}%`);
      paramIndex++;
    }
    if (position) {
      query += ` AND position LIKE $${paramIndex}`;
      params.push(`%${position}%`);
      paramIndex++;
    }
    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    if (difficulty) {
      query += ` AND difficulty = $${paramIndex}`;
      params.push(difficulty);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const exercises = await db.getAll(query, params);

    res.json(exercises);
  } catch (error) {
    console.error('Get exercises error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new exercise
router.post('/', async (req, res) => {
  try {
    const {
      clinicianId, name, category, difficulty, duration, description, videoUrl,
      jointArea, muscleGroup, movementType, equipment, position
    } = req.body;

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
      INSERT INTO exercises (
        clinician_id, name, category, difficulty, duration, description, video_url,
        joint_area, muscle_group, movement_type, equipment, position
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      clinicianId, name, category, difficulty, duration, description, videoUrl || null,
      jointArea || null, muscleGroup || null, movementType || null, equipment || null, position || null
    ]);

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
    const {
      name, category, difficulty, duration, description, videoUrl, clinicianId,
      jointArea, muscleGroup, movementType, equipment, position
    } = req.body;

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
      SET name = $1, category = $2, difficulty = $3, duration = $4, description = $5, video_url = $6,
          joint_area = $7, muscle_group = $8, movement_type = $9, equipment = $10, position = $11
      WHERE id = $12
      RETURNING *
    `, [
      name, category, difficulty, duration, description, videoUrl || null,
      jointArea || null, muscleGroup || null, movementType || null, equipment || null, position || null,
      id
    ]);

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

// Get favorites for a clinician
router.get('/favorites/:clinicianId', async (req, res) => {
  try {
    const { clinicianId } = req.params;

    const favorites = await db.getAll(`
      SELECT exercise_id, exercise_type, created_at
      FROM exercise_favorites
      WHERE clinician_id = $1
      ORDER BY created_at DESC
    `, [clinicianId]);

    res.json(favorites);
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add favorite
router.post('/favorites', async (req, res) => {
  try {
    const { clinicianId, exerciseId, exerciseType } = req.body;

    if (!clinicianId || !exerciseId || !exerciseType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await db.query(`
      INSERT INTO exercise_favorites (clinician_id, exercise_id, exercise_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (clinician_id, exercise_id, exercise_type) DO NOTHING
      RETURNING *
    `, [clinicianId, exerciseId, exerciseType]);

    res.status(201).json(result.rows[0] || { message: 'Already favorited' });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove favorite
router.delete('/favorites', async (req, res) => {
  try {
    const { clinicianId, exerciseId, exerciseType } = req.body;

    if (!clinicianId || !exerciseId || !exerciseType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await db.query(`
      DELETE FROM exercise_favorites
      WHERE clinician_id = $1 AND exercise_id = $2 AND exercise_type = $3
    `, [clinicianId, exerciseId, exerciseType]);

    res.json({ message: 'Favorite removed successfully' });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get filter options (distinct values for dropdowns)
router.get('/filter-options', async (req, res) => {
  try {
    const [jointAreas, muscleGroups, movementTypes, equipment, positions] = await Promise.all([
      db.getAll('SELECT DISTINCT joint_area FROM exercises WHERE joint_area IS NOT NULL ORDER BY joint_area'),
      db.getAll('SELECT DISTINCT muscle_group FROM exercises WHERE muscle_group IS NOT NULL ORDER BY muscle_group'),
      db.getAll('SELECT DISTINCT movement_type FROM exercises WHERE movement_type IS NOT NULL ORDER BY movement_type'),
      db.getAll('SELECT DISTINCT equipment FROM exercises WHERE equipment IS NOT NULL ORDER BY equipment'),
      db.getAll('SELECT DISTINCT position FROM exercises WHERE position IS NOT NULL ORDER BY position')
    ]);

    res.json({
      jointAreas: jointAreas.map(r => r.joint_area),
      muscleGroups: muscleGroups.map(r => r.muscle_group),
      movementTypes: movementTypes.map(r => r.movement_type),
      equipment: equipment.map(r => r.equipment),
      positions: positions.map(r => r.position)
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
