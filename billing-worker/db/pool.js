'use strict';

// PostgreSQL pool for the billing-worker. Connects to the `billing` logical DB
// inside the shared moveify-db Cloud SQL instance via the same Unix-socket
// pattern as the patient app backend. Local dev falls back to BILLING_DATABASE_URL.

const { Pool } = require('pg');
const { logger } = require('../lib/logger');

function getPoolConfig() {
  const base = {
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
    statement_timeout: 15000,
  };

  if (process.env.INSTANCE_CONNECTION_NAME) {
    return {
      ...base,
      user: process.env.BILLING_DB_USER,
      password: process.env.BILLING_DB_PASSWORD,
      database: process.env.BILLING_DB_NAME || 'billing',
      host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
    };
  }

  return {
    ...base,
    connectionString: process.env.BILLING_DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  };
}

const pool = new Pool(getPoolConfig());

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

pool.on('error', (err) => {
  consecutiveErrors++;
  logger.error({ err: err.message, count: consecutiveErrors }, 'billing pg pool error');
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    logger.error('Too many consecutive billing DB errors — exiting for container restart');
    process.exit(1);
  }
});

pool.on('connect', () => {
  if (consecutiveErrors > 0) logger.info('billing pg pool recovered');
  consecutiveErrors = 0;
});

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (process.env.NODE_ENV === 'development') {
      logger.debug({ text: text.substring(0, 60), ms: Date.now() - start, rows: result.rowCount }, 'pg query');
    }
    return result;
  } catch (err) {
    logger.error({ text: text.substring(0, 100), err: err.message }, 'pg query error');
    throw err;
  }
}

async function getOne(text, params) {
  const r = await query(text, params);
  return r.rows[0] || null;
}

async function getAll(text, params) {
  const r = await query(text, params);
  return r.rows;
}

async function run(text, params) {
  const r = await query(text, params);
  return { rowCount: r.rowCount, rows: r.rows };
}

async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getOne, getAll, run, getClient };
