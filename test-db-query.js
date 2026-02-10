// Test the actual database query
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testQuery() {
  try {
    console.log('Testing database query...');
    
    // First, check if there are any completions
    const allCompletions = await pool.query('SELECT COUNT(*) FROM exercise_completions');
    console.log('Total completions in DB:', allCompletions.rows[0].count);
    
    // Test the actual query from the endpoint
    const patientId = 1;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    console.log('Query parameters:', { patientId, startDateStr });
    
    const result = await pool.query(`
      SELECT
        ec.id,
        pe.exercise_name as "exerciseName",
        ec.completion_date as "completionDate",
        ec.sets_performed as "setsPerformed",
        ec.reps_performed as "repsPerformed",
        pe.sets as "prescribedSets",
        pe.reps as "prescribedReps",
        ec.rpe_rating as "rpeRating",
        ec.pain_level as "painLevel",
        ec.notes
      FROM exercise_completions ec
      JOIN program_exercises pe ON ec.exercise_id = pe.id
      WHERE ec.patient_id = $1
        AND ec.completion_date >= $2
      ORDER BY ec.completion_date DESC, ec.completed_at DESC
    `, [patientId, startDateStr]);
    
    console.log('Query result:', result.rows);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

testQuery();
