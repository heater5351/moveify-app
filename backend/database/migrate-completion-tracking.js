// Migration script to add completion tracking fields
const db = require('./db');

function migrateCompletionTracking() {
  console.log('🔄 Starting completion tracking migration...');

  try {
    // Add columns to exercise_completions table
    console.log('  Adding columns to exercise_completions table...');
    db.exec(`
      ALTER TABLE exercise_completions ADD COLUMN sets_performed INTEGER;
    `);
    db.exec(`
      ALTER TABLE exercise_completions ADD COLUMN reps_performed INTEGER;
    `);
    db.exec(`
      ALTER TABLE exercise_completions ADD COLUMN rpe_rating INTEGER CHECK(rpe_rating BETWEEN 1 AND 10);
    `);
    db.exec(`
      ALTER TABLE exercise_completions ADD COLUMN pain_level INTEGER CHECK(pain_level BETWEEN 0 AND 10);
    `);
    db.exec(`
      ALTER TABLE exercise_completions ADD COLUMN notes TEXT;
    `);

    // Add columns to programs table
    console.log('  Adding columns to programs table...');
    db.exec(`
      ALTER TABLE programs ADD COLUMN track_actual_performance BOOLEAN DEFAULT 1;
    `);
    db.exec(`
      ALTER TABLE programs ADD COLUMN track_rpe BOOLEAN DEFAULT 0;
    `);
    db.exec(`
      ALTER TABLE programs ADD COLUMN track_pain BOOLEAN DEFAULT 0;
    `);

    console.log('✅ Completion tracking migration complete');
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('⚠️  Migration already applied (columns exist)');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }
}

// Run if executed directly
if (require.main === module) {
  migrateCompletionTracking();
  process.exit(0);
}

module.exports = { migrateCompletionTracking };
