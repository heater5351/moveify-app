// Test script for auto periodization system
const db = require('./database/db');
const periodizationService = require('./services/periodization-service');
const checkInService = require('./services/check-in-service');

console.log('\n🧪 TESTING AUTO PERIODIZATION SYSTEM\n');

// Helper to get date string
function getDateString(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// Clean up existing test data
function cleanup() {
  console.log('🧹 Cleaning up test data...');
  db.prepare("DELETE FROM users WHERE email LIKE 'test%@example.com'").run();
  console.log('✅ Cleanup complete\n');
}

// Step 1: Create test patient
function createTestPatient() {
  console.log('👤 Step 1: Creating test patient...');

  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role, name, dob, phone, address, condition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'test.patient@example.com',
    'hashed_password',
    'patient',
    'Test Patient',
    '1990-01-01',
    '555-0123',
    '123 Test St',
    'Shoulder rehabilitation'
  );

  console.log(`✅ Created patient with ID: ${result.lastInsertRowid}\n`);
  return result.lastInsertRowid;
}

// Step 2: Create program with introductory block
function createTestProgram(patientId) {
  console.log('📋 Step 2: Creating program with INTRODUCTORY block...');

  // Create program
  const programResult = db.prepare(`
    INSERT INTO programs (patient_id, name, start_date, frequency, duration, track_actual_performance, track_rpe, track_pain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patientId,
    'Beginner Strength Program',
    getDateString(14), // Started 2 weeks ago
    JSON.stringify(['Mon', 'Wed', 'Fri']),
    'ongoing',
    1,
    1,
    1
  );

  const programId = programResult.lastInsertRowid;

  // Add exercises
  const exercises = [
    { name: 'Squat', category: 'Lower Body', sets: 3, reps: 10 },
    { name: 'Push-up', category: 'Upper Body', sets: 3, reps: 8 },
    { name: 'Plank Hold', category: 'Core', sets: 3, reps: 30 }
  ];

  exercises.forEach((exercise, index) => {
    db.prepare(`
      INSERT INTO program_exercises (
        program_id, exercise_name, exercise_category, sets, reps,
        baseline_sets, baseline_reps, auto_adjust_enabled, exercise_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      programId,
      exercise.name,
      exercise.category,
      1, // Week 1 of intro block starts at 1 set
      8,
      exercise.sets,
      exercise.reps,
      1,
      index
    );
  });

  // Initialize periodization cycle
  periodizationService.initializeCycle(programId, 'introductory');

  console.log(`✅ Created program with ID: ${programId}`);
  console.log(`   - 3 exercises with baseline values`);
  console.log(`   - Started at Week 1 of Introductory Block (1x8)`);
  console.log(`   - Auto-adjustment enabled\n`);

  return programId;
}

// Step 3: Simulate daily check-ins for past 2 weeks
function simulateDailyCheckIns(patientId) {
  console.log('📝 Step 3: Simulating daily check-ins for past 14 days...');

  let goodDays = 0;
  let okayDays = 0;
  let poorDays = 0;

  for (let i = 13; i >= 0; i--) {
    const date = getDateString(i);

    // Vary the check-in data (mostly good with some variation)
    let overallFeeling, energyLevel, sleepQuality, generalPain;

    if (i > 10) {
      // First 3 days - getting used to it
      overallFeeling = 3; // Okay
      energyLevel = 3;
      sleepQuality = 3;
      generalPain = 2;
      okayDays++;
    } else if (i > 7) {
      // Week 1 - improving
      overallFeeling = 4; // Good
      energyLevel = 4;
      sleepQuality = 4;
      generalPain = 1;
      goodDays++;
    } else {
      // Week 2 - feeling great
      overallFeeling = 4 + (Math.random() > 0.5 ? 1 : 0); // Good to Great
      energyLevel = 4 + (Math.random() > 0.5 ? 1 : 0);
      sleepQuality = 4;
      generalPain = Math.floor(Math.random() * 2); // 0-1
      goodDays++;
    }

    checkInService.submitCheckIn({
      patientId,
      checkInDate: date,
      overallFeeling,
      generalPainLevel: generalPain,
      energyLevel,
      sleepQuality
    });
  }

  console.log(`✅ Created 14 daily check-ins:`);
  console.log(`   - ${goodDays} good days (feeling great, good energy)`);
  console.log(`   - ${okayDays} okay days (adjusting to program)`);
  console.log(`   - ${poorDays} poor days\n`);
}

// Step 4: Simulate exercise completions
function simulateExerciseCompletions(programId, patientId) {
  console.log('💪 Step 4: Simulating exercise completions for past 2 weeks...');

  const exercises = db.prepare('SELECT * FROM program_exercises WHERE program_id = ?').all(programId);

  // Simulate completions for Mon, Wed, Fri over past 2 weeks
  const workoutDays = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });

    if (['Mon', 'Wed', 'Fri'].includes(dayOfWeek)) {
      workoutDays.push({ date: getDateString(i), daysAgo: i });
    }
  }

  let totalCompletions = 0;

  workoutDays.forEach(({ date, daysAgo }) => {
    exercises.forEach(exercise => {
      // Get current prescribed sets/reps for this exercise
      const current = db.prepare('SELECT sets, reps FROM program_exercises WHERE id = ?').get(exercise.id);

      // Simulate good performance (completing prescribed + good RPE/pain)
      const setsPerformed = current.sets;
      const repsPerformed = current.reps + Math.floor(Math.random() * 2); // Sometimes do extra reps

      // RPE and pain improve over time
      const rpe = daysAgo > 10 ? 7 : daysAgo > 7 ? 6 : 5 + Math.floor(Math.random() * 2);
      const pain = daysAgo > 10 ? 2 : Math.floor(Math.random() * 2);

      db.prepare(`
        INSERT INTO exercise_completions (
          exercise_id, patient_id, completion_date,
          sets_performed, reps_performed, rpe_rating, pain_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        exercise.id,
        patientId,
        date,
        setsPerformed,
        repsPerformed,
        rpe,
        pain
      );

      totalCompletions++;
    });
  });

  console.log(`✅ Created ${totalCompletions} exercise completions`);
  console.log(`   - ${workoutDays.length} workout sessions (Mon, Wed, Fri)`);
  console.log(`   - 3 exercises per session`);
  console.log(`   - RPE improved from 7 → 5-6 over time`);
  console.log(`   - Pain decreased from 2 → 0-1 over time\n`);
}

// Step 5: Check current state before progression
function checkCurrentState(programId, patientId) {
  console.log('📊 Step 5: Current state BEFORE progression...\n');

  const cycle = periodizationService.getCurrentCycle(programId);
  const exercises = db.prepare('SELECT * FROM program_exercises WHERE program_id = ?').all(programId);

  console.log(`Current Cycle:`);
  console.log(`  Block Type: ${cycle.block_type}`);
  console.log(`  Block Number: ${cycle.block_number}`);
  console.log(`  Current Week: ${cycle.current_week} / ${cycle.total_weeks}`);
  console.log(`  Intensity: ${cycle.intensity_multiplier}x\n`);

  console.log(`Current Exercise Prescriptions:`);
  exercises.forEach(ex => {
    console.log(`  ${ex.exercise_name}: ${ex.sets}x${ex.reps} (baseline: ${ex.baseline_sets}x${ex.baseline_reps})`);
  });
  console.log();

  // Show metrics for first exercise
  const firstExercise = exercises[0];
  const metrics = periodizationService.getWeeklyMetrics(firstExercise.id, patientId);

  console.log(`Weekly Metrics for ${firstExercise.exercise_name}:`);
  console.log(`  Avg RPE: ${metrics.avgRpe.toFixed(1)}/10`);
  console.log(`  Avg Exercise Pain: ${metrics.avgExercisePain.toFixed(1)}/10`);
  console.log(`  Adherence: ${(metrics.adherence * 100).toFixed(0)}%`);
  console.log(`  Completion Rate: ${(metrics.completionRate * 100).toFixed(0)}%`);
  console.log(`  Avg Overall Feeling: ${metrics.avgOverallFeeling.toFixed(1)}/5`);
  console.log(`  Avg General Pain: ${metrics.avgGeneralPain.toFixed(1)}/10`);
  console.log();
}

// Step 6: Trigger progression
function triggerProgression(programId) {
  console.log('⚡ Step 6: Triggering weekly progression...\n');

  try {
    const result = periodizationService.progressProgram(programId);

    console.log(`✅ Progression completed successfully!\n`);
    console.log(`Results:`);
    console.log(`  Previous Week: ${result.currentWeek}`);
    console.log(`  New Week: ${result.nextWeek}`);
    console.log(`  Block Type: ${result.blockType}`);
    console.log(`  Block Number: ${result.blockNumber}\n`);

    if (result.adjustments.length > 0) {
      console.log(`Adjustments Made (${result.adjustments.length}):`);
      result.adjustments.forEach(adj => {
        console.log(`  ${adj.exerciseName}:`);
        console.log(`    ${adj.previousSets}x${adj.previousReps} → ${adj.newSets}x${adj.newReps}`);
        console.log(`    Reason: ${adj.reason}`);
        console.log(`    Metrics: RPE ${adj.metrics.avgRpe.toFixed(1)}, Pain ${adj.metrics.avgExercisePain.toFixed(1)}, Adherence ${(adj.metrics.adherence * 100).toFixed(0)}%`);
        console.log();
      });
    } else {
      console.log(`No adjustments needed - maintaining current levels`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Progression failed:`, error.message);
    throw error;
  }
}

// Step 7: Show final state
function checkFinalState(programId) {
  console.log('📊 Step 7: Final state AFTER progression...\n');

  const cycle = periodizationService.getCurrentCycle(programId);
  const exercises = db.prepare('SELECT * FROM program_exercises WHERE program_id = ?').all(programId);

  console.log(`Updated Cycle:`);
  console.log(`  Block Type: ${cycle.block_type}`);
  console.log(`  Block Number: ${cycle.block_number}`);
  console.log(`  Current Week: ${cycle.current_week} / ${cycle.total_weeks}`);
  console.log(`  Intensity: ${cycle.intensity_multiplier}x\n`);

  console.log(`Updated Exercise Prescriptions:`);
  exercises.forEach(ex => {
    console.log(`  ${ex.exercise_name}: ${ex.sets}x${ex.reps} (baseline: ${ex.baseline_sets}x${ex.baseline_reps})`);
  });
  console.log();

  // Show progression history
  const history = periodizationService.getProgressionHistory(programId, 5);
  if (history.length > 0) {
    console.log(`Recent Progression History:`);
    history.forEach(entry => {
      console.log(`  ${entry.adjustedAt.split('T')[0]} - ${entry.exerciseName}:`);
      console.log(`    ${entry.previousSets}x${entry.previousReps} → ${entry.newSets}x${entry.newReps}`);
      console.log(`    ${entry.adjustmentReason}`);
    });
  }
}

// Main test function
async function runTest() {
  try {
    cleanup();

    const patientId = createTestPatient();
    const programId = createTestProgram(patientId);

    simulateDailyCheckIns(patientId);
    simulateExerciseCompletions(programId, patientId);

    checkCurrentState(programId, patientId);
    triggerProgression(programId);
    checkFinalState(programId);

    console.log('\n✅ TEST COMPLETED SUCCESSFULLY!\n');
    console.log('🎉 The auto periodization system is working!\n');
    console.log('Next steps:');
    console.log('  1. Login as clinician');
    console.log('  2. View the test patient');
    console.log('  3. Click the ⚡ button to trigger another progression');
    console.log('  4. See the block progress banner as a patient\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.error(error.stack);
  }
}

// Run the test
runTest();
