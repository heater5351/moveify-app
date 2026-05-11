'use strict';

const { getSheets } = require('../services/sheets');
const { logger } = require('./logger');

const TAB = 'IdempotencyKeys';
const EXPIRY_DAYS = 60;

/**
 * Returns true if the key was already processed (and hasn't expired).
 */
async function check(key) {
  try {
    const sheets = await getSheets();
    const spreadsheetId = process.env.SHEETS_LEDGER_ID;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB}!A:B`,
    });

    const rows = res.data.values || [];
    const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    for (const [storedKey, storedTs] of rows) {
      if (storedKey === key) {
        const ts = parseInt(storedTs, 10);
        return ts > cutoff;
      }
    }
    return false;
  } catch (err) {
    logger.error({ key, err: err.message }, 'Idempotency check failed — failing closed');
    throw new Error(`Idempotency check failed for ${key}: ${err.message}`);
  }
}

/**
 * Marks the key as processed with the current timestamp.
 * Throws on failure — caller must treat this as a hard error, since a
 * silently-dropped mark means the next run will re-process the same row.
 */
async function mark(key) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${TAB}!A:B`,
    valueInputOption: 'RAW',
    requestBody: { values: [[key, Date.now().toString()]] },
  });
}

module.exports = { check, mark };
