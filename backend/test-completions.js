// Test the actual database query
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testQuery() {
  try {
    console.log('Testing database query...');
    
    // First, check if there are any completions
    const allCompletions = await pool.query('SELECT COUNT(*) FROM exercise_completions');
    console.log('Total completions in DB:', allCompletions.rows[0].count);
    
    if (allCompletions.rows[0].count > 0) {
      // Show some sample data
      const samples = await pool.query('SELECT * FROM exercise_completions LIMIT 3');
      console.log('Sample completions:', JSON.stringify(samples.rows, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

testQuery();
