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
        weight_unit    TEXT DEFAULT NULL CHECK(weight_unit IN ('kg', 'percent')),
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
        weight_offset REAL,
        UNIQUE(template_id, week_number)
      )
    `);

    // Ensure weight columns exist on template tables (for DBs created before these columns were added)
    await db.query(`
      ALTER TABLE periodization_templates
      ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT NULL CHECK(weight_unit IN ('kg', 'percent'))
    `);
    await db.query(`
      ALTER TABLE template_weeks
      ADD COLUMN IF NOT EXISTS weight_offset REAL
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

    // Add is_admin flag to users table
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE
    `);

    // Add health data consent columns to users table
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS health_data_consent BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS health_data_consent_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS consent_version TEXT
    `);

    // Program templates (reusable exercise lists)
    await db.query(`
      CREATE TABLE IF NOT EXISTS program_templates (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS program_template_exercises (
        id                SERIAL PRIMARY KEY,
        template_id       INTEGER NOT NULL REFERENCES program_templates(id) ON DELETE CASCADE,
        exercise_name     TEXT NOT NULL,
        exercise_category TEXT,
        sets              INTEGER NOT NULL,
        reps              INTEGER NOT NULL,
        prescribed_weight REAL DEFAULT 0,
        hold_time         TEXT,
        instructions      TEXT,
        image_url         TEXT,
        exercise_order    INTEGER DEFAULT 0
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_program_template_exercises_tid
      ON program_template_exercises(template_id)
    `);

    // Locations table
    await db.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Add default_location_id to users
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS default_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL
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

    // Duration-based exercise support + rest duration
    console.log('🔄 Adding duration/rest columns...');
    await db.query(`ALTER TABLE program_exercises ADD COLUMN IF NOT EXISTS prescribed_duration INTEGER`);
    await db.query(`ALTER TABLE program_exercises ADD COLUMN IF NOT EXISTS rest_duration INTEGER`);
    await db.query(`ALTER TABLE exercise_completions ADD COLUMN IF NOT EXISTS duration_performed INTEGER`);
    await db.query(`ALTER TABLE exercises ADD COLUMN IF NOT EXISTS exercise_type TEXT DEFAULT 'reps'`);
    await db.query(`ALTER TABLE program_template_exercises ADD COLUMN IF NOT EXISTS prescribed_duration INTEGER`);
    await db.query(`ALTER TABLE program_template_exercises ADD COLUMN IF NOT EXISTS rest_duration INTEGER`);

    // Duration & rest progression in block periodization
    console.log('🔄 Adding duration/rest to block periodization tables...');
    await db.query(`ALTER TABLE exercise_block_weeks ADD COLUMN IF NOT EXISTS duration INTEGER`);
    await db.query(`ALTER TABLE exercise_block_weeks ADD COLUMN IF NOT EXISTS rest_duration INTEGER`);
    await db.query(`ALTER TABLE template_weeks ADD COLUMN IF NOT EXISTS duration INTEGER`);
    await db.query(`ALTER TABLE template_weeks ADD COLUMN IF NOT EXISTS rest_duration INTEGER`);

    // Warm-up section flag
    await db.query(`ALTER TABLE program_exercises ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN DEFAULT FALSE`);
    await db.query(`ALTER TABLE program_template_exercises ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN DEFAULT FALSE`);

    // data_requests — patient data export/deletion requests (APP 12, APP 13)
    await db.query(`
      CREATE TABLE IF NOT EXISTS data_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        request_type TEXT NOT NULL CHECK(request_type IN ('export', 'deletion')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'completed', 'denied')),
        admin_notes TEXT,
        processed_by INTEGER REFERENCES users(id),
        requested_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_data_requests_user_id
      ON data_requests(user_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_data_requests_status
      ON data_requests(status)
    `);

    // block_schedules general index (partial index only covers active status)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_block_schedules_program_id
      ON block_schedules(program_id)
    `);

    // AI usage log (token tracking, rate limiting)
    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_log (
        id SERIAL PRIMARY KEY,
        clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        model TEXT NOT NULL,
        request_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_log_clinician_date
      ON ai_usage_log(clinician_id, created_at)
    `);

    // Clinician protocols (injected into AI system prompt)
    await db.query(`
      CREATE TABLE IF NOT EXISTS clinician_protocols (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_global BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_clinician_protocols_created_by
      ON clinician_protocols(created_by)
    `);

    // Fix education_modules.created_by FK to allow clinician deletion
    await db.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'education_modules_created_by_fkey'
          AND table_name = 'education_modules'
        ) THEN
          ALTER TABLE education_modules DROP CONSTRAINT education_modules_created_by_fkey;
          ALTER TABLE education_modules ADD CONSTRAINT education_modules_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    console.log('✅ Database indexes created');
    console.log('✅ Database migrations complete');

    // Backfill: ensure first clinician is admin
    // Bug reports table
    await db.query(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        category TEXT NOT NULL CHECK(category IN ('bug', 'feature', 'other')),
        description TEXT NOT NULL,
        page TEXT,
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'reviewed', 'resolved')),
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('🔄 Checking admin backfill...');
    const adminCount = await db.getOne("SELECT COUNT(*) as count FROM users WHERE role = 'clinician' AND is_admin = TRUE");
    if (adminCount && parseInt(adminCount.count) === 0) {
      const firstClinician = await db.getOne(
        "SELECT id FROM users WHERE role = 'clinician' ORDER BY id ASC LIMIT 1"
      );
      if (firstClinician) {
        await db.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [firstClinician.id]);
        console.log(`✅ Set clinician ${firstClinician.id} as admin`);
      }
    }

    // ===== SCRIBE TABLES =====
    console.log('🔄 Initializing Scribe tables...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS scribe_sessions (
        id SERIAL PRIMARY KEY,
        clinician_id INTEGER NOT NULL REFERENCES users(id),
        patient_id INTEGER NOT NULL REFERENCES users(id),
        patient_name_enc TEXT NOT NULL,
        session_date DATE NOT NULL DEFAULT CURRENT_DATE,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'recording'
          CHECK(status IN ('recording','transcribing','generating','review','completed','discarded')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scribe_sessions_clinician ON scribe_sessions(clinician_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scribe_sessions_patient ON scribe_sessions(patient_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scribe_sessions_date ON scribe_sessions(session_date)`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES scribe_sessions(id) ON DELETE CASCADE,
        content_enc TEXT NOT NULL,
        word_count INTEGER,
        duration_secs INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_id)`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS soap_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        discipline TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS soap_notes (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES scribe_sessions(id) ON DELETE CASCADE,
        subjective_enc TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        generated_by TEXT NOT NULL DEFAULT 'llm' CHECK(generated_by IN ('llm','manual')),
        llm_model TEXT,
        template_id INTEGER REFERENCES soap_templates(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_soap_notes_session ON soap_notes(session_id)`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS soap_note_versions (
        id SERIAL PRIMARY KEY,
        soap_note_id INTEGER NOT NULL REFERENCES soap_notes(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        subjective_enc TEXT,
        edited_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS clinician_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        system_prompt_enc TEXT NOT NULL,
        discipline TEXT NOT NULL DEFAULT 'exercise_physiology',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        system_prompt_enc TEXT NOT NULL,
        discipline TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_prompt_versions_user ON prompt_versions(user_id)`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS patient_summaries (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES users(id),
        summary_enc TEXT NOT NULL,
        session_count INTEGER NOT NULL DEFAULT 1,
        last_session_id INTEGER REFERENCES scribe_sessions(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(patient_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_patient_summaries_patient ON patient_summaries(patient_id)`);

    // Seed default SOAP template (exercise physiology)
    await db.query(`
      INSERT INTO soap_templates (name, discipline, system_prompt, is_default)
      SELECT 'Exercise Physiology — Standard', 'exercise_physiology', $1, true
      WHERE NOT EXISTS (SELECT 1 FROM soap_templates WHERE is_default = true)
    `, [`You are an experienced clinical exercise physiologist scribe. Given a transcript of a patient consultation, generate a structured SOAP note following Australian allied health clinical standards.

Subjective
- Patient's reported symptoms, history of present condition, pain descriptions, functional limitations, goals, and relevant psychosocial factors.

Objective
- Clinical findings mentioned: range of motion, strength assessments, functional tests, movement quality observations, vitals if mentioned, any outcome measures discussed.

Assessment
- Clinical reasoning, working diagnosis/impression, progress since last session, contributing factors, prognosis.

Plan
- Treatment provided today, exercise prescription changes, home exercise program updates, follow-up schedule, referrals, patient education provided.

Use bullet points within each section. Be concise but thorough. Do not fabricate information not present in the transcript.`]);

    // Report templates
    await db.query(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('cdmp')),
        name TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const cdmpPrompt = `You are an Accredited Exercise Physiologist writing a formal clinical report to a referring GP under a Chronic Disease Management (CDM) Plan.
Given a SOAP note from a patient consultation, extract and write exactly four sections.

EXECUTIVE SUMMARY
A concise 2-3 sentence narrative covering: the patient's referred conditions, what was assessed at this initial consultation, and the key findings. Professional clinical tone. Example opening: "[Patient name] attended Moveify Health Solutions for an initial Exercise Physiology assessment under the Chronic Disease Management Plan, referred for the management of [conditions]. Assessment findings identified [key findings]."

OBJECTIVE ASSESSMENT
List objective clinical findings as individual lines in this exact format — one finding per line, using a pipe character to separate the three parts:
Test | Result | Interpretation
Only include findings explicitly mentioned in the note. Common items: height, weight, BMI, blood pressure, resting heart rate, 30-second sit-to-stand, timed up and go, grip strength, pain rating, physical activity level. If a test is not mentioned, omit it. Do not fabricate data.

GOALS
3-5 SMART goals established or implied during the consultation. One goal per line, starting with a dash. Ground these in the note content.

MANAGEMENT PLAN
2-4 sentences describing the exercise intervention plan: session frequency, duration, modalities (e.g., resistance training, aerobic conditioning), progression approach, home exercise program, and any referral recommendations. Base this entirely on the note content.

Output exactly the four headings (EXECUTIVE SUMMARY, OBJECTIVE ASSESSMENT, GOALS, MANAGEMENT PLAN) followed by their content. No markdown bold or italic formatting.`;

    await db.query(`UPDATE report_templates SET system_prompt = $1 WHERE type = 'cdmp' AND is_default = true`, [cdmpPrompt]);
    await db.query(`
      INSERT INTO report_templates (type, name, system_prompt, is_default)
      SELECT 'cdmp', 'CDMP GP Report', $1, true
      WHERE NOT EXISTS (SELECT 1 FROM report_templates WHERE type = 'cdmp' AND is_default = true)
    `, [cdmpPrompt]);

    console.log('✅ Scribe tables initialized');

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

module.exports = { initDatabase };
