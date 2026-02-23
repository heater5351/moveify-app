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
 * weeks: [{ exerciseSlot, weekNumber, sets, reps, rpeTarget, notes }]
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
        INSERT INTO template_weeks (template_id, exercise_slot, week_number, sets, reps, rpe_target, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (template_id, exercise_slot, week_number)
        DO UPDATE SET sets = EXCLUDED.sets, reps = EXCLUDED.reps,
          rpe_target = EXCLUDED.rpe_target, notes = EXCLUDED.notes
      `, [templateId, w.exerciseSlot, w.weekNumber, w.sets, w.reps, w.rpeTarget || null, w.notes || null]);
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
    `SELECT * FROM template_weeks WHERE template_id = $1 ORDER BY exercise_slot, week_number`,
    [templateId]
  );

  return { ...template, weeks };
}

/**
 * Apply a template to a list of exercise IDs.
 * Returns pre-filled exerciseWeeks cells ready to pass to createBlock.
 * If fewer exercises than template slots, truncates. If more, leaves extras empty.
 */
async function applyTemplate(templateId, programExerciseIds) {
  const template = await getTemplate(templateId);
  if (!template) throw new Error('Template not found');

  const exerciseWeeks = [];
  const slots = [...new Set(template.weeks.map(w => w.exercise_slot))].sort((a, b) => a - b);

  slots.forEach((slot, idx) => {
    const exerciseId = programExerciseIds[idx];
    if (!exerciseId) return; // No exercise for this slot

    const slotWeeks = template.weeks.filter(w => w.exercise_slot === slot);
    slotWeeks.forEach(w => {
      exerciseWeeks.push({
        programExerciseId: exerciseId,
        weekNumber: w.week_number,
        sets: w.sets,
        reps: w.reps,
        rpeTarget: w.rpe_target,
        notes: w.notes
      });
    });
  });

  return { blockDuration: template.block_duration, exerciseWeeks };
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
  applyTemplate,
  deleteTemplate
};
