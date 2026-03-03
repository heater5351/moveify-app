// Program template CRUD routes
const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const db = require('../database/db');
const audit = require('../services/audit');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('clinician'));

// GET / — list all templates (shared across clinicians)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT pt.id, pt.name, pt.description, pt.created_at,
             COUNT(pte.id)::int AS exercise_count
      FROM program_templates pt
      LEFT JOIN program_template_exercises pte ON pte.template_id = pt.id
      GROUP BY pt.id
      ORDER BY pt.created_at DESC
    `);
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('List program templates error:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /:id — get template with exercises
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await db.getOne(
      'SELECT id, name, description, created_at FROM program_templates WHERE id = $1',
      [id]
    );
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const exercises = await db.query(
      `SELECT exercise_name, exercise_category, sets, reps, prescribed_weight,
              hold_time, instructions, image_url, exercise_order
       FROM program_template_exercises
       WHERE template_id = $1
       ORDER BY exercise_order`,
      [id]
    );

    res.json({ ...template, exercises: exercises.rows });
  } catch (error) {
    console.error('Get program template error:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// POST / — create template
router.post('/', async (req, res) => {
  const client = await db.getClient();
  try {
    const { name, description, exercises } = req.body;

    if (!name || !exercises || !exercises.length) {
      return res.status(400).json({ error: 'name and exercises are required' });
    }

    await client.query('BEGIN');

    const tmpl = await client.query(
      `INSERT INTO program_templates (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [name, description || null, req.user.id]
    );
    const templateId = tmpl.rows[0].id;

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await client.query(
        `INSERT INTO program_template_exercises
           (template_id, exercise_name, exercise_category, sets, reps, prescribed_weight, hold_time, instructions, image_url, exercise_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          templateId,
          ex.exercise_name,
          ex.exercise_category || null,
          ex.sets,
          ex.reps,
          ex.prescribed_weight || 0,
          ex.hold_time || null,
          ex.instructions || null,
          ex.image_url || null,
          i
        ]
      );
    }

    await client.query('COMMIT');

    audit.log(req, 'program_template_create', 'program_template', templateId, { name });
    res.json({ message: 'Template created', templateId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create program template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  } finally {
    client.release();
  }
});

// PUT /:id — update template
router.put('/:id', async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { name, description, exercises } = req.body;

    if (!name || !exercises || !exercises.length) {
      return res.status(400).json({ error: 'name and exercises are required' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE program_templates SET name = $1, description = $2, updated_at = NOW() WHERE id = $3`,
      [name, description || null, id]
    );

    await client.query('DELETE FROM program_template_exercises WHERE template_id = $1', [id]);

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await client.query(
        `INSERT INTO program_template_exercises
           (template_id, exercise_name, exercise_category, sets, reps, prescribed_weight, hold_time, instructions, image_url, exercise_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          ex.exercise_name,
          ex.exercise_category || null,
          ex.sets,
          ex.reps,
          ex.prescribed_weight || 0,
          ex.hold_time || null,
          ex.instructions || null,
          ex.image_url || null,
          i
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Template updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update program template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  } finally {
    client.release();
  }
});

// DELETE /:id — delete template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM program_templates WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    audit.log(req, 'program_template_delete', 'program_template', parseInt(id));
    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Delete program template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
