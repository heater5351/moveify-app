// Custom exercises routes (per-clinician library)
const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// All exercise routes require authentication and clinician role
router.use(authenticate, requireRole('clinician'));

// Get all custom exercises (shared across all clinicians)
router.get('/', async (req, res) => {
  try {
    const { joint_area, muscle_group, movement_type, equipment, position, category } = req.query;

    let query = 'SELECT * FROM exercises WHERE 1=1';
    let params = [];
    let paramIndex = 1;

    // Sanitize filter values — strip wildcard characters to prevent LIKE abuse
    const sanitizeFilter = (val) => val.replace(/[%_]/g, '');

    if (joint_area) {
      query += ` AND joint_area LIKE $${paramIndex}`;
      params.push(`%${sanitizeFilter(joint_area)}%`);
      paramIndex++;
    }
    if (muscle_group) {
      query += ` AND muscle_group LIKE $${paramIndex}`;
      params.push(`%${sanitizeFilter(muscle_group)}%`);
      paramIndex++;
    }
    if (movement_type) {
      query += ` AND movement_type LIKE $${paramIndex}`;
      params.push(`%${sanitizeFilter(movement_type)}%`);
      paramIndex++;
    }
    if (equipment) {
      query += ` AND equipment LIKE $${paramIndex}`;
      params.push(`%${sanitizeFilter(equipment)}%`);
      paramIndex++;
    }
    if (position) {
      query += ` AND position LIKE $${paramIndex}`;
      params.push(`%${sanitizeFilter(position)}%`);
      paramIndex++;
    }
    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
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

// Create a new exercise (clinicianId from JWT)
router.post('/', async (req, res) => {
  try {
    const clinicianId = req.user.id;
    const {
      name, category, duration, description, videoUrl,
      jointArea, muscleGroup, movementType, equipment, position, exerciseType
    } = req.body;

    if (!name || !category || !duration || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validExerciseTypes = ['reps', 'duration', 'cardio'];
    const safeExerciseType = validExerciseTypes.includes(exerciseType) ? exerciseType : 'reps';

    const result = await db.query(`
      INSERT INTO exercises (
        clinician_id, name, category, difficulty, duration, description, video_url,
        joint_area, muscle_group, movement_type, equipment, position, exercise_type
      )
      VALUES ($1, $2, $3, 'Beginner', $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      clinicianId, name, category, duration, description, videoUrl || null,
      jointArea || null, muscleGroup || null, movementType || null, equipment || null, position || null,
      safeExerciseType
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create exercise error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update an exercise (any clinician can edit)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, category, duration, description, videoUrl,
      jointArea, muscleGroup, movementType, equipment, position, exerciseType
    } = req.body;

    const existing = await db.getOne('SELECT * FROM exercises WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    const validExerciseTypes = ['reps', 'duration', 'cardio'];
    const safeExerciseType = validExerciseTypes.includes(exerciseType) ? exerciseType : 'reps';

    const result = await db.query(`
      UPDATE exercises
      SET name = $1, category = $2, duration = $3, description = $4, video_url = $5,
          joint_area = $6, muscle_group = $7, movement_type = $8, equipment = $9, position = $10,
          exercise_type = $11
      WHERE id = $12
      RETURNING *
    `, [
      name, category, duration, description, videoUrl || null,
      jointArea || null, muscleGroup || null, movementType || null, equipment || null, position || null,
      safeExerciseType, id
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update exercise error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get favorites for the authenticated clinician
router.get('/favorites', async (req, res) => {
  try {
    const clinicianId = req.user.id;

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

// Add favorite (clinicianId from JWT)
router.post('/favorites', async (req, res) => {
  try {
    const clinicianId = req.user.id;
    const { exerciseId, exerciseType } = req.body;

    if (!exerciseId || !exerciseType) {
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

// Remove favorite (clinicianId from JWT)
router.delete('/favorites', async (req, res) => {
  try {
    const clinicianId = req.user.id;
    const { exerciseId, exerciseType } = req.body;

    if (!exerciseId || !exerciseType) {
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

// Delete an exercise (any clinician can delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.getOne('SELECT * FROM exercises WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    await db.query('DELETE FROM exercises WHERE id = $1', [id]);

    res.json({ message: 'Exercise deleted successfully' });
  } catch (error) {
    console.error('Delete exercise error:', error);
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
