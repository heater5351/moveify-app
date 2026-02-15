// Program routes
const express = require('express');
const db = require('../database/db');
const periodizationService = require('../services/periodization-service');

const router = express.Router();

// Utility: Convert startDate string ('today', 'tomorrow', etc.) to actual date
function getActualStartDate(startDateValue, customStartDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (startDateValue === 'today') {
    return today.toISOString().split('T')[0];
  } else if (startDateValue === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  } else if (startDateValue === 'nextweek') {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  } else if (startDateValue === 'custom' && customStartDate) {
    return customStartDate;
  } else if (startDateValue && startDateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Already a date string
    return startDateValue;
  }
  // Default to today
  return today.toISOString().split('T')[0];
}

// Get program for a patient
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    // Get the program
    const program = await db.getOne(
      'SELECT * FROM programs WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1',
      [patientId]
    );

    if (!program) {
      return res.json({ program: null });
    }

    // Get the exercises for this program
    const exercises = await db.getAll(
      'SELECT * FROM program_exercises WHERE program_id = $1 ORDER BY exercise_order ASC',
      [program.id]
    );

    // Format frequency back to array
    const frequency = program.frequency ? JSON.parse(program.frequency) : [];

    res.json({
      program: {
        id: program.id,
        patientId: program.patient_id,
        startDate: program.start_date,
        frequency: frequency,
        duration: program.duration,
        customEndDate: program.custom_end_date,
        trackActualPerformance: program.track_actual_performance === true,
        trackRpe: program.track_rpe === true,
        trackPainLevel: program.track_pain === true,
        exercises: exercises.map(ex => ({
          id: ex.id,
          name: ex.exercise_name,
          category: ex.exercise_category,
          sets: ex.sets,
          reps: ex.reps,
          prescribedWeight: ex.prescribed_weight || 0,
          holdTime: ex.hold_time,
          instructions: ex.instructions,
          image: ex.image_url,
          completed: ex.completed === 1,
          enablePeriodization: ex.auto_adjust_enabled === true
        }))
      }
    });
  } catch (error) {
    console.error('Get program error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new program for a patient
router.post('/patient/:patientId', async (req, res) => {
  const client = await db.getClient();

  try {
    const { patientId } = req.params;
    const { exercises, config, name, blockType } = req.body;

    if (!name || name.trim() === '') {
      client.release();
      return res.status(400).json({ error: 'Program name is required' });
    }

    if (!exercises || exercises.length === 0) {
      client.release();
      return res.status(400).json({ error: 'Exercises are required' });
    }

    await client.query('BEGIN');

    const actualStartDate = getActualStartDate(config?.startDate, config?.customStartDate);

    // Create new program
    const programResult = await client.query(`
      INSERT INTO programs (patient_id, name, start_date, frequency, duration, custom_end_date, track_actual_performance, track_rpe, track_pain)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      patientId,
      name,
      actualStartDate,
      JSON.stringify(config?.frequency || []),
      config?.duration || '4weeks',
      config?.customEndDate || null,
      config?.trackActualPerformance !== undefined ? config.trackActualPerformance : true,
      config?.trackRpe || false,
      config?.trackPainLevel || false
    ]);

    const programId = programResult.rows[0].id;

    // Insert exercises with baseline values
    for (let index = 0; index < exercises.length; index++) {
      const exercise = exercises[index];
      const baselineSets = exercise.sets;
      const baselineReps = exercise.reps;

      // Calculate initial sets/reps based on block type
      const cycleBlockType = blockType || 'standard';
      const calculated = periodizationService.calculateSetsReps(
        cycleBlockType,
        1, // Week 1
        baselineSets,
        baselineReps
      );

      await client.query(`
        INSERT INTO program_exercises (
          program_id, exercise_name, exercise_category, sets, reps, prescribed_weight,
          hold_time, instructions, image_url, exercise_order,
          baseline_sets, baseline_reps, auto_adjust_enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        programId,
        exercise.name,
        exercise.category || '',
        calculated.sets,
        calculated.reps,
        exercise.prescribedWeight || 0,
        exercise.holdTime || '',
        exercise.instructions || '',
        exercise.image || '',
        index,
        baselineSets,
        baselineReps,
        exercise.enablePeriodization !== undefined ? exercise.enablePeriodization : false
      ]);
    }

    await client.query('COMMIT');
    client.release();

    // Initialize periodization cycle
    try {
      const cycleBlockType = blockType || 'standard';
      await periodizationService.initializeCycle(programId, cycleBlockType);
    } catch (error) {
      console.error('Failed to initialize cycle:', error);
    }

    res.json({
      message: 'Program assigned successfully',
      programId: programId,
      blockType: blockType || 'standard'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Create program error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update existing program
router.put('/:programId', async (req, res) => {
  const client = await db.getClient();

  try {
    const { programId } = req.params;
    const { exercises, config, name } = req.body;

    if (!name || name.trim() === '') {
      client.release();
      return res.status(400).json({ error: 'Program name is required' });
    }

    if (!exercises || exercises.length === 0) {
      client.release();
      return res.status(400).json({ error: 'Exercises are required' });
    }

    await client.query('BEGIN');

    const actualStartDate = getActualStartDate(config?.startDate, config?.customStartDate);

    // Update program metadata
    await client.query(`
      UPDATE programs
      SET name = $1, start_date = $2, frequency = $3, duration = $4, custom_end_date = $5,
          track_actual_performance = $6, track_rpe = $7, track_pain = $8, updated_at = NOW()
      WHERE id = $9
    `, [
      name,
      actualStartDate,
      JSON.stringify(config?.frequency || []),
      config?.duration || '4weeks',
      config?.customEndDate || null,
      config?.trackActualPerformance !== undefined ? config.trackActualPerformance : true,
      config?.trackRpe || false,
      config?.trackPainLevel || false,
      programId
    ]);

    // Get existing exercises to preserve IDs and completion history
    const existingExercises = await client.query(
      'SELECT id, exercise_name FROM program_exercises WHERE program_id = $1 ORDER BY exercise_order ASC',
      [programId]
    );
    const existingExerciseMap = new Map(
      existingExercises.rows.map(ex => [ex.exercise_name, ex.id])
    );

    // Track which exercise IDs we're keeping
    const updatedExerciseIds = new Set();

    // Update or insert exercises (preserve existing IDs where possible)
    for (let index = 0; index < exercises.length; index++) {
      const exercise = exercises[index];
      const existingId = existingExerciseMap.get(exercise.name);

      if (existingId) {
        // Exercise exists - UPDATE it (preserves ID and completion history)
        await client.query(`
          UPDATE program_exercises
          SET exercise_category = $1, sets = $2, reps = $3, prescribed_weight = $4,
              hold_time = $5, instructions = $6, image_url = $7, exercise_order = $8,
              auto_adjust_enabled = $9
          WHERE id = $10
        `, [
          exercise.category || '',
          exercise.sets,
          exercise.reps,
          exercise.prescribedWeight || 0,
          exercise.holdTime || '',
          exercise.instructions || '',
          exercise.image || '',
          index,
          exercise.enablePeriodization !== undefined ? exercise.enablePeriodization : false,
          existingId
        ]);
        updatedExerciseIds.add(existingId);
      } else {
        // New exercise - INSERT it
        await client.query(`
          INSERT INTO program_exercises (
            program_id, exercise_name, exercise_category, sets, reps, prescribed_weight,
            hold_time, instructions, image_url, exercise_order, auto_adjust_enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          programId,
          exercise.name,
          exercise.category || '',
          exercise.sets,
          exercise.reps,
          exercise.prescribedWeight || 0,
          exercise.holdTime || '',
          exercise.instructions || '',
          exercise.image || '',
          index,
          exercise.enablePeriodization !== undefined ? exercise.enablePeriodization : false
        ]);
      }
    }

    // Delete exercises that were removed from the program
    if (updatedExerciseIds.size > 0) {
      const idsToKeep = Array.from(updatedExerciseIds);
      const placeholders = idsToKeep.map((_, i) => `$${i + 2}`).join(',');
      await client.query(
        `DELETE FROM program_exercises WHERE program_id = $1 AND id NOT IN (${placeholders})`,
        [programId, ...idsToKeep]
      );
    } else {
      // All exercises removed - delete all
      await client.query('DELETE FROM program_exercises WHERE program_id = $1', [programId]);
    }

    await client.query('COMMIT');
    client.release();

    res.json({
      message: 'Program updated successfully',
      programId: programId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Update program error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update exercise completion status (daily tracking)
router.patch('/exercise/:exerciseId/complete', async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const {
      completed,
      patientId,
      setsPerformed,
      repsPerformed,
      weightPerformed,
      rpeRating,
      painLevel,
      notes,
      completionDate
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    // Validation
    if (rpeRating !== undefined && (rpeRating < 1 || rpeRating > 10)) {
      return res.status(400).json({ error: 'RPE rating must be between 1 and 10' });
    }
    if (painLevel !== undefined && (painLevel < 0 || painLevel > 10)) {
      return res.status(400).json({ error: 'Pain level must be between 0 and 10' });
    }

    // Use provided completionDate or default to today
    const dateToUse = completionDate || new Date().toISOString().split('T')[0];

    if (completed) {
      // PostgreSQL upsert using ON CONFLICT
      await db.query(`
        INSERT INTO exercise_completions (
          exercise_id, patient_id, completion_date,
          sets_performed, reps_performed, weight_performed, rpe_rating, pain_level, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (exercise_id, patient_id, completion_date)
        DO UPDATE SET
          sets_performed = EXCLUDED.sets_performed,
          reps_performed = EXCLUDED.reps_performed,
          weight_performed = EXCLUDED.weight_performed,
          rpe_rating = EXCLUDED.rpe_rating,
          pain_level = EXCLUDED.pain_level,
          notes = EXCLUDED.notes
      `, [
        exerciseId,
        patientId,
        dateToUse,
        setsPerformed || null,
        repsPerformed || null,
        weightPerformed || null,
        rpeRating || null,
        painLevel || null,
        notes || null
      ]);
    } else {
      // Remove completion for the specified date
      await db.query(
        'DELETE FROM exercise_completions WHERE exercise_id = $1 AND patient_id = $2 AND completion_date = $3',
        [exerciseId, patientId, dateToUse]
      );
    }

    res.json({ message: 'Exercise updated successfully' });
  } catch (error) {
    console.error('Update exercise error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get today's completion details for an exercise
router.get('/exercise/:exerciseId/completion/:patientId/today', async (req, res) => {
  try {
    const { exerciseId, patientId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const completion = await db.getOne(`
      SELECT sets_performed, reps_performed, weight_performed, rpe_rating, pain_level, notes
      FROM exercise_completions
      WHERE exercise_id = $1 AND patient_id = $2 AND completion_date = $3
    `, [exerciseId, patientId, today]);

    res.json({ completion: completion || null });
  } catch (error) {
    console.error('Get completion details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: Check if a date is a scheduled day based on program frequency
function isScheduledDay(date, frequency) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return frequency.includes(dayNames[date.getDay()]);
}

// Helper: Calculate schedule-aware streak (LENIENT MODE)
// Any activity on a scheduled day counts - only zero completions breaks streak
function calculateScheduleAwareStreak(completionsByDate, frequency, programStartDate) {
  if (!frequency || frequency.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Grace period: if today is scheduled but has no activity yet, start from yesterday
  const todayStr = today.toISOString().split('T')[0];
  const todayCompletions = completionsByDate[todayStr] || 0;
  const startFromYesterday = isScheduledDay(today, frequency) && todayCompletions === 0;

  const checkDate = new Date(today);
  if (startFromYesterday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Walk backwards through days
  for (let i = 0; i < 365; i++) {
    const dateStr = checkDate.toISOString().split('T')[0];

    // Don't count days before program started
    if (programStartDate && checkDate < programStartDate) {
      break;
    }

    if (isScheduledDay(checkDate, frequency)) {
      const completionCount = completionsByDate[dateStr] || 0;

      if (completionCount > 0) {
        // Any activity counts (lenient mode)
        streak++;
      } else {
        // Zero completions on a scheduled day - streak breaks
        break;
      }
    }
    // Non-scheduled days are skipped (don't break streak)

    checkDate.setDate(checkDate.getDate() - 1);
  }

  return streak;
}

// Get completion analytics for a patient
router.get('/analytics/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days = 30 } = req.query;

    // Get all programs for this patient with frequency data
    const programs = await db.getAll(
      'SELECT id, name, frequency, start_date, created_at FROM programs WHERE patient_id = $1 ORDER BY created_at DESC',
      [patientId]
    );

    if (programs.length === 0) {
      return res.json({ programs: [], analytics: {} });
    }

    const analyticsData = await Promise.all(programs.map(async (program) => {
      // Parse frequency from JSON
      const frequency = program.frequency ? JSON.parse(program.frequency) : [];

      // Get all exercises for this program
      const exercises = await db.getAll(
        'SELECT id FROM program_exercises WHERE program_id = $1',
        [program.id]
      );

      const exerciseIds = exercises.map(e => e.id);

      if (exerciseIds.length === 0) {
        return {
          programId: program.id,
          programName: program.name,
          totalExercises: 0,
          completions: [],
          streak: 0,
          completionRate: 0
        };
      }

      // Parse program start date
      let programStartDate = null;
      if (program.start_date && program.start_date.trim() !== '') {
        const parsedDate = new Date(program.start_date);
        if (!isNaN(parsedDate.getTime())) {
          programStartDate = parsedDate;
          programStartDate.setHours(0, 0, 0, 0);
        }
      }

      // Calculate start date for query window
      const daysAgoDate = new Date();
      daysAgoDate.setDate(daysAgoDate.getDate() - days);

      const programCreatedDate = new Date(program.created_at);
      const queryStartDate = programCreatedDate > daysAgoDate ? programCreatedDate : daysAgoDate;
      const queryStartDateStr = queryStartDate.toISOString().split('T')[0];

      // Build parameterized query for exercise IDs
      const placeholders = exerciseIds.map((_, i) => `$${i + 1}`).join(',');
      const completions = await db.getAll(`
        SELECT completion_date, COUNT(*) as count
        FROM exercise_completions
        WHERE exercise_id IN (${placeholders})
          AND patient_id = $${exerciseIds.length + 1}
          AND completion_date >= $${exerciseIds.length + 2}
        GROUP BY completion_date
        ORDER BY completion_date ASC
      `, [...exerciseIds, patientId, queryStartDateStr]);

      // Fetch ALL completion dates for streak calculation
      const allCompletionDates = await db.getAll(`
        SELECT completion_date, COUNT(*) as count
        FROM exercise_completions
        WHERE exercise_id IN (${placeholders})
          AND patient_id = $${exerciseIds.length + 1}
        GROUP BY completion_date
        ORDER BY completion_date DESC
      `, [...exerciseIds, patientId]);

      // Build completions by date map for streak calculation
      const completionsByDate = {};
      allCompletionDates.forEach(row => {
        const dateStr = typeof row.completion_date === 'string'
          ? row.completion_date.split('T')[0]
          : new Date(row.completion_date).toISOString().split('T')[0];
        completionsByDate[dateStr] = parseInt(row.count);
      });

      // Calculate schedule-aware streak
      const streak = calculateScheduleAwareStreak(
        completionsByDate,
        frequency,
        programStartDate
      );

      // Calculate completion rate based on scheduled days only
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const effectiveStartDate = programStartDate || programCreatedDate;
      effectiveStartDate.setHours(0, 0, 0, 0);

      // Count scheduled days between start and now
      let scheduledDays = 0;
      const countDate = new Date(effectiveStartDate);
      while (countDate <= now) {
        if (isScheduledDay(countDate, frequency)) {
          scheduledDays++;
        }
        countDate.setDate(countDate.getDate() + 1);
      }

      // Count days with any completions
      const daysWithCompletions = Object.keys(completionsByDate).filter(dateStr => {
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);
        return date >= effectiveStartDate && date <= now && isScheduledDay(date, frequency);
      }).length;

      const completionRate = scheduledDays > 0
        ? Math.round((daysWithCompletions / scheduledDays) * 100)
        : 0;

      return {
        programId: program.id,
        programName: program.name,
        totalExercises: exerciseIds.length,
        completions: completions.map(c => ({
          date: c.completion_date,
          count: parseInt(c.count)
        })),
        streak: streak,
        completionRate: completionRate
      };
    }));

    res.json({ programs: analyticsData });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete program
router.delete('/:programId', async (req, res) => {
  try {
    const { programId } = req.params;

    await db.query('DELETE FROM programs WHERE id = $1', [programId]);

    res.json({ message: 'Program deleted successfully' });
  } catch (error) {
    console.error('Delete program error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== PERIODIZATION ENDPOINTS =====

// Trigger weekly progression for a program
router.post('/:programId/progress', async (req, res) => {
  try {
    const { programId } = req.params;

    const result = await periodizationService.progressProgram(parseInt(programId));

    res.json(result);
  } catch (error) {
    console.error('Progress program error:', error);
    res.status(500).json({ error: error.message || 'Failed to progress program' });
  }
});

// Adjust weights based on RPE (called after progressProgram)
router.post('/:programId/adjust-weight', async (req, res) => {
  try {
    const { programId } = req.params;
    const result = await periodizationService.adjustWeightBasedOnRPE(parseInt(programId));
    res.json(result);
  } catch (error) {
    console.error('Adjust weight error:', error);
    res.status(500).json({ error: error.message || 'Failed to adjust weight' });
  }
});

// Get current periodization cycle for a program
router.get('/:programId/cycle', async (req, res) => {
  try {
    const { programId } = req.params;

    const cycle = await periodizationService.getCurrentCycle(parseInt(programId));

    if (!cycle) {
      return res.status(404).json({ error: 'No active cycle found' });
    }

    res.json({
      id: cycle.id,
      programId: cycle.program_id,
      blockType: cycle.block_type,
      blockNumber: cycle.block_number,
      blockStartDate: cycle.block_start_date,
      currentWeek: cycle.current_week,
      totalWeeks: cycle.total_weeks,
      intensityMultiplier: cycle.intensity_multiplier,
      createdAt: cycle.created_at,
      updatedAt: cycle.updated_at
    });
  } catch (error) {
    console.error('Get cycle error:', error);
    res.status(500).json({ error: 'Failed to get cycle' });
  }
});

// Get progression history for a program
router.get('/:programId/progression-history', async (req, res) => {
  try {
    const { programId } = req.params;
    const { limit } = req.query;

    const history = await periodizationService.getProgressionHistory(
      parseInt(programId),
      limit ? parseInt(limit) : 50
    );

    res.json(history);
  } catch (error) {
    console.error('Get progression history error:', error);
    res.status(500).json({ error: 'Failed to get progression history' });
  }
});

// Get weekly metrics for an exercise
router.get('/exercise/:exerciseId/metrics', async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const { patientId } = req.query;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    const metrics = await periodizationService.getWeeklyMetrics(
      parseInt(exerciseId),
      parseInt(patientId)
    );

    res.json(metrics);
  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Get exercise completions for a patient (clinician dashboard)
router.get('/exercise-completions/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days } = req.query;

    const daysInt = days ? parseInt(days) : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysInt);
    const startDateStr = startDate.toISOString().split('T')[0];

    const completions = await db.getAll(`
      SELECT
        ec.id,
        pe.exercise_name as "exerciseName",
        ec.completion_date as "completionDate",
        ec.sets_performed as "setsPerformed",
        ec.reps_performed as "repsPerformed",
        ec.weight_performed as "weightPerformed",
        pe.sets as "prescribedSets",
        pe.reps as "prescribedReps",
        pe.prescribed_weight as "prescribedWeight",
        ec.rpe_rating as "rpeRating",
        ec.pain_level as "painLevel",
        ec.notes
      FROM exercise_completions ec
      JOIN program_exercises pe ON ec.exercise_id = pe.id
      WHERE ec.patient_id = $1
        AND ec.completion_date >= $2
      ORDER BY ec.completion_date DESC, ec.completed_at DESC
    `, [patientId, startDateStr]);

    res.json({ completions });
  } catch (error) {
    console.error('Get exercise completions error:', error);
    res.status(500).json({ error: 'Failed to get exercise completions' });
  }
});

// Get progression logs for all programs of a patient (clinician dashboard)
router.get('/progression-logs/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit } = req.query;

    const logs = await db.getAll(`
      SELECT
        epl.id,
        pe.exercise_name as "exerciseName",
        pe.exercise_category as "exerciseCategory",
        epl.previous_sets as "previousSets",
        epl.previous_reps as "previousReps",
        epl.new_sets as "newSets",
        epl.new_reps as "newReps",
        epl.adjustment_reason as "adjustmentReason",
        epl.avg_rpe as "avgRpe",
        epl.avg_pain as "avgPain",
        epl.completion_rate as "completionRate",
        epl.week_in_cycle as "weekInCycle",
        epl.adjusted_at as "adjustedAt"
      FROM exercise_progression_log epl
      JOIN program_exercises pe ON epl.exercise_id = pe.id
      JOIN programs p ON epl.program_id = p.id
      WHERE p.patient_id = $1
      ORDER BY epl.adjusted_at DESC
      LIMIT $2
    `, [patientId, limit ? parseInt(limit) : 50]);

    res.json({ logs });
  } catch (error) {
    console.error('Get progression logs error:', error);
    res.status(500).json({ error: 'Failed to get progression logs' });
  }
});

// Override auto-adjustment for an exercise
router.patch('/exercise/:exerciseId/override', async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const { sets, reps, autoAdjustEnabled } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (sets !== undefined) {
      updates.push(`sets = $${paramIndex++}`);
      values.push(sets);
    }

    if (reps !== undefined) {
      updates.push(`reps = $${paramIndex++}`);
      values.push(reps);
    }

    if (autoAdjustEnabled !== undefined) {
      updates.push(`auto_adjust_enabled = $${paramIndex++}`);
      values.push(autoAdjustEnabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(parseInt(exerciseId));

    await db.query(`
      UPDATE program_exercises
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, values);

    res.json({ message: 'Exercise updated successfully' });
  } catch (error) {
    console.error('Override exercise error:', error);
    res.status(500).json({ error: 'Failed to update exercise' });
  }
});

// ADMIN: Clear all check-in and completion data (for fresh start)
// SECURITY: Requires admin secret header to prevent unauthorized data deletion
router.delete('/admin/clear-data', async (req, res) => {
  try {
    // Check for admin authorization
    const adminSecret = req.headers['x-admin-secret'];
    const expectedSecret = process.env.ADMIN_SECRET || 'moveify-admin-2024';

    if (!adminSecret || adminSecret !== expectedSecret) {
      return res.status(403).json({ error: 'Unauthorized: Invalid or missing admin secret' });
    }

    // Clear all exercise completions
    const completionsResult = await db.query('DELETE FROM exercise_completions');

    // Clear all daily check-ins
    const checkInsResult = await db.query('DELETE FROM daily_check_ins');

    res.json({
      message: 'All check-in and exercise completion data cleared successfully',
      deletedCompletions: completionsResult.rowCount,
      deletedCheckIns: checkInsResult.rowCount
    });
  } catch (error) {
    console.error('Clear data error:', error);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

module.exports = router;
