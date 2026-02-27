// PostgreSQL Database Connection Pool
const { Pool } = require('pg');

// Build pool config: Cloud SQL Unix socket (GCP) or DATABASE_URL (local/other)
function getPoolConfig() {
  const base = {
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
    statement_timeout: 15000,
  };

  if (process.env.INSTANCE_CONNECTION_NAME) {
    // Cloud Run + Cloud SQL: connect via Unix socket
    return {
      ...base,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
    };
  }

  // Local dev or other hosts: use DATABASE_URL
  return {
    ...base,
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool(getPoolConfig());

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err);
});

// Helper function for single query
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Query executed', { text: text.substring(0, 50), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Query error:', { text: text.substring(0, 100), error: error.message });
    throw error;
  }
};

// Helper for getting a single row
const getOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

// Helper for getting multiple rows
const getAll = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

// Helper for INSERT/UPDATE/DELETE that returns affected row count
const run = async (text, params) => {
  const result = await query(text, params);
  return {
    rowCount: result.rowCount,
    rows: result.rows
  };
};

// Get a client from the pool for transactions
const getClient = async () => {
  return await pool.connect();
};

module.exports = {
  pool,
  query,
  getOne,
  getAll,
  run,
  getClient
};
