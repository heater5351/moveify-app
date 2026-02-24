// Periodization template service
const db = require('../database/db');

/**
 * Get templates visible to a clinician (own + global).
 */
async function getTemplates(clinicianId) {
  return db.getAll(`
    SELECT id, name, description, block_duration, created_by, is_global, created_at, updated_at
    FROM periodization_templates
    WHERE created_by = $1 OR is_global = TRUE
    ORDER BY is_global DESC, created_at DESC
  `, [clinicianId]);
}

/**
 * Create a new template with week data.
 * weeks: [{ weekNumber, sets, reps, rpeTarget, notes }]
 */
async function createTemplate(name, description, blockDuration, weeks, clinicianId, isGlobal = false) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO periodization_templates (name, description, block_duration, created_by, is_global)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [name, description || null, blockDuration, clinicianId, isGlobal]);

    const templateId = result.rows[0].id;

    for (const w of weeks) {
      await client.query(`
        INSERT INTO template_weeks (template_id, week_number, sets, reps, rpe_target, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (template_id, week_number)
        DO UPDATE SET sets = EXCLUDED.sets, reps = EXCLUDED.reps,
          rpe_target = EXCLUDED.rpe_target, notes = EXCLUDED.notes
      `, [templateId, w.weekNumber, w.sets, w.reps, w.rpeTarget || null, w.notes || null]);
    }

    await client.query('COMMIT');
    return { templateId, name, blockDuration };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get a template with all its week data.
 */
async function getTemplate(templateId) {
  const template = await db.getOne(
    `SELECT * FROM periodization_templates WHERE id = $1`,
    [templateId]
  );
  if (!template) return null;

  const weeks = await db.getAll(
    `SELECT * FROM template_weeks WHERE template_id = $1 ORDER BY week_number`,
    [templateId]
  );

  return { ...template, weeks };
}

/**
 * Update an existing template (name, description, duration, weeks).
 */
async function updateTemplate(templateId, name, description, blockDuration, weeks, clinicianId) {
  const template = await db.getOne(
    `SELECT created_by FROM periodization_templates WHERE id = $1`,
    [templateId]
  );
  if (!template) throw new Error('Template not found');
  if (template.created_by !== clinicianId) throw new Error('Not authorized to edit this template');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await client.query(`
      UPDATE periodization_templates
      SET name = $1, description = $2, block_duration = $3, updated_at = NOW()
      WHERE id = $4
    `, [name, description || null, blockDuration, templateId]);

    // Delete old weeks and insert new ones
    await client.query(`DELETE FROM template_weeks WHERE template_id = $1`, [templateId]);

    for (const w of weeks) {
      await client.query(`
        INSERT INTO template_weeks (template_id, week_number, sets, reps, rpe_target, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [templateId, w.weekNumber, w.sets, w.reps, w.rpeTarget || null, w.notes || null]);
    }

    await client.query('COMMIT');
    return { templateId, name, blockDuration };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Apply a template — returns the raw progression data (exercise-agnostic).
 */
async function applyTemplate(templateId) {
  const template = await getTemplate(templateId);
  if (!template) throw new Error('Template not found');

  return {
    blockDuration: template.block_duration,
    weeks: template.weeks.map(w => ({
      weekNumber: w.week_number,
      sets: w.sets,
      reps: w.reps,
      rpeTarget: w.rpe_target
    }))
  };
}

/**
 * Delete a template (only by owner).
 */
async function deleteTemplate(templateId, clinicianId) {
  const template = await db.getOne(
    `SELECT created_by FROM periodization_templates WHERE id = $1`,
    [templateId]
  );
  if (!template) throw new Error('Template not found');
  if (template.created_by !== clinicianId) throw new Error('Not authorized to delete this template');

  await db.query(`DELETE FROM periodization_templates WHERE id = $1`, [templateId]);
}

module.exports = {
  getTemplates,
  createTemplate,
  getTemplate,
  updateTemplate,
  applyTemplate,
  deleteTemplate
};
