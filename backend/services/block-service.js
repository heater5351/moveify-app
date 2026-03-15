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
            (block_schedule_id, program_exercise_id, week_number, sets, reps, rpe_target, weight, notes, duration, rest_duration)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (block_schedule_id, program_exercise_id, week_number)
          DO UPDATE SET sets = EXCLUDED.sets, reps = EXCLUDED.reps,
            rpe_target = EXCLUDED.rpe_target, weight = EXCLUDED.weight, notes = EXCLUDED.notes,
            duration = EXCLUDED.duration, rest_duration = EXCLUDED.rest_duration
        `, [
          blockScheduleId,
          cell.programExerciseId,
          cell.weekNumber,
          cell.sets,
          cell.reps,
          cell.rpeTarget || null,
          cell.weight || null,
          cell.notes || null,
          cell.duration || null,
          cell.restDuration || null
        ]);
      }

      // Apply week 1 prescription to program_exercises as live values
      const week1Cells = exerciseWeeks.filter(c => c.weekNumber === 1);
      for (const cell of week1Cells) {
        await client.query(`
          UPDATE program_exercises
          SET sets = $1, reps = $2, prescribed_weight = $3,
              prescribed_duration = $4, rest_duration = $5
          WHERE id = $6
        `, [cell.sets, cell.reps, cell.weight ?? null, cell.duration ?? null, cell.restDuration ?? null, cell.programExerciseId]);
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
    `SELECT id, exercise_name, exercise_category, sets, reps, prescribed_weight, prescribed_duration, rest_duration, hold_time, instructions, image_url, exercise_order
     FROM program_exercises WHERE program_id = $1 ORDER BY exercise_order ASC`,
    [programId]
  );

  if (!block) {
    return { hasBlock: false, currentWeek: null, exercises };
  }

  // Fetch week prescriptions for current week
  const weekCells = await db.getAll(`
    SELECT program_exercise_id, sets, reps, rpe_target, weight, notes, duration, rest_duration
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
      blockNotes: cell ? cell.notes : null,
      blockDuration: cell ? cell.duration : null,
      blockRestDuration: cell ? cell.rest_duration : null
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
 * Calendar-based: calculates expected week from elapsed time and catches up,
 * checking pain/performance for each intermediate week. Naturally idempotent.
 */
async function evaluateProgression(programId) {
  const block = await getActiveBlock(programId);
  if (!block) return { action: 'no_block' };

  // Too early: less than 6 days since start (evaluate 1 day before next week)
  const startDate = new Date(block.start_date);
  const daysSinceStart = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceStart < 6) return { action: 'too_early', daysSinceStart: Math.round(daysSinceStart) };

  // Calculate expected week from calendar time (evaluate 1 day early so prescription is ready)
  const expectedWeek = Math.min(Math.floor((daysSinceStart + 1) / 7) + 1, block.block_duration);
  const currentWeek = block.current_week;

  if (expectedWeek <= currentWeek) return { action: 'up_to_date', currentWeek };

  // Get patient_id from program
  const program = await db.getOne('SELECT patient_id FROM programs WHERE id = $1', [programId]);
  if (!program) return { action: 'no_program' };
  const patientId = program.patient_id;

  // Walk through each week from currentWeek to expectedWeek, checking metrics
  let advancedToWeek = currentWeek;
  let holdAction = null;

  for (let week = currentWeek; week < expectedWeek; week++) {
    // Compute this week's calendar date range
    const weekStartMs = startDate.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000;
    const weekEndMs = startDate.getTime() + week * 7 * 24 * 60 * 60 * 1000;
    const wsDate = new Date(weekStartMs);
    const weDate = new Date(weekEndMs);
    const weekStartStr = `${wsDate.getFullYear()}-${String(wsDate.getMonth() + 1).padStart(2, '0')}-${String(wsDate.getDate()).padStart(2, '0')}`;
    const weekEndStr = `${weDate.getFullYear()}-${String(weDate.getMonth() + 1).padStart(2, '0')}-${String(weDate.getDate()).padStart(2, '0')}`;

    // Fetch daily check-ins for this week's date range
    const checkIns = await db.getAll(`
      SELECT general_pain_level, overall_feeling
      FROM daily_check_ins
      WHERE patient_id = $1 AND check_in_date >= $2 AND check_in_date < $3
    `, [patientId, weekStartStr, weekEndStr]);

    let avgGeneralPain = 0;
    if (checkIns.length > 0) {
      avgGeneralPain = checkIns.reduce((s, c) => s + (c.general_pain_level || 0), 0) / checkIns.length;
    }

    // Fetch exercise completions for this week's date range
    const completions = await db.getAll(`
      SELECT ec.sets_performed, ec.reps_performed, ec.duration_performed, ec.pain_level,
             pe.sets as prescribed_sets, pe.reps as prescribed_reps, pe.prescribed_duration
      FROM exercise_completions ec
      JOIN program_exercises pe ON ec.exercise_id = pe.id
      WHERE pe.program_id = $1 AND ec.patient_id = $2
        AND ec.completion_date >= $3 AND ec.completion_date < $4
    `, [programId, patientId, weekStartStr, weekEndStr]);

    let avgExercisePain = 0;
    let completionRate = 0;

    if (completions.length > 0) {
      const painCompletions = completions.filter(c => c.pain_level != null);
      avgExercisePain = painCompletions.length > 0
        ? painCompletions.reduce((s, c) => s + c.pain_level, 0) / painCompletions.length
        : 0;

      const rates = completions.map(c => {
        const setsRate = c.prescribed_sets > 0 ? (c.sets_performed || 0) / c.prescribed_sets : 1;
        // Use duration_performed/prescribed_duration when exercise has duration but no reps
        let volumeRate;
        if ((!c.prescribed_reps || c.prescribed_reps === 0) && c.prescribed_duration > 0) {
          volumeRate = c.duration_performed > 0 ? Math.min((c.duration_performed || 0) / c.prescribed_duration, 1) : 0;
        } else {
          volumeRate = c.prescribed_reps > 0 ? Math.min((c.reps_performed || 0) / c.prescribed_reps, 1) : 1;
        }
        return Math.min(setsRate, 1) * volumeRate;
      });
      completionRate = rates.reduce((s, r) => s + r, 0) / rates.length;
    }

    // PAIN CHECK (highest priority) — hold at this week
    if (avgGeneralPain >= 6 || avgExercisePain >= 5) {
      // Only insert if no existing unresolved pain_flare flag for this program today
      const existingFlag = await db.getOne(
        `SELECT id FROM clinician_flags WHERE program_id = $1 AND patient_id = $2 AND flag_type = 'pain_flare' AND flag_date = CURRENT_DATE AND resolved = FALSE`,
        [programId, patientId]
      );
      if (!existingFlag) {
        await db.query(`
          INSERT INTO clinician_flags (program_id, patient_id, flag_type, flag_reason, flag_date)
          VALUES ($1, $2, 'pain_flare', $3, CURRENT_DATE)
        `, [
          programId, patientId,
          `Pain flare detected in week ${week}: avg general pain ${avgGeneralPain.toFixed(1)}/10, avg exercise pain ${avgExercisePain.toFixed(1)}/10. Week held.`
        ]);
      }
      holdAction = { action: 'hold_pain', heldAtWeek: week, avgGeneralPain, avgExercisePain };
      break;
    }

    // PERFORMANCE CHECK — hold at this week
    if (completionRate < 0.70) {
      const existingPerfFlag = await db.getOne(
        `SELECT id FROM clinician_flags WHERE program_id = $1 AND patient_id = $2 AND flag_type = 'performance_hold' AND flag_date = CURRENT_DATE`,
        [programId, patientId]
      );
      if (!existingPerfFlag) {
        await db.query(`
          INSERT INTO clinician_flags (program_id, patient_id, flag_type, flag_reason, flag_date, resolved)
          VALUES ($1, $2, 'performance_hold', $3, CURRENT_DATE, TRUE)
        `, [
          programId, patientId,
          `Performance hold in week ${week}: completion rate ${Math.round(completionRate * 100)}% (threshold 70%). Week held.`
        ]);
      }
      holdAction = { action: 'hold_performance', heldAtWeek: week, completionRate };
      break;
    }

    // Week passed checks — advance
    advancedToWeek = week + 1;
  }

  // Apply final state in a transaction
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    if (advancedToWeek >= block.block_duration && !holdAction) {
      // Block complete
      await client.query(
        `UPDATE block_schedules SET current_week = $1, status = 'completed', updated_at = NOW(), last_evaluated_at = NOW() WHERE id = $2`,
        [block.block_duration, block.id]
      );
      // Only insert block_complete flag if not already flagged today
      const existingComplete = await client.query(
        `SELECT id FROM clinician_flags WHERE program_id = $1 AND patient_id = $2 AND flag_type = 'block_complete' AND flag_date = CURRENT_DATE`,
        [programId, patientId]
      );
      if (existingComplete.rows.length === 0) {
        await client.query(`
          INSERT INTO clinician_flags (program_id, patient_id, flag_type, flag_reason, flag_date)
          VALUES ($1, $2, 'block_complete', $3, CURRENT_DATE)
        `, [
          programId, patientId,
          `Block complete: patient has finished all ${block.block_duration} weeks. Please review and assign new block.`
        ]);
      }

      // Apply final week's prescription
      const finalCells = await db.getAll(`
        SELECT program_exercise_id, sets, reps, weight, duration, rest_duration
        FROM exercise_block_weeks
        WHERE block_schedule_id = $1 AND week_number = $2
      `, [block.id, block.block_duration]);

      for (const cell of finalCells) {
        await client.query(
          `UPDATE program_exercises SET sets = $1, reps = $2, prescribed_weight = $3,
           prescribed_duration = $4, rest_duration = $5 WHERE id = $6`,
          [cell.sets, cell.reps, cell.weight, cell.duration, cell.rest_duration, cell.program_exercise_id]
        );
      }

      await client.query('COMMIT');
      return { action: 'block_complete', finalWeek: block.block_duration };
    }

    if (advancedToWeek > currentWeek) {
      // Advance to the new week
      await client.query(
        `UPDATE block_schedules SET current_week = $1, updated_at = NOW(), last_evaluated_at = NOW() WHERE id = $2`,
        [advancedToWeek, block.id]
      );

      // Apply new week's prescription to program_exercises
      const newCells = await db.getAll(`
        SELECT program_exercise_id, sets, reps, weight, duration, rest_duration
        FROM exercise_block_weeks
        WHERE block_schedule_id = $1 AND week_number = $2
      `, [block.id, advancedToWeek]);

      // Check for exercises missing block data (added after block was created)
      const programExerciseCount = await db.getOne(
        'SELECT COUNT(*) as count FROM program_exercises WHERE program_id = $1',
        [programId]
      );
      if (newCells.length < parseInt(programExerciseCount.count)) {
        // Flag clinician about missing block data
        const existingMismatch = await client.query(
          `SELECT id FROM clinician_flags WHERE program_id = $1 AND flag_type = 'block_complete' AND flag_reason LIKE '%missing block data%' AND resolved = FALSE`,
          [programId]
        );
        if (existingMismatch.rows.length === 0) {
          await client.query(`
            INSERT INTO clinician_flags (program_id, patient_id, flag_type, flag_reason, flag_date)
            VALUES ($1, $2, 'performance_hold', $3, CURRENT_DATE)
          `, [
            programId, patientId,
            `Warning: ${parseInt(programExerciseCount.count) - newCells.length} exercise(s) missing block data for week ${advancedToWeek}. These exercises will keep their base prescription. Consider editing the block.`
          ]);
        }
      }

      for (const cell of newCells) {
        await client.query(
          `UPDATE program_exercises SET sets = $1, reps = $2, prescribed_weight = $3,
           prescribed_duration = $4, rest_duration = $5 WHERE id = $6`,
          [cell.sets, cell.reps, cell.weight, cell.duration, cell.rest_duration, cell.program_exercise_id]
        );
      }
    }

    await client.query('COMMIT');

    if (holdAction) {
      return holdAction;
    }

    if (advancedToWeek > currentWeek) {
      return { action: 'advanced', previousWeek: currentWeek, newWeek: advancedToWeek };
    }

    return { action: 'up_to_date', currentWeek };
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
        SELECT program_exercise_id, sets, reps, weight, duration, rest_duration
        FROM exercise_block_weeks
        WHERE block_schedule_id = $1 AND week_number = $2
      `, [block.id, newWeek]);

      for (const cell of cells) {
        await client.query(
          `UPDATE program_exercises SET sets = $1, reps = $2, prescribed_weight = $3,
           prescribed_duration = $4, rest_duration = $5 WHERE id = $6`,
          [cell.sets, cell.reps, cell.weight, cell.duration, cell.rest_duration, cell.program_exercise_id]
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
  const result = await db.run(`
    UPDATE exercise_block_weeks
    SET sets = $1, reps = $2, rpe_target = $3, weight = $4, notes = $5,
        duration = $6, rest_duration = $7,
        overridden_by = $8, overridden_at = NOW()
    WHERE block_schedule_id = $9 AND program_exercise_id = $10 AND week_number = $11
  `, [
    data.sets, data.reps, data.rpeTarget ?? null, data.weight ?? null, data.notes ?? null,
    data.duration ?? null, data.restDuration ?? null,
    overriddenBy || null,
    blockScheduleId, programExerciseId, weekNumber
  ]);

  if (result.rowCount === 0) {
    throw new Error('Block cell not found');
  }

  // If overriding the current week, also update program_exercises so patient sees it immediately
  const block = await db.getOne('SELECT current_week FROM block_schedules WHERE id = $1', [blockScheduleId]);
  if (block && block.current_week === weekNumber) {
    await db.query(`
      UPDATE program_exercises SET sets = $1, reps = $2, prescribed_weight = $3,
             prescribed_duration = $4, rest_duration = $5
      WHERE id = $6
    `, [data.sets, data.reps, data.weight ?? null, data.duration ?? null, data.restDuration ?? null, programExerciseId]);
  }
}

/**
 * Get unresolved flags for a clinician's patients.
 */
async function getUnresolvedFlags() {
  const rows = await db.getAll(`
    SELECT cf.*, u.name as patient_name, p.name as program_name
    FROM clinician_flags cf
    JOIN users u ON cf.patient_id = u.id
    JOIN programs p ON cf.program_id = p.id
    WHERE cf.resolved = FALSE
    ORDER BY cf.created_at DESC
  `);

  // Map snake_case to camelCase for frontend
  return rows.map(f => ({
    id: f.id,
    programId: f.program_id,
    patientId: f.patient_id,
    flagType: f.flag_type,
    flagReason: f.flag_reason,
    flagDate: f.flag_date,
    resolved: f.resolved,
    resolvedAt: f.resolved_at,
    resolvedBy: f.resolved_by,
    createdAt: f.created_at,
    patientName: f.patient_name,
    programName: f.program_name
  }));
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
