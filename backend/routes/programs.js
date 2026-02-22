// Program routes
const express = require('express');
const db = require('../database/db');
const periodizationService = require('../services/periodization-service');
const checkInService = require('../services/check-in-service');

const router = express.Router();

// Timezone-safe date string (avoids UTC shift from toISOString)
function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Utility: Convert startDate string ('today', 'tomorrow', etc.) to actual date
function getActualStartDate(startDateValue, customStartDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (startDateValue === 'today') {
    return toLocalDateString(today);
  } else if (startDateValue === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toLocalDateString(tomorrow);
  } else if (startDateValue === 'nextweek') {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return toLocalDateString(nextWeek);
  } else if (startDateValue === 'custom' && customStartDate) {
    return customStartDate;
  } else if (startDateValue && startDateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Already a date string
    return startDateValue;
  }
  // Default to today
  return toLocalDateString(today);
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
    const dateToUse = completionDate || toLocalDateString(new Date());

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
    const today = toLocalDateString(new Date());

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
  const todayStr = toLocalDateString(today);
  const todayCompletions = completionsByDate[todayStr] || 0;
  const startFromYesterday = isScheduledDay(today, frequency) && todayCompletions === 0;

  const checkDate = new Date(today);
  if (startFromYesterday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Walk backwards through days
  for (let i = 0; i < 365; i++) {
    const dateStr = toLocalDateString(checkDate);

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
    const daysInt = parseInt(days) || 30;

    // Get all programs for this patient with frequency data
    const programs = await db.getAll(
      'SELECT id, name, frequency, start_date, created_at FROM programs WHERE patient_id = $1 ORDER BY created_at DESC',
      [patientId]
    );

    if (programs.length === 0) {
      return res.json({
        programs: [],
        overview: {
          totalCompleted: 0, completionRate: 0, completionTrend: 'stable',
          streak: 0, avgRpe: { value: 0, trend: 'stable' }, avgPain: { value: 0, trend: 'stable' },
          alerts: [], weeklyActivity: [], weightProgression: [],
          nextMilestone: null, recentWins: [], checkInSummary: null
        }
      });
    }

    // ============================================================
    // PER-PROGRAM ANALYTICS
    // ============================================================
    const perProgramData = [];
    const allCompletionsByDate = {}; // merged across all programs
    const allFrequencies = new Set();
    const allStartDates = [];
    let totalPrescribedAll = 0;
    let totalCompletedAll = 0;

    for (const program of programs) {
      const frequency = program.frequency ? JSON.parse(program.frequency) : [];
      frequency.forEach(f => allFrequencies.add(f));

      const exercises = await db.getAll(
        'SELECT id FROM program_exercises WHERE program_id = $1',
        [program.id]
      );
      const exerciseIds = exercises.map(e => e.id);

      if (exerciseIds.length === 0) {
        perProgramData.push({
          programId: program.id, programName: program.name,
          totalExercises: 0, completions: [], streak: 0, completionRate: 0
        });
        continue;
      }

      // Parse program start date
      let programStartDate = null;
      if (program.start_date && program.start_date.trim() !== '') {
        const parsedDate = new Date(program.start_date);
        if (!isNaN(parsedDate.getTime())) {
          programStartDate = parsedDate;
          programStartDate.setHours(0, 0, 0, 0);
          allStartDates.push(new Date(programStartDate));
        }
      }

      // Query window
      const daysAgoDate = new Date();
      daysAgoDate.setDate(daysAgoDate.getDate() - daysInt);
      const programCreatedDate = new Date(program.created_at);
      const queryStartDate = programCreatedDate > daysAgoDate ? programCreatedDate : daysAgoDate;
      const queryStartDateStr = toLocalDateString(queryStartDate);

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

      // All completions for streak
      const allCompletionDates = await db.getAll(`
        SELECT completion_date, COUNT(*) as count
        FROM exercise_completions
        WHERE exercise_id IN (${placeholders})
          AND patient_id = $${exerciseIds.length + 1}
        GROUP BY completion_date
        ORDER BY completion_date DESC
      `, [...exerciseIds, patientId]);

      const completionsByDate = {};
      allCompletionDates.forEach(row => {
        const dateStr = typeof row.completion_date === 'string'
          ? row.completion_date.split('T')[0]
          : toLocalDateString(new Date(row.completion_date));
        completionsByDate[dateStr] = parseInt(row.count);
        // Merge into global map
        allCompletionsByDate[dateStr] = (allCompletionsByDate[dateStr] || 0) + parseInt(row.count);
      });

      const streak = calculateScheduleAwareStreak(completionsByDate, frequency, programStartDate);

      // Completion rate per program
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const effectiveStartDate = programStartDate || new Date(programCreatedDate);
      effectiveStartDate.setHours(0, 0, 0, 0);

      let scheduledDaysInRange = 0;
      for (let d = 0; d < daysInt; d++) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() - d);
        if (checkDate >= effectiveStartDate && isScheduledDay(checkDate, frequency)) {
          scheduledDaysInRange++;
        }
      }

      const totalPrescribed = scheduledDaysInRange * exerciseIds.length;
      const totalCompleted = completions.reduce((sum, c) => sum + parseInt(c.count), 0);
      totalPrescribedAll += totalPrescribed;
      totalCompletedAll += totalCompleted;

      let completionRate = 0;
      if (totalPrescribed > 0) {
        completionRate = Math.min(Math.round((totalCompleted / totalPrescribed) * 100), 100);
      } else {
        completionRate = totalCompleted > 0 ? 100 : 0;
      }

      perProgramData.push({
        programId: program.id,
        programName: program.name,
        totalExercises: exerciseIds.length,
        completions: completions.map(c => ({ date: c.completion_date, count: parseInt(c.count) })),
        streak,
        completionRate
      });
    }

    // ============================================================
    // AGGREGATE OVERVIEW
    // ============================================================
    const mergedFrequency = [...allFrequencies];
    const earliestStart = allStartDates.length > 0
      ? new Date(Math.min(...allStartDates.map(d => d.getTime())))
      : null;

    // Aggregate streak across all programs
    const aggregateStreak = mergedFrequency.length > 0
      ? calculateScheduleAwareStreak(allCompletionsByDate, mergedFrequency, earliestStart)
      : 0;

    // Aggregate completion rate
    let aggregateCompletionRate = 0;
    if (totalPrescribedAll > 0) {
      aggregateCompletionRate = Math.min(Math.round((totalCompletedAll / totalPrescribedAll) * 100), 100);
    } else {
      aggregateCompletionRate = totalCompletedAll > 0 ? 100 : 0;
    }

    // Fetch detailed completions for RPE, pain, weight, activity
    const detailedStartDate = new Date();
    detailedStartDate.setDate(detailedStartDate.getDate() - daysInt);
    const detailedCompletions = await db.getAll(`
      SELECT
        pe.exercise_name, ec.completion_date,
        ec.rpe_rating, ec.pain_level, ec.weight_performed,
        ec.sets_performed, ec.reps_performed,
        pe.sets as prescribed_sets, pe.reps as prescribed_reps,
        pe.prescribed_weight
      FROM exercise_completions ec
      JOIN program_exercises pe ON ec.exercise_id = pe.id
      JOIN programs p ON pe.program_id = p.id
      WHERE p.patient_id = $1 AND ec.completion_date >= $2
      ORDER BY ec.completion_date ASC
    `, [patientId, toLocalDateString(detailedStartDate)]);

    // Total exercises per day (sum across all active programs)
    const totalExercisesPerDay = perProgramData.reduce((sum, p) => sum + p.totalExercises, 0);

    // --- Avg RPE with trend ---
    const completionsWithRpe = detailedCompletions.filter(c => c.rpe_rating != null && c.rpe_rating > 0);
    let avgRpe = { value: 0, trend: 'stable' };
    if (completionsWithRpe.length > 0) {
      const totalRpe = completionsWithRpe.reduce((sum, c) => sum + c.rpe_rating, 0);
      avgRpe.value = Math.round((totalRpe / completionsWithRpe.length) * 10) / 10;
      const midpoint = Math.floor(completionsWithRpe.length / 2);
      if (midpoint > 0) {
        const firstAvg = completionsWithRpe.slice(0, midpoint).reduce((s, c) => s + c.rpe_rating, 0) / midpoint;
        const secondAvg = completionsWithRpe.slice(midpoint).reduce((s, c) => s + c.rpe_rating, 0) / (completionsWithRpe.length - midpoint);
        if (secondAvg > firstAvg + 0.5) avgRpe.trend = 'up';
        else if (secondAvg < firstAvg - 0.5) avgRpe.trend = 'down';
      }
    }

    // --- Avg Pain with trend ---
    const completionsWithPain = detailedCompletions.filter(c => c.pain_level != null && c.pain_level > 0);
    let avgPain = { value: 0, trend: 'stable' };
    if (completionsWithPain.length > 0) {
      const totalPain = completionsWithPain.reduce((sum, c) => sum + c.pain_level, 0);
      avgPain.value = Math.round((totalPain / completionsWithPain.length) * 10) / 10;
      const midpoint = Math.floor(completionsWithPain.length / 2);
      if (midpoint > 0) {
        const firstAvg = completionsWithPain.slice(0, midpoint).reduce((s, c) => s + c.pain_level, 0) / midpoint;
        const secondAvg = completionsWithPain.slice(midpoint).reduce((s, c) => s + c.pain_level, 0) / (completionsWithPain.length - midpoint);
        if (secondAvg > firstAvg + 0.5) avgPain.trend = 'up';
        else if (secondAvg < firstAvg - 0.5) avgPain.trend = 'down';
      }
    }

    // --- Weight Progression ---
    const weightByExercise = {};
    detailedCompletions.forEach(c => {
      if (c.weight_performed && c.weight_performed > 0) {
        if (!weightByExercise[c.exercise_name]) weightByExercise[c.exercise_name] = [];
        weightByExercise[c.exercise_name].push({
          date: typeof c.completion_date === 'string' ? c.completion_date.split('T')[0] : toLocalDateString(new Date(c.completion_date)),
          weight: c.weight_performed
        });
      }
    });

    const weightProgression = Object.entries(weightByExercise).map(([name, data]) => {
      const sorted = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const firstWeight = sorted[0]?.weight || 0;
      const lastWeight = sorted[sorted.length - 1]?.weight || 0;
      const change = lastWeight - firstWeight;
      const changePercent = firstWeight > 0 ? Math.round((change / firstWeight) * 100) : 0;
      return { exerciseName: name, startWeight: firstWeight, currentWeight: lastWeight, change, changePercent, dataPoints: sorted };
    }).filter(ex => ex.change !== 0 || ex.dataPoints.length > 1);

    // --- Weekly Activity with status ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weeklyActivity = [];

    for (let i = daysInt - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dateStr = toLocalDateString(day);
      const dayLabel = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const weekday = day.toLocaleDateString('en-US', { weekday: 'short' });
      const count = allCompletionsByDate[dateStr] || 0;

      // Determine status
      let status = 'rest';
      if (day > today) {
        status = 'future';
      } else if (earliestStart && day < earliestStart) {
        status = 'rest';
      } else if (isScheduledDay(day, mergedFrequency)) {
        if (count === 0) status = 'missed';
        else if (count >= totalExercisesPerDay) status = 'full';
        else status = 'partial';
      }

      weeklyActivity.push({ date: dateStr, dayLabel, weekday, count, status });
    }

    // --- Completion Trend (first week vs last week) ---
    let completionTrend = 'stable';
    if (weeklyActivity.length >= 7) {
      const firstWeekTotal = weeklyActivity.slice(0, 7).reduce((sum, d) => sum + d.count, 0);
      const lastWeekTotal = weeklyActivity.slice(-7).reduce((sum, d) => sum + d.count, 0);
      if (lastWeekTotal > firstWeekTotal + 2) completionTrend = 'up';
      else if (lastWeekTotal < firstWeekTotal - 2) completionTrend = 'down';
    }

    // --- Alerts ---
    const alerts = [];
    const highPainCompletions = completionsWithPain.filter(c => c.pain_level >= 7);
    if (highPainCompletions.length > 0) {
      const maxPain = Math.max(...highPainCompletions.map(c => c.pain_level));
      const painRow = highPainCompletions.find(c => c.pain_level === maxPain);
      const painDateStr = painRow ? (typeof painRow.completion_date === 'string' ? painRow.completion_date.split('T')[0] : toLocalDateString(new Date(painRow.completion_date))) : '';
      const dateLabel = painDateStr ? new Date(painDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      alerts.push({ severity: 'critical', message: `High pain reported (${maxPain}/10) on ${dateLabel}` });
    }
    if (aggregateCompletionRate < 50) {
      alerts.push({ severity: 'warning', message: `Low completion rate (${aggregateCompletionRate}%) - consider follow-up` });
    } else if (aggregateStreak === 0 && totalCompletedAll > 0) {
      alerts.push({ severity: 'warning', message: 'Streak broken - patient may need encouragement' });
    }
    if (alerts.length === 0 && totalCompletedAll > 0) {
      alerts.push({ severity: 'success', message: 'Patient is progressing well' });
    }

    // --- Next Milestone ---
    let nextMilestone = null;
    if (aggregateStreak < 7) {
      const daysToGo = 7 - aggregateStreak;
      nextMilestone = { type: 'streak', value: daysToGo, message: `${daysToGo} more day${daysToGo > 1 ? 's' : ''} to a 7-day streak!` };
    } else if (aggregateStreak < 14) {
      const daysToGo = 14 - aggregateStreak;
      nextMilestone = { type: 'streak', value: daysToGo, message: `${daysToGo} more day${daysToGo > 1 ? 's' : ''} to a 2-week streak!` };
    } else if (aggregateStreak < 30) {
      const daysToGo = 30 - aggregateStreak;
      nextMilestone = { type: 'streak', value: daysToGo, message: `${daysToGo} more day${daysToGo > 1 ? 's' : ''} to a 30-day streak!` };
    } else {
      nextMilestone = { type: 'celebration', value: aggregateStreak, message: `Amazing ${aggregateStreak}-day streak! Keep it going!` };
    }

    // --- Recent Wins ---
    const recentWins = [];
    const uniqueDates = [...new Set(detailedCompletions.map(c =>
      typeof c.completion_date === 'string' ? c.completion_date.split('T')[0] : toLocalDateString(new Date(c.completion_date))
    ))];
    const daysWithFullCompletion = uniqueDates.filter(dateStr => {
      const dayCompletions = detailedCompletions.filter(c => {
        const cDate = typeof c.completion_date === 'string' ? c.completion_date.split('T')[0] : toLocalDateString(new Date(c.completion_date));
        return cDate === dateStr;
      });
      return dayCompletions.every(c => c.sets_performed >= c.prescribed_sets && c.reps_performed >= c.prescribed_reps);
    }).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    if (daysWithFullCompletion.length > 0) {
      const mostRecent = daysWithFullCompletion[0];
      const dateLabel = new Date(mostRecent).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      recentWins.push({ type: 'completion', message: `Completed all exercises on ${dateLabel}`, date: mostRecent });
    }
    weightProgression.filter(ex => ex.change > 0).slice(0, 2).forEach(ex => {
      recentWins.push({ type: 'weight', message: `Increased ${ex.exerciseName} by ${ex.change}kg`, date: ex.dataPoints[ex.dataPoints.length - 1]?.date || '' });
    });
    const todayStr = toLocalDateString(today);
    if (aggregateStreak >= 7 && aggregateStreak < 8) {
      recentWins.push({ type: 'streak', message: '7-day streak achieved!', date: todayStr });
    } else if (aggregateStreak >= 14 && aggregateStreak < 15) {
      recentWins.push({ type: 'streak', message: '2-week streak achieved!', date: todayStr });
    } else if (aggregateStreak >= 30 && aggregateStreak < 31) {
      recentWins.push({ type: 'streak', message: '30-day streak achieved!', date: todayStr });
    }

    // --- Check-In Summary ---
    let checkInSummary = null;
    try {
      const checkInStartDate = new Date();
      checkInStartDate.setDate(checkInStartDate.getDate() - daysInt);
      const metrics = await checkInService.getAverageCheckInMetrics(
        parseInt(patientId),
        toLocalDateString(checkInStartDate),
        toLocalDateString(today)
      );
      if (metrics && metrics.checkInCount > 0) {
        checkInSummary = {
          avgFeeling: Math.round(metrics.avgOverallFeeling * 10) / 10,
          avgPain: Math.round(metrics.avgGeneralPain * 10) / 10,
          avgEnergy: Math.round(metrics.avgEnergy * 10) / 10,
          avgSleep: Math.round(metrics.avgSleep * 10) / 10,
          totalCheckIns: metrics.checkInCount
        };
      }
    } catch (e) {
      // Check-ins are optional, don't fail the whole response
    }

    res.json({
      programs: perProgramData,
      overview: {
        totalCompleted: totalCompletedAll,
        completionRate: aggregateCompletionRate,
        completionTrend,
        streak: aggregateStreak,
        avgRpe,
        avgPain,
        alerts,
        weeklyActivity,
        weightProgression,
        nextMilestone,
        recentWins: recentWins.slice(0, 3),
        checkInSummary
      }
    });
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
    const startDateStr = toLocalDateString(startDate);

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
