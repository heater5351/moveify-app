'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');
const { logger } = require('../lib/logger');

let initialised = false;

async function initBillingDb() {
  if (initialised) return;
  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  await pool.query(sql);
  initialised = true;
  logger.info('billing-db schema applied');
}

module.exports = { initBillingDb };
