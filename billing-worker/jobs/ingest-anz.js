'use strict';

const crypto = require('crypto');
const { upsertBankTransaction, appendReconciliationFlag, getTab } = require('../services/sheets');
const { getStripe } = require('../services/stripe');
const { logger } = require('../lib/logger');

function hashRow(date, amount, description) {
  return crypto.createHash('sha256').update(`${date}|${amount}|${description}`).digest('hex').slice(0, 16);
}

function parseAnzCsv(csvText) {
  const lines = csvText.trim().split('\n');
  const rows = [];
  // ANZ CSV format: Date,Amount,Description (skip header if present)
  const start = lines[0].toLowerCase().includes('date') ? 1 : 0;
  for (const line of lines.slice(start)) {
    const [date, amount, ...descParts] = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (!date || !amount) continue;
    rows.push({ date, amount, description: descParts.join(' ') });
  }
  return rows;
}

async function applyBankRules(transaction, rules) {
  const desc = transaction.description.toLowerCase();
  for (const rule of rules) {
    if (!rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, 'i');
      if (re.test(desc)) {
        return { type: rule.type, gl_code: rule.gl_code };
      }
    } catch (_) {
      // invalid regex in rules sheet — skip
    }
  }
  return { type: 'unmatched', gl_code: '' };
}

async function reconcileStripePayouts(transactions, log) {
  const stripeRows = transactions.filter((t) => /stripe payment/i.test(t.description));
  if (stripeRows.length === 0) return;

  const stripe = await getStripe();

  for (const tx of stripeRows) {
    // Match ANZ deposit → Stripe payout by amount and approximate date
    const payouts = await stripe.payouts.list({ limit: 10 });
    const txAmount = Math.round(Math.abs(parseFloat(tx.amount)) * 100);
    const match = payouts.data.find((p) => p.amount === txAmount);

    if (!match) {
      await appendReconciliationFlag({
        id: `anz-stripe:${tx.hash}`,
        type: 'stripe_payout_unmatched',
        entity_id: tx.hash,
        cliniko_state: '',
        ledger_state: `ANZ deposit $${tx.amount} on ${tx.date}`,
        diff: 'No matching Stripe payout found',
        resolved_at: '',
        resolution: '',
        notes: '',
        created_at: new Date().toISOString(),
      });
      log.warn({ hash: tx.hash }, 'No matching Stripe payout for ANZ deposit');
    } else {
      log.info({ hash: tx.hash, payout_id: match.id }, 'Matched ANZ deposit → Stripe payout');
    }
  }
}

async function ingestAnzCsv(csvText, log = logger) {
  const rows = parseAnzCsv(csvText);
  const rules = await getTab('BankRules');
  let ingested = 0;
  let duplicates = 0;
  const processed = [];

  for (const row of rows) {
    const hash = hashRow(row.date, row.amount, row.description);
    const { type, gl_code } = await applyBankRules(row, rules);

    const result = await upsertBankTransaction({
      hash,
      date: row.date,
      amount: row.amount,
      description: row.description,
      reconciled: type !== 'unmatched' ? 'true' : 'false',
      gl_code,
      ingested_at: new Date().toISOString(),
    });

    processed.push({ ...row, hash, type });
    if (type !== 'unmatched') ingested++;
    else duplicates++;
  }

  await reconcileStripePayouts(processed, log);

  log.info({ total: rows.length, matched: ingested, unmatched: duplicates }, 'ANZ CSV ingestion complete');
  return { total: rows.length, matched: ingested, unmatched: duplicates };
}

module.exports = { ingestAnzCsv };
