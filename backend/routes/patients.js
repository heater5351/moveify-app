// Patient routes
const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePatientAccess, requireAdmin } = require('../middleware/ownership');
const audit = require('../services/audit');

const router = express.Router();

// All patient routes require authentication
router.use(authenticate);

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

  // Get ALL completions for the patient (no date window limit)
  const exerciseIds = allExercises.map(ex => ex.id);
  let completions = [];
  if (exerciseIds.length > 0) {
    completions = await db.getAll(
      `SELECT
        exercise_id,
        completion_date,
        sets_performed as "setsPerformed",
        reps_performed as "repsPerformed",
        weight_performed as "weightPerformed",
        duration_performed as "durationPerformed",
        rpe_rating as "rpeRating",
        pain_level as "painLevel",
        notes
       FROM exercise_completions
       WHERE exercise_id = ANY($1)
       AND patient_id = $2
       ORDER BY completion_date DESC`,
      [exerciseIds, patient.id]
    );
  }

  // Create a Map for O(1) lookup with completion data
  const completionDataMap = new Map();
  completions.forEach(c => {
    const key = `${c.exercise_id}-${c.completion_date}`;
    completionDataMap.set(key, {
      setsPerformed: c.setsPerformed,
      repsPerformed: c.repsPerformed,
      weightPerformed: c.weightPerformed,
      rpeRating: c.rpeRating,
      painLevel: c.painLevel,
      notes: c.notes,
      completionDate: c.completion_date
    });
  });

  // Also create a map for today's completions for backwards compatibility
  const todayCompletionMap = new Map(
    completions
      .filter(c => c.completion_date === today)
      .map(c => [c.exercise_id, {
        setsPerformed: c.setsPerformed,
        repsPerformed: c.repsPerformed,
        weightPerformed: c.weightPerformed,
        rpeRating: c.rpeRating,
        painLevel: c.painLevel,
        notes: c.notes
      }])
  );

  // Group exercises by program
  const exercisesByProgram = {};
  allExercises.forEach(ex => {
    if (!exercisesByProgram[ex.program_id]) {
      exercisesByProgram[ex.program_id] = [];
    }

    // Get today's completion for the completed flag
    const todayCompletion = todayCompletionMap.get(ex.id);

    // Get all completions for this exercise across all dates
    const allExerciseCompletions = {};
    completions
      .filter(c => c.exercise_id === ex.id)
      .forEach(c => {
        const dateKey = typeof c.completion_date === 'string'
          ? c.completion_date.split('T')[0]
          : new Date(c.completion_date).toISOString().split('T')[0];

        allExerciseCompletions[dateKey] = {
          setsPerformed: c.setsPerformed,
          repsPerformed: c.repsPerformed,
          weightPerformed: c.weightPerformed,
          durationPerformed: c.durationPerformed,
          rpeRating: c.rpeRating,
          painLevel: c.painLevel,
          notes: c.notes
        };
      });

    exercisesByProgram[ex.program_id].push({
      id: ex.id,
      name: ex.exercise_name,
      category: ex.exercise_category,
      sets: ex.sets,
      reps: ex.reps,
      prescribedWeight: ex.prescribed_weight || 0,
      prescribedDuration: ex.prescribed_duration ?? null,
      restDuration: ex.rest_duration ?? null,
      holdTime: ex.hold_time,
      instructions: ex.instructions,
      image: ex.image_url,
      completed: todayCompletionMap.has(ex.id),
      completionData: todayCompletion || null,
      allCompletions: allExerciseCompletions,
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

// Get all patients — clinician only (all clinicians see all patients)
// Batched: 4 queries total regardless of patient count
router.get('/', requireRole('clinician'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. All patients
    const patients = await db.getAll(`
      SELECT id, email, role, name, dob, phone, address, condition, created_at
      FROM users
      WHERE role = 'patient'
      ORDER BY created_at DESC
    `);

    if (patients.length === 0) {
      audit.log(req, 'patients_list', 'patient', null, { count: 0 });
      return res.json({ patients: [] });
    }

    const patientIds = patients.map(p => p.id);

    // 2. All programs for all patients
    const allPrograms = await db.getAll(
      `SELECT * FROM programs WHERE patient_id = ANY($1) ORDER BY created_at DESC`,
      [patientIds]
    );

    const programIds = allPrograms.map(p => p.id);

    // 3. All exercises for all programs
    let allExercises = [];
    if (programIds.length > 0) {
      allExercises = await db.getAll(
        `SELECT * FROM program_exercises WHERE program_id = ANY($1) ORDER BY program_id, exercise_order ASC`,
        [programIds]
      );
    }

    // 4. All completions for all patients
    const exerciseIds = allExercises.map(e => e.id);
    let allCompletions = [];
    if (exerciseIds.length > 0) {
      allCompletions = await db.getAll(
        `SELECT
          exercise_id,
          patient_id,
          completion_date,
          sets_performed as "setsPerformed",
          reps_performed as "repsPerformed",
          weight_performed as "weightPerformed",
          duration_performed as "durationPerformed",
          rpe_rating as "rpeRating",
          pain_level as "painLevel",
          notes
         FROM exercise_completions
         WHERE exercise_id = ANY($1)
         ORDER BY completion_date DESC`,
        [exerciseIds]
      );
    }

    // Index completions by exercise_id
    const completionsByExercise = {};
    allCompletions.forEach(c => {
      if (!completionsByExercise[c.exercise_id]) {
        completionsByExercise[c.exercise_id] = [];
      }
      completionsByExercise[c.exercise_id].push(c);
    });

    // Index exercises by program_id
    const exercisesByProgram = {};
    allExercises.forEach(ex => {
      if (!exercisesByProgram[ex.program_id]) {
        exercisesByProgram[ex.program_id] = [];
      }

      const exCompletions = completionsByExercise[ex.id] || [];
      const todayCompletion = exCompletions.find(c => c.completion_date === today);

      const allExCompletions = {};
      exCompletions.forEach(c => {
        const dateKey = typeof c.completion_date === 'string'
          ? c.completion_date.split('T')[0]
          : new Date(c.completion_date).toISOString().split('T')[0];
        allExCompletions[dateKey] = {
          setsPerformed: c.setsPerformed,
          repsPerformed: c.repsPerformed,
          weightPerformed: c.weightPerformed,
          durationPerformed: c.durationPerformed,
          rpeRating: c.rpeRating,
          painLevel: c.painLevel,
          notes: c.notes
        };
      });

      exercisesByProgram[ex.program_id].push({
        id: ex.id,
        name: ex.exercise_name,
        category: ex.exercise_category,
        sets: ex.sets,
        reps: ex.reps,
        prescribedWeight: ex.prescribed_weight || 0,
        prescribedDuration: ex.prescribed_duration ?? null,
        restDuration: ex.rest_duration ?? null,
        holdTime: ex.hold_time,
        instructions: ex.instructions,
        image: ex.image_url,
        completed: !!todayCompletion,
        completionData: todayCompletion ? {
          setsPerformed: todayCompletion.setsPerformed,
          repsPerformed: todayCompletion.repsPerformed,
          weightPerformed: todayCompletion.weightPerformed,
          rpeRating: todayCompletion.rpeRating,
          painLevel: todayCompletion.painLevel,
          notes: todayCompletion.notes
        } : null,
        allCompletions: allExCompletions,
        enablePeriodization: ex.auto_adjust_enabled !== false
      });
    });

    // Index programs by patient_id
    const programsByPatient = {};
    allPrograms.forEach(p => {
      if (!programsByPatient[p.patient_id]) {
        programsByPatient[p.patient_id] = [];
      }
      programsByPatient[p.patient_id].push({
        config: {
          id: p.id,
          name: p.name,
          startDate: p.start_date,
          frequency: p.frequency ? JSON.parse(p.frequency) : [],
          duration: p.duration,
          customEndDate: p.custom_end_date,
          trackActualPerformance: p.track_actual_performance === true,
          trackRpe: p.track_rpe === true,
          trackPainLevel: p.track_pain === true
        },
        exercises: exercisesByProgram[p.id] || []
      });
    });

    // Assemble final result
    const formattedPatients = patients.map(patient => ({
      id: patient.id,
      name: patient.name,
      email: patient.email,
      dob: patient.dob || '',
      age: patient.dob ? new Date().getFullYear() - new Date(patient.dob).getFullYear() : 0,
      condition: patient.condition || '',
      phone: patient.phone || '',
      address: patient.address || '',
      dateAdded: patient.created_at,
      assignedPrograms: programsByPatient[patient.id] || []
    }));

    audit.log(req, 'patients_list', 'patient', null, { count: formattedPatients.length });

    res.json({ patients: formattedPatients });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single patient by ID (clinician via ownership OR patient accessing own data)
router.get('/:patientId', requirePatientAccess, async (req, res) => {
  try {
    const { patientId } = req.params;

    const patient = await db.getOne(`
      SELECT id, email, role, name, dob, phone, address, condition, created_at
      FROM users
      WHERE id = $1 AND role = 'patient'
    `, [patientId]);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const formattedPatient = await formatPatientWithPrograms(patient);

    audit.log(req, 'patient_view', 'patient', parseInt(patientId));

    res.json(formattedPatient);
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update patient details (clinician only)
router.put('/:patientId', requireRole('clinician'), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { name, dob, email, phone, address, condition } = req.body;

    if (!name || !dob || !email) {
      return res.status(400).json({ error: 'Name, date of birth, and email are required' });
    }

    const patient = await db.getOne(
      `SELECT id FROM users WHERE id = $1 AND role = 'patient'`,
      [patientId]
    );

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await db.query(
      `UPDATE users SET name = $1, dob = $2, email = $3, phone = $4, address = $5, condition = $6 WHERE id = $7`,
      [name, dob, email, phone || null, address || null, condition || null, patientId]
    );

    audit.log(req, 'patient_update', 'patient', parseInt(patientId), { fields: ['name', 'dob', 'email', 'phone', 'address', 'condition'] });

    res.json({ message: 'Patient updated' });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete patient by ID (admin only)
router.delete('/:patientId', requireRole('clinician'), requireAdmin, async (req, res) => {
  try {
    const { patientId } = req.params;

    // Check if patient exists
    const patient = await db.getOne(
      `SELECT id, email, role FROM users WHERE id = $1 AND role = 'patient'`,
      [patientId]
    );

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Delete the user from database (cascades to clinician_patients, programs, etc.)
    await db.query(`DELETE FROM users WHERE id = $1 AND role = 'patient'`, [patientId]);

    audit.log(req, 'patient_delete', 'patient', parseInt(patientId), { email: patient.email });

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

// Export formatPatientWithPrograms for use in other routes (patient self-access)
module.exports = router;
module.exports.formatPatientWithPrograms = formatPatientWithPrograms;
