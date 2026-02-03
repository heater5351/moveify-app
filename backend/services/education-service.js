// Education module service
const db = require('../database/db');

/**
 * Create a new education module
 */
async function createModule(moduleData) {
  const result = await db.query(`
    INSERT INTO education_modules (
      title, description, content, category,
      estimated_duration_minutes, image_url, video_url, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    moduleData.title,
    moduleData.description || null,
    moduleData.content,
    moduleData.category || null,
    moduleData.estimatedDurationMinutes || null,
    moduleData.imageUrl || null,
    moduleData.videoUrl || null,
    moduleData.createdBy
  ]);

  return result.rows[0];
}

/**
 * Get all education modules
 */
async function getAllModules(filters = {}) {
  let query = 'SELECT * FROM education_modules WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filters.category) {
    query += ` AND category = $${paramIndex++}`;
    params.push(filters.category);
  }

  if (filters.createdBy) {
    query += ` AND created_by = $${paramIndex++}`;
    params.push(filters.createdBy);
  }

  query += ' ORDER BY created_at DESC';

  const modules = await db.getAll(query, params);

  return modules.map(module => ({
    id: module.id,
    title: module.title,
    description: module.description,
    content: module.content,
    category: module.category,
    estimatedDurationMinutes: module.estimated_duration_minutes,
    imageUrl: module.image_url,
    videoUrl: module.video_url,
    createdBy: module.created_by,
    createdAt: module.created_at,
    updatedAt: module.updated_at
  }));
}

/**
 * Get a single module by ID
 */
async function getModuleById(moduleId) {
  const module = await db.getOne(
    'SELECT * FROM education_modules WHERE id = $1',
    [moduleId]
  );

  if (!module) {
    return null;
  }

  return {
    id: module.id,
    title: module.title,
    description: module.description,
    content: module.content,
    category: module.category,
    estimatedDurationMinutes: module.estimated_duration_minutes,
    imageUrl: module.image_url,
    videoUrl: module.video_url,
    createdBy: module.created_by,
    createdAt: module.created_at,
    updatedAt: module.updated_at
  };
}

/**
 * Update an education module
 */
async function updateModule(moduleId, updates) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(updates.title);
  }

  if (updates.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }

  if (updates.content !== undefined) {
    fields.push(`content = $${paramIndex++}`);
    values.push(updates.content);
  }

  if (updates.category !== undefined) {
    fields.push(`category = $${paramIndex++}`);
    values.push(updates.category);
  }

  if (updates.estimatedDurationMinutes !== undefined) {
    fields.push(`estimated_duration_minutes = $${paramIndex++}`);
    values.push(updates.estimatedDurationMinutes);
  }

  if (updates.imageUrl !== undefined) {
    fields.push(`image_url = $${paramIndex++}`);
    values.push(updates.imageUrl);
  }

  if (updates.videoUrl !== undefined) {
    fields.push(`video_url = $${paramIndex++}`);
    values.push(updates.videoUrl);
  }

  fields.push(`updated_at = NOW()`);
  values.push(moduleId);

  await db.query(`
    UPDATE education_modules
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
  `, values);

  return await getModuleById(moduleId);
}

/**
 * Delete an education module
 */
async function deleteModule(moduleId) {
  await db.query('DELETE FROM education_modules WHERE id = $1', [moduleId]);
}

/**
 * Assign a module to a patient
 */
async function assignModuleToPatient(patientId, moduleId) {
  const result = await db.query(`
    INSERT INTO patient_education_modules (patient_id, module_id)
    VALUES ($1, $2)
    ON CONFLICT (patient_id, module_id) DO NOTHING
    RETURNING *
  `, [patientId, moduleId]);

  return result.rows[0];
}

/**
 * Get all modules assigned to a patient
 */
async function getPatientModules(patientId) {
  const modules = await db.getAll(`
    SELECT
      em.*,
      pem.id as assignment_id,
      pem.assigned_date,
      pem.viewed,
      pem.viewed_at
    FROM patient_education_modules pem
    JOIN education_modules em ON pem.module_id = em.id
    WHERE pem.patient_id = $1
    ORDER BY pem.assigned_date DESC, em.created_at DESC
  `, [patientId]);

  return modules.map(module => ({
    assignmentId: module.assignment_id,
    id: module.id,
    title: module.title,
    description: module.description,
    content: module.content,
    category: module.category,
    estimatedDurationMinutes: module.estimated_duration_minutes,
    imageUrl: module.image_url,
    videoUrl: module.video_url,
    assignedDate: module.assigned_date,
    viewed: module.viewed,
    viewedAt: module.viewed_at
  }));
}

/**
 * Mark a module as viewed by a patient
 */
async function markModuleAsViewed(patientId, moduleId) {
  await db.query(`
    UPDATE patient_education_modules
    SET viewed = true, viewed_at = NOW()
    WHERE patient_id = $1 AND module_id = $2
  `, [patientId, moduleId]);
}

/**
 * Unassign a module from a patient
 */
async function unassignModuleFromPatient(patientId, moduleId) {
  await db.query(`
    DELETE FROM patient_education_modules
    WHERE patient_id = $1 AND module_id = $2
  `, [patientId, moduleId]);
}

/**
 * Get module categories
 */
async function getCategories() {
  const result = await db.getAll(`
    SELECT DISTINCT category
    FROM education_modules
    WHERE category IS NOT NULL
    ORDER BY category
  `);

  return result.map(row => row.category);
}

module.exports = {
  createModule,
  getAllModules,
  getModuleById,
  updateModule,
  deleteModule,
  assignModuleToPatient,
  getPatientModules,
  markModuleAsViewed,
  unassignModuleFromPatient,
  getCategories
};
