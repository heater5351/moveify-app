// Block-based periodization service
const db = require('../database/db');

/**
 * Create a new block schedule for a program.
 * exerciseWeeks: [{ programExerciseId, weekNumber, sets, reps, rpeTarget, weight, notes }]
 */
async function createBlock(programId, blockDuration, startDate, exerciseWeeks) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Deactivate any existing active block for this program
    await client.query(
      `UPDATE block_schedules SET status = 'paused', updated_at = NOW()
       WHERE program_id = $1 AND status = 'active'`,
      [programId]
    );

    const blockResult = await client.query(`
      INSERT INTO block_schedules (program_id, block_duration, start_date, current_week, status)
      VALUES ($1, $2, $3, 1, 'active')
      RETURNING id
    `, [programId, blockDuration, startDate]);

    const blockScheduleId = blockResult.rows[0].id;

    // Insert exercise week cells
    if (exerciseWeeks && exerciseWeeks.length > 0) {
      for (const cell of exerciseWeeks) {
        await client.query(`
          INSERT INTO exercise_block_weeks
            (block_schedule_id, program_exercise_id, week_number, sets, reps, rpe_target, weight, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (block_schedule_id, program_exercise_id, week_number)
          DO UPDATE SET sets = EXCLUDED.sets, reps = EXCLUDED.reps,
            rpe_target = EXCLUDED.rpe_target, weight = EXCLUDED.weight, notes = EXCLUDED.notes
        `, [
          blockScheduleId,
          cell.programExerciseId,
          cell.weekNumber,
          cell.sets,
          cell.reps,
          cell.rpeTarget || null,
          cell.weight || null,
          cell.notes || null
        ]);
      }

      // Apply week 1 prescription to program_exercises as live values
      const week1Cells = exerciseWeeks.filter(c => c.weekNumber === 1);
      for (const cell of week1Cells) {
        await client.query(`
          UPDATE program_exercises
          SET sets = $1, reps = $2
          WHERE id = $3
        `, [cell.sets, cell.reps, cell.programExerciseId]);
      }
    }

    await client.query('COMMIT');
    return { blockScheduleId, programId, blockDuration, startDate };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get the active block schedule for a program.
 */
async function getActiveBlock(programId) {
  return db.getOne(
    `SELECT * FROM block_schedules WHERE program_id = $1 AND status = 'active'`,
    [programId]
  );
}

/**
 * Get full block status including exercise week prescriptions.
 */
async function getBlockStatus(programId) {
  const block = await getActiveBlock(programId);
  if (!block) return null;

  const weeks = await db.getAll(`
    SELECT ebw.*, pe.exercise_name
    FROM exercise_block_weeks ebw
    JOIN program_exercises pe ON ebw.program_exercise_id = pe.id
    WHERE ebw.block_schedule_id = $1
    ORDER BY ebw.program_exercise_id, ebw.week_number
  `, [block.id]);

  return {
    id: block.id,
    programId: block.program_id,
    blockDuration: block.block_duration,
    startDate: block.start_date,
    currentWeek: block.current_week,
    status: block.status,
    lastEvaluatedAt: block.last_evaluated_at,
    weeks
  };
}

/**
 * Get current week's prescription for all exercises in a program.
 * Falls back to program_exercises values if no block exists.
 */
async function getCurrentPrescription(programId) {
  const block = await getActiveBlock(programId);

  const exercises = await db.getAll(
    `SELECT id, exercise_name, exercise_category, sets, reps, prescribed_weight, hold_time, instructions, image_url, exercise_order
     FROM program_exercises WHERE program_id = $1 ORDER BY exercise_order ASC`,
    [programId]
  );

  if (!block) {
    return { hasBlock: false, currentWeek: null, exercises };
  }

  // Fetch week prescriptions for current week
  const weekCells = await db.getAll(`
    SELECT program_exercise_id, sets, reps, rpe_target, weight, notes
    FROM exercise_block_weeks
    WHERE block_schedule_id = $1 AND week_number = $2
  `, [block.id, block.current_week]);

  const weekMap = {};
  weekCells.forEach(c => { weekMap[c.program_exercise_id] = c; });

  const enriched = exercises.map(ex => {
    const cell = weekMap[ex.id];
    return {
      ...ex,
      sets: cell ? cell.sets : ex.sets,
      reps: cell ? cell.reps : ex.reps,
      rpeTarget: cell ? cell.rpe_target : null,
      blockWeight: cell ? cell.weight : null,
      blockNotes: cell ? cell.notes : null
    };
  });

  return {
    hasBlock: true,
    currentWeek: block.current_week,
    blockDuration: block.block_duration,
    status: block.status,
    exercises: enriched
  };
}

/**
 * Evaluate weekly progression for a program.
 * Idempotent: skips if evaluated within last 24h or < 7 days since start.
 */
async function evaluateProgression(programId) {
  const block = await getActiveBlock(programId);
  if (!block) return { action: 'no_block' };

  // Idempotency: skip if evaluated in last 24h
  if (block.last_evaluated_at) {
    const hoursAgo = (Date.now() - new Date(block.last_evaluated_at).getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 24) return { action: 'too_soon', hoursAgo: Math.round(hoursAgo) };
  }

  // Too early: less than 7 days since start
  const startDate = new Date(block.start_date);
  const daysSinceStart = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceStart < 7) return { action: 'too_early', daysSinceStart: Math.round(daysSinceStart) };

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  // Get patient_id from program
  const program = await db.getOne('SELECT patient_id FROM programs WHERE id = $1', [programId]);
  if (!program) return { action: 'no_program' };
  const patientId = program.patient_id;

  // Fetch daily check-ins for last 7 days
  const checkIns = await db.getAll(`
    SELECT general_pain_level, overall_feeling
    FROM daily_check_ins
    WHERE patient_id = $1 AND check_in_date >= $2
  `, [patientId, sevenDaysAgoStr]);

  let avgGeneralPain = 0;
  if (checkIns.length > 0) {
    avgGeneralPain = checkIns.reduce((s, c) => s + (c.general_pain_level || 0), 0) / checkIns.length;
  }

  // Fetch exercise completions for last 7 days
  const completions = await db.getAll(`
    SELECT ec.sets_performed, ec.reps_performed, ec.pain_level,
           pe.sets as prescribed_sets, pe.reps as prescribed_reps
    FROM exercise_completions ec
    JOIN program_exercises pe ON ec.exercise_id = pe.id
    WHERE pe.program_id = $1 AND ec.patient_id = $2 AND ec.completion_date >= $3
  `, [programId, patientId, sevenDaysAgoStr]);

  let avgExercisePain = 0;
  let completionRate = 0;

  if (completions.length > 0) {
    const painCompletions = completions.filter(c => c.pain_level != null);
    avgExercisePain = painCompletions.length > 0
      ? painCompletions.reduce((s, c) => s + c.pain_level, 0) / painCompletions.length
      : 0;

    const rates = completions.map(c => {
      const setsRate = c.prescribed_sets > 0 ? (c.sets_performed || 0) / c.prescribed_sets : 1;
      const repsRate = c.prescribed_reps > 0 ? (c.reps_performed || 0) / c.prescribed_reps : 1;
      return Math.min(setsRate, 1) * Math.min(repsRate, 1);
    });
    completionRate = rates.reduce((s, r) => s + r, 0) / rates.length;
  }

  // Stamp evaluation time first (prevents duplicate triggers)
  await db.query(
    `UPDATE block_schedules SET last_evaluated_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [block.id]
  );

  // PAIN CHECK (highest priority)
  if (avgGeneralPain >= 6 || avgExercisePain >= 5) {
    await db.query(`
      INSERT INTO clinician_flags (program_id, patient_id, flag_type, flag_reason, flag_date)
      VALUES ($1, $2, 'pain_flare', $3, CURRENT_DATE)
    `, [
      programId, patientId,
      `Pain flare detected: avg general pain ${avgGeneralPain.toFixed(1)}/10, avg exercise pain ${avgExercisePain.toFixed(1)}/10. Week held.`
    ]);
    return { action: 'hold_pain', avgGeneralPain, avgExercisePain };
  }

  // PERFORMANCE CHECK
  if (completionRate < 0.70) {
    await db.query(`
      INSERT INTO clinician_flags (program_id, patient_id, flag_type, flag_reason, flag_date, resolved)
      VALUES ($1, $2, 'performance_hold', $3, CURRENT_DATE, TRUE)
    `, [
      programId, patientId,
      `Performance hold: completion rate ${Math.round(completionRate * 100)}% (threshold 70%). Week held.`
    ]);
    return { action: 'hold_performance', completionRate };
  }

  // ADVANCE
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    if (block.current_week < block.block_duration) {
      const nextWeek = block.current_week + 1;
      await client.query(
        `UPDATE block_schedules SET current_week = $1, updated_at = NOW() WHERE id = $2`,
        [nextWeek, block.id]
      );

      // Apply next week's prescription to program_exercises as live values
      const nextCells = await db.getAll(`
        SELECT program_exercise_id, sets, reps
        FROM exercise_block_weeks
        WHERE block_schedule_id = $1 AND week_number = $2
      `, [block.id, nextWeek]);

      for (const cell of nextCells) {
        await client.query(
          `UPDATE program_exercises SET sets = $1, reps = $2 WHERE id = $3`,
          [cell.sets, cell.reps, cell.program_exercise_id]
        );
      }

      await client.query('COMMIT');
      return { action: 'advanced', newWeek: nextWeek };
    } else {
      // Block complete
      await client.query(
        `UPDATE block_schedules SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [block.id]
      );
      await client.query(`
        INSERT INTO clinician_flags (program_id, patient_id, flag_type, flag_reason, flag_date)
        VALUES ($1, $2, 'block_complete', $3, CURRENT_DATE)
      `, [
        programId, patientId,
        `Block complete: patient has finished all ${block.block_duration} weeks. Please review and assign new block.`
      ]);

      await client.query('COMMIT');
      return { action: 'block_complete', finalWeek: block.current_week };
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Manual override: advance, hold, or regress a program week.
 */
async function manualOverride(programId, action) {
  const block = await getActiveBlock(programId);
  if (!block) throw new Error('No active block found');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let newWeek = block.current_week;
    if (action === 'advance') {
      newWeek = Math.min(block.current_week + 1, block.block_duration);
    } else if (action === 'regress') {
      newWeek = Math.max(block.current_week - 1, 1);
    }
    // 'hold' keeps the same week

    await client.query(
      `UPDATE block_schedules SET current_week = $1, last_evaluated_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [newWeek, block.id]
    );

    // Apply new week's prescription
    if (newWeek !== block.current_week) {
      const cells = await db.getAll(`
        SELECT program_exercise_id, sets, reps
        FROM exercise_block_weeks
        WHERE block_schedule_id = $1 AND week_number = $2
      `, [block.id, newWeek]);

      for (const cell of cells) {
        await client.query(
          `UPDATE program_exercises SET sets = $1, reps = $2 WHERE id = $3`,
          [cell.sets, cell.reps, cell.program_exercise_id]
        );
      }
    }

    await client.query('COMMIT');
    return { action, newWeek };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Override a single cell in the block.
 */
async function overrideCell(blockScheduleId, programExerciseId, weekNumber, data, overriddenBy) {
  await db.query(`
    UPDATE exercise_block_weeks
    SET sets = $1, reps = $2, rpe_target = $3, weight = $4, notes = $5,
        overridden_by = $6, overridden_at = NOW()
    WHERE block_schedule_id = $7 AND program_exercise_id = $8 AND week_number = $9
  `, [
    data.sets, data.reps, data.rpeTarget || null, data.weight || null, data.notes || null,
    overriddenBy || null,
    blockScheduleId, programExerciseId, weekNumber
  ]);
}

/**
 * Get unresolved flags for a clinician's patients.
 */
async function getUnresolvedFlags(clinicianId) {
  return db.getAll(`
    SELECT cf.*, u.name as patient_name, p.name as program_name
    FROM clinician_flags cf
    JOIN users u ON cf.patient_id = u.id
    JOIN programs p ON cf.program_id = p.id
    WHERE p.clinician_id = $1 AND cf.resolved = FALSE
    ORDER BY cf.created_at DESC
  `, [clinicianId]);
}

/**
 * Resolve a flag.
 */
async function resolveFlag(flagId, resolvedBy) {
  await db.query(`
    UPDATE clinician_flags
    SET resolved = TRUE, resolved_at = NOW(), resolved_by = $1
    WHERE id = $2
  `, [resolvedBy || null, flagId]);
}

module.exports = {
  createBlock,
  getActiveBlock,
  getBlockStatus,
  getCurrentPrescription,
  evaluateProgression,
  manualOverride,
  overrideCell,
  getUnresolvedFlags,
  resolveFlag
};
