// Periodization service - auto-adjustment algorithm
const db = require('../database/db');
const checkInService = require('./check-in-service');

/**
 * Initialize a periodization cycle for a program
 * Called when a program is created
 */
async function initializeCycle(programId, blockType = 'standard') {
  const today = new Date().toISOString().split('T')[0];
  const totalWeeks = blockType === 'introductory' ? 4 : 6;
  const blockNumber = blockType === 'introductory' ? 0 : 1;

  const result = await db.query(`
    INSERT INTO periodization_cycles (
      program_id,
      block_type,
      block_number,
      block_start_date,
      current_week,
      total_weeks,
      intensity_multiplier
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    programId,
    blockType,
    blockNumber,
    today,
    1, // Start at week 1
    totalWeeks,
    1.0 // Initial intensity
  ]);

  return result.rows[0];
}

/**
 * Get current cycle for a program
 */
async function getCurrentCycle(programId) {
  return await db.getOne(`
    SELECT * FROM periodization_cycles
    WHERE program_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, [programId]);
}

/**
 * Calculate appropriate sets/reps based on block type and week
 * SCALES FROM CLINICIAN'S BASELINE PRESCRIPTION
 */
function calculateSetsReps(blockType, currentWeek, baselineSets, baselineReps) {
  // Ensure baseline values exist and are valid
  const targetSets = baselineSets || 3;
  const targetReps = baselineReps || 10;

  if (blockType === 'introductory') {
    // Introductory: gradually build to baseline over 4 weeks
    switch (currentWeek) {
      case 1: return {
        sets: Math.max(1, Math.ceil(targetSets * 0.5)),
        reps: Math.max(6, Math.ceil(targetReps * 0.67))
      };
      case 2: return {
        sets: Math.max(1, Math.ceil(targetSets * 0.67)),
        reps: Math.max(6, Math.ceil(targetReps * 0.67))
      };
      case 3: return {
        sets: Math.max(1, Math.ceil(targetSets * 0.67)),
        reps: Math.max(8, Math.ceil(targetReps * 0.83))
      };
      case 4: return { sets: targetSets, reps: targetReps };
      default: return {
        sets: Math.max(1, Math.ceil(targetSets * 0.5)),
        reps: Math.max(6, Math.ceil(targetReps * 0.67))
      };
    }
  } else {
    // Standard: deload, return to baseline, progressive overreach
    if (currentWeek === 1) {
      // Deload week: 67% of baseline
      return {
        sets: Math.max(1, Math.ceil(targetSets * 0.67)),
        reps: Math.max(6, Math.ceil(targetReps * 0.67))
      };
    } else if (currentWeek === 2) {
      // Return to baseline
      return { sets: targetSets, reps: targetReps };
    } else {
      // Weeks 3-6: Progressive overreach (5% reps per week, cap at 120%)
      const repIncrease = Math.ceil((currentWeek - 2) * (targetReps * 0.05));
      return {
        sets: targetSets,
        reps: Math.min(Math.ceil(targetReps + repIncrease), Math.ceil(targetReps * 1.2))
      };
    }
  }
}

/**
 * Check if progression gates pass
 */
function checkProgressionGates(metrics, blockType) {
  const gates = blockType === 'introductory' ? {
    adherence: 0.70,
    avgRpe: 7,
    avgExercisePain: 2,
    completionRate: 0.85,
    avgOverallFeeling: 3,
    avgGeneralPain: 3
  } : {
    adherence: 0.80,
    avgRpe: 8,
    avgExercisePain: 3,
    completionRate: 0.90,
    avgOverallFeeling: 3,
    avgGeneralPain: 4
  };

  const checks = {
    adherence: (metrics.adherence || 0) >= gates.adherence,
    rpe: (metrics.avgRpe || 0) <= gates.avgRpe,
    exercisePain: (metrics.avgExercisePain || 0) <= gates.avgExercisePain,
    completionRate: (metrics.completionRate || 0) >= gates.completionRate,
    overallFeeling: (metrics.avgOverallFeeling || 3) >= gates.avgOverallFeeling,
    generalPain: (metrics.avgGeneralPain || 0) <= gates.avgGeneralPain
  };

  const allPass = Object.values(checks).every(check => check);

  return {
    pass: allPass,
    checks,
    gates
  };
}

/**
 * Get metrics for the last 7 days for an exercise
 */
async function getWeeklyMetrics(exerciseId, patientId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startDate = sevenDaysAgo.toISOString().split('T')[0];
  const endDate = new Date().toISOString().split('T')[0];

  // Get exercise completion metrics
  const exerciseMetrics = await db.getOne(`
    SELECT
      AVG(rpe_rating) as "avgRpe",
      AVG(pain_level) as "avgExercisePain",
      COUNT(*) as "completionCount",
      AVG(CAST(sets_performed AS FLOAT)) as "avgSets",
      AVG(CAST(reps_performed AS FLOAT)) as "avgReps"
    FROM exercise_completions
    WHERE exercise_id = $1
      AND patient_id = $2
      AND completion_date >= $3
      AND completion_date <= $4
  `, [exerciseId, patientId, startDate, endDate]);

  // Get check-in metrics
  const checkInMetrics = await checkInService.getAverageCheckInMetrics(patientId, startDate, endDate);

  // Get program frequency to calculate adherence
  const exercise = await db.getOne(`
    SELECT pe.*, p.frequency
    FROM program_exercises pe
    JOIN programs p ON pe.program_id = p.id
    WHERE pe.id = $1
  `, [exerciseId]);

  const programFrequency = exercise?.frequency || 'MTWThFSaSu';
  const expectedDays = programFrequency.split(',').length || 7;
  const adherence = parseInt(exerciseMetrics?.completionCount || 0) / expectedDays;

  // Calculate completion rate (actual vs prescribed sets/reps)
  const completionRate = exerciseMetrics?.avgSets && exerciseMetrics?.avgReps && exercise ?
    Math.min((parseFloat(exerciseMetrics.avgSets) / exercise.sets) * (parseFloat(exerciseMetrics.avgReps) / exercise.reps), 1) :
    0;

  return {
    avgRpe: parseFloat(exerciseMetrics?.avgRpe) || 0,
    avgExercisePain: parseFloat(exerciseMetrics?.avgExercisePain) || 0,
    adherence: adherence || 0,
    completionRate: completionRate || 0,
    avgOverallFeeling: checkInMetrics.avgOverallFeeling || 3,
    avgGeneralPain: checkInMetrics.avgGeneralPain || 0,
    avgEnergy: checkInMetrics.avgEnergy || 3,
    avgSleep: checkInMetrics.avgSleep || 3
  };
}

/**
 * Progress a program to the next week
 * This is the main function called weekly for each program
 */
async function progressProgram(programId) {
  const cycle = await getCurrentCycle(programId);
  if (!cycle) {
    throw new Error('No active cycle found for program');
  }

  // Get all exercises in the program
  const exercises = await db.getAll(`
    SELECT * FROM program_exercises
    WHERE program_id = $1
      AND auto_adjust_enabled = true
  `, [programId]);

  // Get patient ID from program
  const program = await db.getOne('SELECT patient_id FROM programs WHERE id = $1', [programId]);
  if (!program) {
    throw new Error('Program not found');
  }

  const adjustments = [];

  // Analyze each exercise
  for (const exercise of exercises) {
    const metrics = await getWeeklyMetrics(exercise.id, program.patient_id);
    const gateCheck = checkProgressionGates(metrics, cycle.block_type);

    let newSets = exercise.sets;
    let newReps = exercise.reps;
    let reason = '';

    if (gateCheck.pass) {
      // Gates pass - can progress
      const nextWeek = cycle.current_week + 1;

      if (nextWeek <= cycle.total_weeks) {
        // Progress within current block
        const calculated = calculateSetsReps(
          cycle.block_type,
          nextWeek,
          exercise.baseline_sets,
          exercise.baseline_reps
        );
        newSets = calculated.sets;
        newReps = calculated.reps;
        reason = `Week ${cycle.current_week} → Week ${nextWeek}: All gates passed`;
      } else {
        // Block complete - transition
        if (cycle.block_type === 'introductory') {
          // Transition to standard block
          const calculated = calculateSetsReps('standard', 1, exercise.baseline_sets, exercise.baseline_reps);
          newSets = calculated.sets;
          newReps = calculated.reps;
          reason = 'Introductory block complete → Standard Block 1, Week 1 (deload)';
        } else {
          // New standard block with intensity increase
          const calculated = calculateSetsReps('standard', 1, exercise.baseline_sets, exercise.baseline_reps);
          newSets = calculated.sets;
          newReps = calculated.reps;
          reason = `Block ${cycle.block_number} complete → Block ${cycle.block_number + 1}, Week 1 (deload +10% intensity)`;
        }
      }
    } else if (metrics.avgExercisePain >= 5 || metrics.avgGeneralPain >= 7) {
      // HIGH PAIN - Regress to previous week's volume
      const previousWeek = Math.max(1, cycle.current_week - 1);
      const calculated = calculateSetsReps(
        cycle.block_type,
        previousWeek,
        exercise.baseline_sets,
        exercise.baseline_reps
      );
      newSets = calculated.sets;
      newReps = calculated.reps;
      reason = `Regressing due to high pain (exercise: ${metrics.avgExercisePain}/10, general: ${metrics.avgGeneralPain}/10)`;
    } else {
      // Gates fail - maintain current level
      const failedGates = Object.entries(gateCheck.checks)
        .filter(([_, passed]) => !passed)
        .map(([gate]) => gate)
        .join(', ');

      newSets = exercise.sets;
      newReps = exercise.reps;
      reason = `Maintaining current level - Failed gates: ${failedGates}`;
    }

    // Only adjust if values changed
    if (newSets !== exercise.sets || newReps !== exercise.reps) {
      // Update exercise
      await db.query(`
        UPDATE program_exercises
        SET sets = $1, reps = $2, last_adjusted_date = $3
        WHERE id = $4
      `, [newSets, newReps, new Date().toISOString().split('T')[0], exercise.id]);

      // Log adjustment
      await db.query(`
        INSERT INTO exercise_progression_log (
          exercise_id,
          program_id,
          previous_sets,
          previous_reps,
          new_sets,
          new_reps,
          adjustment_reason,
          avg_rpe,
          avg_pain,
          completion_rate,
          week_in_cycle
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        exercise.id,
        programId,
        exercise.sets,
        exercise.reps,
        newSets,
        newReps,
        reason,
        metrics.avgRpe,
        metrics.avgExercisePain,
        metrics.completionRate,
        cycle.current_week
      ]);

      adjustments.push({
        exerciseId: exercise.id,
        exerciseName: exercise.exercise_name,
        previousSets: exercise.sets,
        previousReps: exercise.reps,
        newSets,
        newReps,
        reason,
        metrics
      });
    }
  }

  // Update cycle
  const nextWeek = cycle.current_week + 1;

  if (nextWeek > cycle.total_weeks) {
    // Start new block
    if (cycle.block_type === 'introductory') {
      // Transition to standard
      await initializeCycle(programId, 'standard');
    } else {
      // New standard block with increased intensity
      const newIntensity = cycle.intensity_multiplier * 1.1;
      await db.query(`
        INSERT INTO periodization_cycles (
          program_id,
          block_type,
          block_number,
          block_start_date,
          current_week,
          total_weeks,
          intensity_multiplier
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        programId,
        'standard',
        cycle.block_number + 1,
        new Date().toISOString().split('T')[0],
        1,
        6,
        newIntensity
      ]);
    }
  } else {
    // Progress to next week
    await db.query(`
      UPDATE periodization_cycles
      SET current_week = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [nextWeek, cycle.id]);
  }

  return {
    success: true,
    adjustments,
    currentWeek: cycle.current_week,
    nextWeek: nextWeek > cycle.total_weeks ? 1 : nextWeek,
    blockType: cycle.block_type,
    blockNumber: cycle.block_number
  };
}

/**
 * Adjust weight based on RPE feedback (RPE-responsive progression)
 * Only applies to standard blocks (introductory uses fixed progression)
 */
async function adjustWeightBasedOnRPE(programId) {
  const cycle = await getCurrentCycle(programId);
  if (!cycle || cycle.block_type === 'introductory') {
    return { success: true, adjustments: [], message: 'Weight adjustment skipped (introductory block)' };
  }

  const exercises = await db.getAll(`
    SELECT * FROM program_exercises
    WHERE program_id = $1
      AND auto_adjust_enabled = true
      AND prescribed_weight > 0
  `, [programId]);

  const program = await db.getOne('SELECT patient_id, track_rpe FROM programs WHERE id = $1', [programId]);
  if (!program || !program.track_rpe) {
    return { success: true, adjustments: [], message: 'RPE tracking not enabled' };
  }

  const adjustments = [];

  for (const exercise of exercises) {
    const metrics = await getWeeklyMetrics(exercise.id, program.patient_id);

    let newWeight = exercise.prescribed_weight;
    let reason = '';

    if (metrics.avgRpe <= 6 && metrics.avgRpe > 0) {
      // Too easy - increase weight 5-7.5%
      const increasePercent = 0.05 + (Math.random() * 0.025); // 5-7.5%
      newWeight = Math.round((exercise.prescribed_weight * (1 + increasePercent)) * 2) / 2; // Round to 0.5kg
      reason = `RPE too low (${metrics.avgRpe}/10) - increasing weight ${Math.round(increasePercent * 100)}%`;
    } else if (metrics.avgRpe >= 9) {
      // Too hard - decrease weight 5%
      newWeight = Math.round((exercise.prescribed_weight * 0.95) * 2) / 2;
      reason = `RPE too high (${metrics.avgRpe}/10) - decreasing weight 5%`;
    }

    if (newWeight !== exercise.prescribed_weight && newWeight > 0) {
      await db.query(`
        UPDATE program_exercises
        SET prescribed_weight = $1
        WHERE id = $2
      `, [newWeight, exercise.id]);

      adjustments.push({
        exerciseId: exercise.id,
        exerciseName: exercise.exercise_name,
        previousWeight: exercise.prescribed_weight,
        newWeight,
        reason,
        avgRpe: metrics.avgRpe
      });
    }
  }

  return { success: true, adjustments, message: `Adjusted ${adjustments.length} exercise weights based on RPE` };
}

/**
 * Get progression history for a program
 */
async function getProgressionHistory(programId, limit = 50) {
  const logs = await db.getAll(`
    SELECT
      epl.*,
      pe.exercise_name,
      pe.exercise_category
    FROM exercise_progression_log epl
    JOIN program_exercises pe ON epl.exercise_id = pe.id
    WHERE epl.program_id = $1
    ORDER BY epl.adjusted_at DESC
    LIMIT $2
  `, [programId, limit]);

  return logs.map(log => ({
    id: log.id,
    exerciseId: log.exercise_id,
    exerciseName: log.exercise_name,
    exerciseCategory: log.exercise_category,
    previousSets: log.previous_sets,
    previousReps: log.previous_reps,
    newSets: log.new_sets,
    newReps: log.new_reps,
    adjustmentReason: log.adjustment_reason,
    avgRpe: log.avg_rpe,
    avgPain: log.avg_pain,
    completionRate: log.completion_rate,
    weekInCycle: log.week_in_cycle,
    adjustedAt: log.adjusted_at
  }));
}

module.exports = {
  initializeCycle,
  getCurrentCycle,
  calculateSetsReps,
  checkProgressionGates,
  getWeeklyMetrics,
  progressProgram,
  getProgressionHistory,
  adjustWeightBasedOnRPE
};
