// Initialize PostgreSQL database tables
const db = require('./db');

async function initDatabase() {
  console.log('🔄 Initializing database tables...');

  try {
    // Users table (for both clinicians and patients)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL CHECK(role IN ('clinician', 'patient')),
        name TEXT NOT NULL,
        dob TEXT,
        phone TEXT,
        address TEXT,
        condition TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Invitation tokens table
    await db.query(`
      CREATE TABLE IF NOT EXISTS invitation_tokens (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('clinician', 'patient')),
        name TEXT NOT NULL,
        dob TEXT,
        phone TEXT,
        address TEXT,
        condition TEXT,
        used INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Programs table (assigned to patients)
    await db.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        start_date TEXT,
        frequency TEXT,
        duration TEXT,
        custom_end_date TEXT,
        track_actual_performance BOOLEAN DEFAULT TRUE,
        track_rpe BOOLEAN DEFAULT FALSE,
        track_pain BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Program exercises table (exercises within a program)
    await db.query(`
      CREATE TABLE IF NOT EXISTS program_exercises (
        id SERIAL PRIMARY KEY,
        program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        exercise_name TEXT NOT NULL,
        exercise_category TEXT,
        sets INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        hold_time TEXT,
        instructions TEXT,
        image_url TEXT,
        completed INTEGER DEFAULT 0,
        exercise_order INTEGER DEFAULT 0,
        baseline_sets INTEGER,
        baseline_reps INTEGER,
        auto_adjust_enabled BOOLEAN DEFAULT TRUE,
        last_adjusted_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Exercise completions table (tracks daily completions)
    await db.query(`
      CREATE TABLE IF NOT EXISTS exercise_completions (
        id SERIAL PRIMARY KEY,
        exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        completion_date DATE NOT NULL,
        sets_performed INTEGER,
        reps_performed INTEGER,
        rpe_rating INTEGER CHECK(rpe_rating BETWEEN 1 AND 10),
        pain_level INTEGER CHECK(pain_level BETWEEN 0 AND 10),
        notes TEXT,
        completed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(exercise_id, patient_id, completion_date)
      )
    `);

    // Periodization cycles table (tracks blocks and weeks)
    await db.query(`
      CREATE TABLE IF NOT EXISTS periodization_cycles (
        id SERIAL PRIMARY KEY,
        program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        block_type TEXT NOT NULL CHECK(block_type IN ('introductory', 'standard')),
        block_number INTEGER NOT NULL DEFAULT 1,
        block_start_date DATE NOT NULL,
        current_week INTEGER NOT NULL,
        total_weeks INTEGER NOT NULL,
        intensity_multiplier REAL DEFAULT 1.0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Daily check-ins table (patient wellbeing tracking)
    await db.query(`
      CREATE TABLE IF NOT EXISTS daily_check_ins (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        check_in_date DATE NOT NULL,
        overall_feeling INTEGER NOT NULL CHECK(overall_feeling BETWEEN 1 AND 5),
        general_pain_level INTEGER CHECK(general_pain_level BETWEEN 0 AND 10),
        energy_level INTEGER CHECK(energy_level BETWEEN 1 AND 5),
        sleep_quality INTEGER CHECK(sleep_quality BETWEEN 1 AND 5),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(patient_id, check_in_date)
      )
    `);

    // Custom exercises library (per-clinician)
    await db.query(`
      CREATE TABLE IF NOT EXISTS exercises (
        id SERIAL PRIMARY KEY,
        clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        difficulty TEXT NOT NULL CHECK(difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
        duration TEXT NOT NULL,
        description TEXT NOT NULL,
        video_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Exercise progression log (audit trail of adjustments)
    await db.query(`
      CREATE TABLE IF NOT EXISTS exercise_progression_log (
        id SERIAL PRIMARY KEY,
        exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
        program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        previous_sets INTEGER,
        previous_reps INTEGER,
        new_sets INTEGER NOT NULL,
        new_reps INTEGER NOT NULL,
        adjustment_reason TEXT NOT NULL,
        avg_rpe REAL,
        avg_pain REAL,
        completion_rate REAL,
        week_in_cycle INTEGER,
        adjusted_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

module.exports = { initDatabase };
