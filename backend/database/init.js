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
        prescribed_weight REAL DEFAULT 0,
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
        weight_performed REAL,
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

    // Education modules table
    await db.query(`
      CREATE TABLE IF NOT EXISTS education_modules (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        category VARCHAR(100),
        estimated_duration_minutes INTEGER,
        image_url TEXT,
        video_url TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Patient education modules table (assignments)
    await db.query(`
      CREATE TABLE IF NOT EXISTS patient_education_modules (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_id INTEGER NOT NULL REFERENCES education_modules(id) ON DELETE CASCADE,
        assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
        viewed BOOLEAN DEFAULT FALSE,
        viewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(patient_id, module_id)
      )
    `);

    // Password reset tokens table
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ===== BLOCK-BASED PERIODIZATION TABLES =====

    // One block per program (active)
    await db.query(`
      CREATE TABLE IF NOT EXISTS block_schedules (
        id                SERIAL PRIMARY KEY,
        program_id        INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        block_duration    INTEGER NOT NULL CHECK(block_duration IN (4, 6, 8)),
        start_date        DATE NOT NULL,
        current_week      INTEGER NOT NULL DEFAULT 1,
        status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','paused')),
        last_evaluated_at TIMESTAMP,
        created_at        TIMESTAMP DEFAULT NOW(),
        updated_at        TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_block_schedules_active
      ON block_schedules(program_id) WHERE status = 'active'
    `);

    // Per-exercise, per-week prescription cells
    await db.query(`
      CREATE TABLE IF NOT EXISTS exercise_block_weeks (
        id                  SERIAL PRIMARY KEY,
        block_schedule_id   INTEGER NOT NULL REFERENCES block_schedules(id) ON DELETE CASCADE,
        program_exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
        week_number         INTEGER NOT NULL CHECK(week_number BETWEEN 1 AND 8),
        sets                INTEGER NOT NULL,
        reps                INTEGER NOT NULL,
        rpe_target          INTEGER CHECK(rpe_target BETWEEN 1 AND 10),
        weight              REAL,
        notes               TEXT,
        overridden_by       INTEGER REFERENCES users(id),
        overridden_at       TIMESTAMP,
        created_at          TIMESTAMP DEFAULT NOW(),
        UNIQUE(block_schedule_id, program_exercise_id, week_number)
      )
    `);

    // Saved periodization templates
    await db.query(`
      CREATE TABLE IF NOT EXISTS periodization_templates (
        id             SERIAL PRIMARY KEY,
        name           TEXT NOT NULL,
        description    TEXT,
        block_duration INTEGER NOT NULL CHECK(block_duration IN (4, 6, 8)),
        created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_global      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `);

    // Week structure per template (single-exercise progression pattern)
    await db.query(`
      CREATE TABLE IF NOT EXISTS template_weeks (
        id            SERIAL PRIMARY KEY,
        template_id   INTEGER NOT NULL REFERENCES periodization_templates(id) ON DELETE CASCADE,
        week_number   INTEGER NOT NULL CHECK(week_number BETWEEN 1 AND 8),
        sets          INTEGER NOT NULL,
        reps          INTEGER NOT NULL,
        rpe_target    INTEGER CHECK(rpe_target BETWEEN 1 AND 10),
        notes         TEXT,
        UNIQUE(template_id, week_number)
      )
    `);

    // Migration: drop exercise_slot if it exists (templates are now single-exercise progressions)
    await db.query(`ALTER TABLE template_weeks DROP COLUMN IF EXISTS exercise_slot`);
    await db.query(`ALTER TABLE template_weeks DROP CONSTRAINT IF EXISTS template_weeks_template_id_exercise_slot_week_number_key`);
    await db.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'template_weeks_template_id_week_number_key') THEN
          ALTER TABLE template_weeks ADD CONSTRAINT template_weeks_template_id_week_number_key UNIQUE(template_id, week_number);
        END IF;
      END $$
    `);

    // Clinician alert flags
    await db.query(`
      CREATE TABLE IF NOT EXISTS clinician_flags (
        id          SERIAL PRIMARY KEY,
        program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        patient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        flag_type   TEXT NOT NULL CHECK(flag_type IN ('pain_flare','performance_hold','block_complete')),
        flag_reason TEXT NOT NULL,
        flag_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        resolved    BOOLEAN NOT NULL DEFAULT FALSE,
        resolved_at TIMESTAMP,
        resolved_by INTEGER REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_clinician_flags_unresolved
      ON clinician_flags(resolved) WHERE resolved = FALSE
    `);

    // Add clinician_id to programs for flag querying
    await db.query(`
      ALTER TABLE programs ADD COLUMN IF NOT EXISTS clinician_id INTEGER REFERENCES users(id)
    `);

    // Clinician-patient ownership junction table
    await db.query(`
      CREATE TABLE IF NOT EXISTS clinician_patients (
        id SERIAL PRIMARY KEY,
        clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(clinician_id, patient_id)
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_clinician_patients_clinician
      ON clinician_patients(clinician_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_clinician_patients_patient
      ON clinician_patients(patient_id)
    `);

    // Audit logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id INTEGER,
        details JSONB,
        ip_address INET,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
      ON audit_logs(user_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
      ON audit_logs(created_at)
    `);

    // Exercise favorites table (for favoriting both custom and default exercises)
    await db.query(`
      CREATE TABLE IF NOT EXISTS exercise_favorites (
        id SERIAL PRIMARY KEY,
        clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exercise_id INTEGER NOT NULL,
        exercise_type TEXT NOT NULL CHECK(exercise_type IN ('custom', 'default')),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(clinician_id, exercise_id, exercise_type)
      )
    `);

    // Add clinician_id to invitation_tokens for tracking who invited
    await db.query(`
      ALTER TABLE invitation_tokens
      ADD COLUMN IF NOT EXISTS clinician_id INTEGER REFERENCES users(id)
    `);

    // Add weight columns to existing tables (migration for deployed DB)
    console.log('🔄 Running database migrations...');
    await db.query(`
      ALTER TABLE program_exercises
      ADD COLUMN IF NOT EXISTS prescribed_weight REAL DEFAULT 0
    `);
    await db.query(`
      ALTER TABLE exercise_completions
      ADD COLUMN IF NOT EXISTS weight_performed REAL
    `);

    // Add weight progression columns to templates
    await db.query(`
      ALTER TABLE periodization_templates
      ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT NULL CHECK(weight_unit IN ('kg', 'percent'))
    `);
    await db.query(`
      ALTER TABLE template_weeks
      ADD COLUMN IF NOT EXISTS weight_offset REAL
    `);

    // Add filter metadata columns to exercises table
    console.log('🔄 Adding exercise filter columns...');
    await db.query(`
      ALTER TABLE exercises
      ADD COLUMN IF NOT EXISTS joint_area TEXT,
      ADD COLUMN IF NOT EXISTS muscle_group TEXT,
      ADD COLUMN IF NOT EXISTS movement_type TEXT,
      ADD COLUMN IF NOT EXISTS equipment TEXT,
      ADD COLUMN IF NOT EXISTS position TEXT
    `);

    // Fix legacy start_date values ('today', 'tomorrow', etc.) by converting to created_at date
    console.log('🔄 Fixing legacy start_date values...');
    await db.query(`
      UPDATE programs
      SET start_date = TO_CHAR(created_at, 'YYYY-MM-DD')
      WHERE start_date IN ('today', 'tomorrow', 'nextweek')
         OR start_date IS NULL
         OR start_date = ''
    `);

    // Create indexes for performance (IF NOT EXISTS for idempotency)
    console.log('🔄 Creating performance indexes...');

    // exercise_completions indexes - heavily queried for analytics
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_completions_exercise_id
      ON exercise_completions(exercise_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_completions_patient_id
      ON exercise_completions(patient_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_completions_date
      ON exercise_completions(completion_date)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_completions_patient_date
      ON exercise_completions(patient_id, completion_date)
    `);

    // programs index - queried by patient
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_programs_patient_id
      ON programs(patient_id)
    `);

    // program_exercises index - queried by program
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_program_exercises_program_id
      ON program_exercises(program_id)
    `);

    // daily_check_ins indexes - queried for analytics
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_check_ins_patient_id
      ON daily_check_ins(patient_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_check_ins_patient_date
      ON daily_check_ins(patient_id, check_in_date)
    `);

    // periodization_cycles index
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_periodization_cycles_program_id
      ON periodization_cycles(program_id)
    `);

    // exercise_progression_log indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_progression_log_program_id
      ON exercise_progression_log(program_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_progression_log_exercise_id
      ON exercise_progression_log(exercise_id)
    `);

    // exercise_favorites indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_favorites_clinician_id
      ON exercise_favorites(clinician_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_favorites_exercise_lookup
      ON exercise_favorites(clinician_id, exercise_id, exercise_type)
    `);

    // exercises filter indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_exercises_joint_area
      ON exercises(joint_area)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group
      ON exercises(muscle_group)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_exercises_equipment
      ON exercises(equipment)
    `);

    console.log('✅ Database indexes created');
    console.log('✅ Database migrations complete');

    // Backfill clinician_patients from existing programs data
    console.log('🔄 Backfilling clinician_patients...');
    const cpCount = await db.getOne('SELECT COUNT(*) as count FROM clinician_patients');
    if (cpCount && parseInt(cpCount.count) === 0) {
      // Try to populate from programs.clinician_id
      const programLinks = await db.getAll(`
        SELECT DISTINCT clinician_id, patient_id FROM programs
        WHERE clinician_id IS NOT NULL
      `);
      if (programLinks && programLinks.length > 0) {
        for (const link of programLinks) {
          await db.query(
            `INSERT INTO clinician_patients (clinician_id, patient_id)
             VALUES ($1, $2)
             ON CONFLICT (clinician_id, patient_id) DO NOTHING`,
            [link.clinician_id, link.patient_id]
          );
        }
        console.log(`✅ Backfilled ${programLinks.length} clinician-patient relationships from programs`);
      } else {
        // Fallback: assign all patients to the first clinician
        const firstClinician = await db.getOne(
          "SELECT id FROM users WHERE role = 'clinician' ORDER BY id ASC LIMIT 1"
        );
        if (firstClinician) {
          const patients = await db.getAll(
            "SELECT id FROM users WHERE role = 'patient'"
          );
          for (const patient of patients) {
            await db.query(
              `INSERT INTO clinician_patients (clinician_id, patient_id)
               VALUES ($1, $2)
               ON CONFLICT (clinician_id, patient_id) DO NOTHING`,
              [firstClinician.id, patient.id]
            );
          }
          console.log(`✅ Backfilled ${patients.length} patients to clinician ${firstClinician.id}`);
        }
      }
    }

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

module.exports = { initDatabase };
