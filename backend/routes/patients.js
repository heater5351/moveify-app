// Patient routes
const express = require('express');
const db = require('../database/db');

const router = express.Router();

// Helper to format a patient with their programs
async function formatPatientWithPrograms(patient) {
  const today = new Date().toISOString().split('T')[0];

  // Get ALL programs for this patient
  const programs = await db.getAll(
    'SELECT id FROM programs WHERE patient_id = $1 ORDER BY created_at DESC',
    [patient.id]
  );

  let assignedPrograms = [];

  if (programs && programs.length > 0) {
    assignedPrograms = await Promise.all(programs.map(async (program) => {
      // Get exercises for this program
      const exercises = await db.getAll(
        'SELECT * FROM program_exercises WHERE program_id = $1 ORDER BY exercise_order ASC',
        [program.id]
      );

      // Get program config
      const programData = await db.getOne('SELECT * FROM programs WHERE id = $1', [program.id]);

      const exercisesWithCompletion = await Promise.all(exercises.map(async (ex) => {
        // Check if this exercise was completed TODAY
        const completedToday = await db.getOne(
          'SELECT id FROM exercise_completions WHERE exercise_id = $1 AND patient_id = $2 AND completion_date = $3',
          [ex.id, patient.id, today]
        );

        return {
          id: ex.id,
          name: ex.exercise_name,
          category: ex.exercise_category,
          sets: ex.sets,
          reps: ex.reps,
          holdTime: ex.hold_time,
          instructions: ex.instructions,
          image: ex.image_url,
          completed: !!completedToday
        };
      }));

      return {
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
        exercises: exercisesWithCompletion
      };
    }));
  }

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
