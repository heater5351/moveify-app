'use strict';

// Idempotency keys live in the billing-db `idempotency_keys` table.
// Keys older than EXPIRY_DAYS are treated as expired (returns false on check).
// A separate sweep should DELETE expired rows periodically — for now they
// accumulate harmlessly since the table is keyed and small.

const { checkIdempotencyKey, markIdempotencyKey } = require('../services/billing-db');
const { logger } = require('./logger');

async function check(key) {
  try {
    return await checkIdempotencyKey(key);
  } catch (err) {
    logger.error({ key, err: err.message }, 'Idempotency check failed — failing closed');
    throw new Error(`Idempotency check failed for ${key}: ${err.message}`);
  }
}

async function mark(key) {
  await markIdempotencyKey(key);
}

module.exports = { check, mark };
