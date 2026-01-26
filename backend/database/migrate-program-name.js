// Migration script to add name column to programs table
const db = require('./db');

console.log('Starting program name migration...');

try {
  // Check if programs table exists and if it has name column
  const tableInfo = db.prepare("PRAGMA table_info(programs)").all();
  const nameColumn = tableInfo.find(col => col.name === 'name');

  if (!nameColumn) {
    console.log('⚠️  Name column missing. Adding to programs table...');

    // Add name column with a default value for existing programs
    db.exec(`
      ALTER TABLE programs ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled Program';
    `);

    // Update existing programs to have more descriptive names
    const existingPrograms = db.prepare('SELECT id, patient_id FROM programs').all();

    existingPrograms.forEach((program, index) => {
      const patientName = db.prepare('SELECT name FROM users WHERE id = ?').get(program.patient_id)?.name || 'Unknown';
      const programName = `${patientName}'s Program ${index + 1}`;
      db.prepare('UPDATE programs SET name = ? WHERE id = ?').run(programName, program.id);
    });

    console.log(`✅ Migration completed! Updated ${existingPrograms.length} existing programs.`);
  } else {
    console.log('✅ Name column already exists. No migration needed.');
  }
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
