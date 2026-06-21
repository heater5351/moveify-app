// Patient routes
const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePatientAccess, requireAdmin } = require('../middleware/ownership');
const audit = require('../services/audit');
const { resolveProgramWindow, computeAdherence } = require('../services/adherence');
const identityPlatform = require('../lib/identity-platform');
const { deleteLoginAccount } = require('../lib/login-identity');

const router = express.Router();

// All patient routes require authentication
router.use(authenticate);

// Timezone-safe date string (avoids UTC shift from toISOString)
function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Normalize pg DATE column to YYYY-MM-DD string (pg may return Date object or string)
function normalizeDateStr(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.split('T')[0];
  return toLocalDateString(d);
}

// Accurate age calculation accounting for month and day
function calculateAge(dob) {
  if (!dob) return 0;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Helper to format a patient with their programs (OPTIMIZED - reduces N+1 queries)
async function formatPatientWithPrograms(patient) {
  const today = toLocalDateString(new Date());

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
      sex: patient.sex || '',
      age: calculateAge(patient.dob),
            phone: patient.phone || '',
      address: patient.address || '',
      dateAdded: patient.created_at,
      clinikoPatientId: patient.cliniko_patient_id || null,
      clinikoSyncedAt: patient.cliniko_synced_at || null,
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
    const key = `${c.exercise_id}-${normalizeDateStr(c.completion_date)}`;
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
      .filter(c => normalizeDateStr(c.completion_date) === today)
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
        const dateKey = normalizeDateStr(c.completion_date);

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
      enablePeriodization: ex.auto_adjust_enabled !== false,
      isWarmup: ex.is_warmup === true
    });
  });

  // Build final program structure
  const assignedPrograms = programs.map(programData => ({
    config: {
      id: programData.id,
      name: programData.name,
      startDate: programData.start_date,
      frequency: (() => { try { return programData.frequency ? JSON.parse(programData.frequency) : []; } catch { return []; } })(),
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
    sex: patient.sex || '',
    age: calculateAge(patient.dob),
        phone: patient.phone || '',
    address: patient.address || '',
    dateAdded: patient.created_at,
    pendingSetup: patient.pending_setup === true,
    clinikoPatientId: patient.cliniko_patient_id || null,
    clinikoSyncedAt: patient.cliniko_synced_at || null,
    assignedPrograms: assignedPrograms
  };
}

// Get all patients — clinician only (all clinicians see all patients)
// Batched: 4 queries total regardless of patient count
router.get('/', requireRole('clinician'), async (req, res) => {
  try {
    const today = toLocalDateString(new Date());

    // 1. All patients
    const patients = await db.getAll(`
      SELECT id, email, role, name, dob, sex, phone, address, created_at,
             cliniko_patient_id, cliniko_synced_at,
             (password_hash IS NULL AND firebase_uid IS NULL) AS pending_setup
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
      const todayCompletion = exCompletions.find(c => normalizeDateStr(c.completion_date) === today);

      const allExCompletions = {};
      exCompletions.forEach(c => {
        const dateKey = normalizeDateStr(c.completion_date);
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
        enablePeriodization: ex.auto_adjust_enabled !== false,
        isWarmup: ex.is_warmup === true
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
          frequency: (() => { try { return p.frequency ? JSON.parse(p.frequency) : []; } catch { return []; } })(),
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
      sex: patient.sex || '',
      age: calculateAge(patient.dob),
            phone: patient.phone || '',
      address: patient.address || '',
      dateAdded: patient.created_at,
      pendingSetup: patient.pending_setup === true,
      clinikoPatientId: patient.cliniko_patient_id || null,
      clinikoSyncedAt: patient.cliniko_synced_at || null,
      assignedPrograms: programsByPatient[patient.id] || []
    }));

    audit.log(req, 'patients_list', 'patient', null, { count: formattedPatients.length });

    res.json({ patients: formattedPatients });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cross-patient adherence summary for the clinician Dashboard.
// Compact: one row per patient with a currently-active program. MUST stay registered
// before GET /:patientId so the literal path isn't captured by the param route.
router.get('/adherence-summary', requireRole('clinician'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStartStr = toLocalDateString(new Date(today.getTime() - (days - 1) * 86400000));

    // 1. All patients (id + name only)
    const patients = await db.getAll(
      `SELECT id, name FROM users WHERE role = 'patient' ORDER BY name ASC`
    );

    if (patients.length === 0) {
      audit.log(req, 'dashboard_view', 'patient', null, { count: 0 });
      return res.json({ days, rows: [], noActiveProgramCount: 0 });
    }

    const patientIds = patients.map(p => p.id);

    // 2. All programs for those patients (fields needed to resolve the active window)
    const allPrograms = await db.getAll(
      `SELECT id, patient_id, name, frequency, start_date, created_at, duration, custom_end_date
       FROM programs WHERE patient_id = ANY($1)`,
      [patientIds]
    );
    const programIds = allPrograms.map(p => p.id);

    // 3. Non-warmup exercise counts per program
    const exCountByProgram = {};
    if (programIds.length > 0) {
      const exRows = await db.getAll(
        `SELECT program_id, COUNT(*)::int AS count
         FROM program_exercises
         WHERE program_id = ANY($1) AND (is_warmup IS NOT TRUE)
         GROUP BY program_id`,
        [programIds]
      );
      exRows.forEach(r => { exCountByProgram[r.program_id] = r.count; });
    }

    // Determine which programs are currently active, indexed by patient.
    const programsByPatient = {};
    const activeProgramIds = new Set();
    const patientsWithActive = new Set();
    allPrograms.forEach(p => {
      const frequency = (() => { try { return p.frequency ? JSON.parse(p.frequency) : []; } catch { return []; } })();
      const program = { ...p, frequency };
      if (!programsByPatient[p.patient_id]) programsByPatient[p.patient_id] = [];
      programsByPatient[p.patient_id].push(program);
      if (resolveProgramWindow(p, today).isActive) {
        activeProgramIds.add(p.id);
        patientsWithActive.add(p.patient_id);
      }
    });

    // 4. Window completions (non-warmup) joined to their program — for active-program counts + pain.
    const windowCompletionsByPatient = {};
    const painByPatient = {};
    if (programIds.length > 0) {
      const compRows = await db.getAll(
        `SELECT pe.program_id, p.patient_id, ec.completion_date, ec.pain_level
         FROM exercise_completions ec
         JOIN program_exercises pe ON ec.exercise_id = pe.id
         JOIN programs p ON pe.program_id = p.id
         WHERE p.patient_id = ANY($1)
           AND (pe.is_warmup IS NOT TRUE)
           AND ec.completion_date >= $2`,
        [patientIds, windowStartStr]
      );
      compRows.forEach(r => {
        if (!activeProgramIds.has(r.program_id)) return; // only active programs count
        windowCompletionsByPatient[r.patient_id] = (windowCompletionsByPatient[r.patient_id] || 0) + 1;
        if (r.pain_level != null && r.pain_level >= 7) {
          const dateStr = normalizeDateStr(r.completion_date);
          const existing = painByPatient[r.patient_id];
          if (!existing || r.pain_level > existing.maxPain) {
            painByPatient[r.patient_id] = { maxPain: r.pain_level, date: dateStr };
          }
        }
      });
    }

    // 5. Last activity (all-time) per patient
    const lastActivityByPatient = {};
    if (programIds.length > 0) {
      const lastRows = await db.getAll(
        `SELECT p.patient_id, MAX(ec.completion_date) AS last_date
         FROM exercise_completions ec
         JOIN program_exercises pe ON ec.exercise_id = pe.id
         JOIN programs p ON pe.program_id = p.id
         WHERE p.patient_id = ANY($1)
         GROUP BY p.patient_id`,
        [patientIds]
      );
      lastRows.forEach(r => { lastActivityByPatient[r.patient_id] = normalizeDateStr(r.last_date); });
    }

    // Build one row per patient with an active program.
    const rows = patients
      .filter(p => patientsWithActive.has(p.id))
      .map(p => {
        const lastActivity = lastActivityByPatient[p.id] || null;
        const adherence = computeAdherence({
          programs: programsByPatient[p.id] || [],
          exercisesByProgram: exCountByProgram,
          completionsInWindow: windowCompletionsByPatient[p.id] || 0,
          lastActivityDate: lastActivity,
          days,
          today
        });
        const activeProgramCount = (programsByPatient[p.id] || [])
          .filter(prog => activeProgramIds.has(prog.id)).length;
        return {
          patientId: p.id,
          name: p.name,
          activeProgramCount,
          completionRate: adherence.completionRate,
          daysSinceLastActivity: adherence.daysSinceLastActivity,
          lastActivity,
          painAlert: painByPatient[p.id] || null,
          status: adherence.status
        };
      });

    const noActiveProgramCount = patients.length - patientsWithActive.size;

    audit.log(req, 'dashboard_view', 'patient', null, { count: rows.length });

    res.json({ days, rows, noActiveProgramCount });
  } catch (error) {
    console.error('Adherence summary error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single patient by ID (clinician via ownership OR patient accessing own data)
router.get('/:patientId', requirePatientAccess, async (req, res) => {
  try {
    const { patientId } = req.params;

    const patient = await db.getOne(`
      SELECT id, email, role, name, dob, sex, phone, address, created_at,
             cliniko_patient_id, cliniko_synced_at,
             (password_hash IS NULL AND firebase_uid IS NULL) AS pending_setup
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
    const { name, dob, email, phone, address, sex } = req.body;

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

    // sex omitted (undefined) → preserve existing; '' → clear; a value → set.
    await db.query(
      `UPDATE users SET name = $1, dob = $2, email = $3, phone = $4, address = $5, sex = COALESCE($6, sex) WHERE id = $7`,
      [name, dob, email, phone || null, address || null, sex === undefined ? null : sex, patientId]
    );

    audit.log(req, 'patient_update', 'patient', parseInt(patientId), { fields: ['name', 'dob', 'email', 'phone', 'address', 'sex'] });

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
      `SELECT id, email, role, firebase_uid, login_username FROM users WHERE id = $1 AND role = 'patient'`,
      [patientId]
    );

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Delete the user from database (cascades to clinician_patients, programs, etc.)
    await db.query(`DELETE FROM users WHERE id = $1 AND role = 'patient'`, [patientId]);

    // Best-effort: drop the Identity Platform credential too, so a future
    // re-invite (especially one reusing a freed shared-email login name) can't
    // collide with an orphaned auth account. Never block the delete on this.
    try {
      await deleteLoginAccount(identityPlatform.auth(), {
        firebaseUid: patient.firebase_uid,
        loginUsername: patient.login_username,
      });
    } catch (authErr) {
      console.error('Failed to remove Identity Platform account on patient delete:', authErr.code || authErr.message);
    }

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
