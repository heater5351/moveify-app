// Patient routes
const express = require('express');
const db = require('../database/db');

const router = express.Router();

// Helper to format a patient with their programs (OPTIMIZED - reduces N+1 queries)
async function formatPatientWithPrograms(patient) {
  const today = new Date().toISOString().split('T')[0];

  // Get ALL programs with their data in ONE query
  const programs = await db.getAll(
    'SELECT * FROM programs WHERE patient_id = $1 ORDER BY created_at DESC',
    [patient.id]
  );

  if (!programs || programs.length === 0) {
    return {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      dob: patient.dob || '',
      age: patient.dob ? new Date().getFullYear() - new Date(patient.dob).getFullYear() : 0,
      condition: patient.condition || '',
      phone: patient.phone || '',
      address: patient.address || '',
      dateAdded: patient.created_at,
      assignedPrograms: []
    };
  }

  const programIds = programs.map(p => p.id);

  // Get ALL exercises for ALL programs in ONE query
  const allExercises = await db.getAll(
    `SELECT * FROM program_exercises
     WHERE program_id = ANY($1)
     ORDER BY program_id, exercise_order ASC`,
    [programIds]
  );

  // Get ALL today's completions for this patient in ONE query
  const exerciseIds = allExercises.map(ex => ex.id);
  let completions = [];
  if (exerciseIds.length > 0) {
    completions = await db.getAll(
      `SELECT exercise_id FROM exercise_completions
       WHERE exercise_id = ANY($1)
       AND patient_id = $2
       AND completion_date = $3`,
      [exerciseIds, patient.id, today]
    );
  }

  // Create a Set for O(1) lookup
  const completedExerciseIds = new Set(completions.map(c => c.exercise_id));

  // Group exercises by program
  const exercisesByProgram = {};
  allExercises.forEach(ex => {
    if (!exercisesByProgram[ex.program_id]) {
      exercisesByProgram[ex.program_id] = [];
    }
    exercisesByProgram[ex.program_id].push({
      id: ex.id,
      name: ex.exercise_name,
      category: ex.exercise_category,
      sets: ex.sets,
      reps: ex.reps,
      prescribedWeight: ex.prescribed_weight || 0,
      holdTime: ex.hold_time,
      instructions: ex.instructions,
      image: ex.image_url,
      completed: completedExerciseIds.has(ex.id),
      enablePeriodization: ex.auto_adjust_enabled !== false
    });
  });

  // Build final program structure
  const assignedPrograms = programs.map(programData => ({
    config: {
      id: programData.id,
      name: programData.name,
      startDate: programData.start_date,
      frequency: programData.frequency ? JSON.parse(programData.frequency) : [],
      duration: programData.duration,
      customEndDate: programData.custom_end_date,
      trackActualPerformance: programData.track_actual_performance === true,
      trackRpe: programData.track_rpe === true,
      trackPainLevel: programData.track_pain === true
    },
    exercises: exercisesByProgram[programData.id] || []
  }));

  return {
    id: patient.id,
    name: patient.name,
    email: patient.email,
    dob: patient.dob || '',
    age: patient.dob ? new Date().getFullYear() - new Date(patient.dob).getFullYear() : 0,
    condition: patient.condition || '',
    phone: patient.phone || '',
    address: patient.address || '',
    dateAdded: patient.created_at,
    assignedPrograms: assignedPrograms
  };
}

// Get all patients
router.get('/', async (req, res) => {
  try {
    const patients = await db.getAll(`
      SELECT id, email, role, name, dob, phone, address, condition, created_at
      FROM users
      WHERE role = 'patient'
      ORDER BY created_at DESC
    `);

    // Transform to match frontend Patient type and fetch their programs
    const formattedPatients = await Promise.all(
      patients.map(patient => formatPatientWithPrograms(patient))
    );

    res.json({ patients: formattedPatients });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single patient by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await db.getOne(`
      SELECT id, email, role, name, dob, phone, address, condition, created_at
      FROM users
      WHERE id = $1 AND role = 'patient'
    `, [id]);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const formattedPatient = await formatPatientWithPrograms(patient);
    res.json(formattedPatient);
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete patient by ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if patient exists
    const patient = await db.getOne(
      `SELECT id, email, role FROM users WHERE id = $1 AND role = 'patient'`,
      [id]
    );

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Delete the user from database
    await db.query(`DELETE FROM users WHERE id = $1 AND role = 'patient'`, [id]);

    res.json({
      message: 'Patient deleted successfully',
      deletedPatient: {
        id: patient.id,
        email: patient.email
      }
    });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
