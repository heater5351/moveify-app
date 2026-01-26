// Migration script to allow NULL password_hash
const db = require('./db');

console.log('Starting database migration...');

try {
  // Check if users table exists and has the old schema
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();
  const passwordHashColumn = tableInfo.find(col => col.name === 'password_hash');

  if (passwordHashColumn && passwordHashColumn.notnull === 1) {
    console.log('⚠️  Old schema detected. Migrating users table...');

    // SQLite doesn't support ALTER COLUMN, so we need to:
    // 1. Rename old table
    // 2. Create new table with correct schema
    // 3. Copy data
    // 4. Drop old table

    db.exec(`
      -- Rename old table
      ALTER TABLE users RENAME TO users_old;

      -- Create new table with correct schema
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL CHECK(role IN ('clinician', 'patient')),
        name TEXT NOT NULL,
        dob TEXT,
        phone TEXT,
        address TEXT,
        condition TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Copy existing data
      INSERT INTO users (id, email, password_hash, role, name, dob, phone, address, condition, created_at)
      SELECT id, email, password_hash, role, name, dob, phone, address, condition, created_at
      FROM users_old;

      -- Drop old table
      DROP TABLE users_old;
    `);

    console.log('✅ Migration completed successfully!');
  } else {
    console.log('✅ Schema is already correct. No migration needed.');
  }
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
