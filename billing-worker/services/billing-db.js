'use strict';

// Postgres-backed state store for the billing worker. Schema lives in
// db/init.sql and is applied at startup by db/init.js. Replaces the
// pre-2026-05 Google Sheets ledger (now fully migrated; see CLAUDE.md).

const { query, getOne, getAll, run, pool } = require('../db/pool');

// Column lists (mirror Sheets TAB_HEADERS for parity + drive the upsert helper).
const COLUMNS = {
  contacts: ['cliniko_id', 'name', 'email', 'phone', 'dob', 'condition', 'medicare', 'medicare_reference', 'dva_card_number', 'phi_fund', 'phi_membership_number', 'updated_at'],
  invoices: ['cliniko_id', 'patient_id', 'status', 'total', 'type', 'created_at', 'updated_at'],
  appointments: ['cliniko_id', 'patient_id', 'practitioner_id', 'status', 'starts_at', 'updated_at'],
  payments: ['cliniko_id', 'invoice_id', 'patient_id', 'amount', 'payment_type', 'paid_at'],
  bank_transactions: ['hash', 'date', 'amount', 'description', 'reconciled', 'gl_code', 'ingested_at'],
  bank_rules: ['pattern', 'type', 'gl_code', 'notes'],
  reconciliation_flags: ['id', 'type', 'entity_id', 'cliniko_state', 'ledger_state', 'diff', 'resolved_at', 'resolution', 'notes', 'created_at'],
  actions_required: ['id', 'type', 'cliniko_id', 'patient_name', 'amount', 'description', 'status', 'created_at', 'done_at'],
  idempotency_keys: ['key', 'timestamp'],
  worker_state: ['key', 'value'],
  referrals: ['gmail_message_id', 'cliniko_patient_id', 'status', 'processed_at', 'email_subject', 'attachment_filename'],
  tyro_ingest: ['transaction_id', 'date', 'patient', 'amount_charged', 'funder', 'status', 'xero_invoice_id', 'xero_invoice_number', 'ingested_at'],
  stripe_payments: ['stripe_event_id', 'stripe_invoice_id', 'stripe_subscription_id', 'cliniko_id', 'xero_contact_id', 'xero_overpayment_id', 'amount', 'currency', 'tier', 'paid_at', 'pp_invoice_id', 'pp_amount', 'created_at'],
  appointment_invoices: ['cliniko_appointment_id', 'cliniko_patient_id', 'service_name', 'appointment_date', 'appointment_status', 'casual_price', 'xero_invoice_id', 'xero_invoice_number', 'overpayment_allocated', 'gap_amount', 'created_at'],
  stripe_cliniko_links: ['stripe_customer_id', 'cliniko_id', 'match_method', 'linked_at'],
};

// Legacy Sheets-style tab names → table names (for getTab compatibility).
const TAB_TO_TABLE = {
  Contacts: 'contacts',
  Invoices: 'invoices',
  Appointments: 'appointments',
  Payments: 'payments',
  BankTransactions: 'bank_transactions',
  BankRules: 'bank_rules',
  ReconciliationFlags: 'reconciliation_flags',
  ActionsRequired: 'actions_required',
  IdempotencyKeys: 'idempotency_keys',
  WorkerState: 'worker_state',
  Referrals: 'referrals',
  TyroIngest: 'tyro_ingest',
  StripePayments: 'stripe_payments',
  AppointmentInvoices: 'appointment_invoices',
  StripeClinikoLinks: 'stripe_cliniko_links',
};

// Identifier safety: only allow whitelisted table names through dynamic SQL.
function assertTable(table) {
  if (!Object.prototype.hasOwnProperty.call(COLUMNS, table)) {
    throw new Error(`Unknown billing table: ${table}`);
  }
  return table;
}

function resolveTable(nameOrTab) {
  if (Object.prototype.hasOwnProperty.call(COLUMNS, nameOrTab)) return nameOrTab;
  if (Object.prototype.hasOwnProperty.call(TAB_TO_TABLE, nameOrTab)) return TAB_TO_TABLE[nameOrTab];
  throw new Error(`Unknown billing table or tab: ${nameOrTab}`);
}

// Coerce arbitrary input into something pg will accept for each column.
// Sheets stored everything as strings; here we normalise empty → null so
// downstream SQL filters (IS NULL, ORDER BY, indexes on dates) work.
function coerce(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value === '') return null;
  return value;
}

// Generic upsert by primary key. Mirrors Sheets' "find row by col A, update
// in place else append" semantics with a single atomic INSERT ... ON CONFLICT.
async function upsertRow(table, pkColumn, row) {
  assertTable(table);
  const cols = COLUMNS[table];
  if (!cols.includes(pkColumn)) throw new Error(`pk ${pkColumn} not in ${table}`);

  const values = cols.map((c) => coerce(row[c]));
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols
    .filter((c) => c !== pkColumn)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');

  const sql = `
    INSERT INTO ${table} (${cols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (${pkColumn}) DO UPDATE SET ${updates}
  `;
  await query(sql, values);
}

// "Append" semantics — sheets appended unconditionally; here we use the PK as
// an idempotency guard so retries don't duplicate. ON CONFLICT DO NOTHING.
async function appendRow(table, pkColumn, row) {
  assertTable(table);
  const cols = COLUMNS[table];
  const values = cols.map((c) => coerce(row[c]));
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    INSERT INTO ${table} (${cols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (${pkColumn}) DO NOTHING
  `;
  await query(sql, values);
}

// ────────────────────────────────────────────────────────────────────────────
// Public API consumed by jobs/*.js and routes/admin.js.
// ────────────────────────────────────────────────────────────────────────────

async function upsertContact(data) { return upsertRow('contacts', 'cliniko_id', data); }
async function upsertStripeClinikoLink(data) { return upsertRow('stripe_cliniko_links', 'stripe_customer_id', data); }
async function upsertInvoice(data) { return upsertRow('invoices', 'cliniko_id', data); }
async function upsertAppointment(data) { return upsertRow('appointments', 'cliniko_id', data); }
async function upsertPayment(data) { return upsertRow('payments', 'cliniko_id', data); }
async function upsertBankTransaction(data) { return upsertRow('bank_transactions', 'hash', data); }
async function upsertReferral(data) { return upsertRow('referrals', 'gmail_message_id', data); }

async function appendTyroIngest(data) { return appendRow('tyro_ingest', 'transaction_id', data); }
async function appendStripePayment(data) { return appendRow('stripe_payments', 'stripe_event_id', data); }
async function appendAppointmentInvoice(data) { return appendRow('appointment_invoices', 'cliniko_appointment_id', data); }
async function appendActionRequired(data) { return appendRow('actions_required', 'id', data); }
async function appendReconciliationFlag(data) { return appendRow('reconciliation_flags', 'id', data); }

async function getWorkerState(key) {
  const row = await getOne('SELECT value FROM worker_state WHERE key = $1', [String(key)]);
  return row ? row.value : null;
}

async function setWorkerState(key, value) {
  const v = value === null || value === undefined ? '' : String(value);
  await query(
    `INSERT INTO worker_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(key), v]
  );
}

function normaliseFunder(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('medicare')) return 'medicare';
  if (s.includes('dva') || s.includes('veteran')) return 'dva';
  return 'phi';
}

// Indexed lookup replaces the full-Contacts scan that was killing Sheets quota.
async function findContactByMembership({ funder, membership }) {
  const m = String(membership || '').trim();
  if (!m) return [];
  const kind = normaliseFunder(funder);

  if (kind === 'medicare') {
    // Sheets logic: ref exact match OR card.includes(m).
    const rows = await getAll(
      `SELECT cliniko_id, name FROM contacts
       WHERE medicare_reference = $1 OR medicare ILIKE '%' || $1 || '%'`,
      [m]
    );
    return rows;
  }
  if (kind === 'dva') {
    const rows = await getAll(
      `SELECT cliniko_id, name FROM contacts WHERE dva_card_number = $1`,
      [m]
    );
    return rows;
  }
  const rows = await getAll(
    `SELECT cliniko_id, name FROM contacts WHERE LOWER(phi_membership_number) = LOWER($1)`,
    [m]
  );
  return rows;
}

// Sheets returned every tab as an array of { header: value } objects. Preserve
// that shape so admin.js and reconcile.js read it the same way. Cap at 50k rows
// to avoid pathological scans — none of the current callers exceed this.
async function getTab(nameOrTab) {
  const table = resolveTable(nameOrTab);
  const cols = COLUMNS[table];
  const rows = await getAll(`SELECT ${cols.join(', ')} FROM ${table} LIMIT 50000`);
  // Stringify everything to match the legacy "all values are strings" shape
  // that current callers parse (e.g. parseFloat on amount strings).
  return rows.map((r) => {
    const out = {};
    for (const c of cols) {
      const v = r[c];
      out[c] = v === null || v === undefined ? '' : String(v);
    }
    return out;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Compatibility shims for admin.js raw-Sheets operations.
// These will be removed once admin.js is fully migrated.
// ────────────────────────────────────────────────────────────────────────────

// Bulk-replace bank_rules (used by /admin/seed-bank-rules).
async function replaceBankRules(rulesRows) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE bank_rules RESTART IDENTITY');
    for (const r of rulesRows) {
      const [pattern, type, gl_code, notes] = r;
      await client.query(
        `INSERT INTO bank_rules (pattern, type, gl_code, notes) VALUES ($1,$2,$3,$4)`,
        [pattern, type, gl_code, notes]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Clear idempotency keys by exact match or prefix (used by /admin/clear-idempotency
// and /admin/backfill-cliniko-appointments).
async function clearIdempotencyKeys({ keys, prefix } = {}) {
  let removed = 0;
  if (Array.isArray(keys) && keys.length) {
    const r = await run(`DELETE FROM idempotency_keys WHERE key = ANY($1::text[])`, [keys]);
    removed += r.rowCount;
  }
  if (typeof prefix === 'string' && prefix.length > 0) {
    const r = await run(`DELETE FROM idempotency_keys WHERE key LIKE $1 || '%'`, [prefix]);
    removed += r.rowCount;
  }
  return removed;
}

// Diagnostic counters for the contacts table (mirrors /admin/contacts-diag).
async function contactsDiag() {
  const row = await getOne(`
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(DISTINCT cliniko_id)::int AS unique_cliniko_ids,
      COUNT(*) FILTER (WHERE cliniko_id IS NULL OR cliniko_id = '')::int AS blank_ids,
      COUNT(*) FILTER (WHERE phi_fund IS NOT NULL AND phi_fund <> '')::int AS funds_populated,
      COUNT(*) FILTER (WHERE phi_membership_number IS NOT NULL AND phi_membership_number <> '')::int AS mems_populated,
      COUNT(*) FILTER (WHERE medicare_reference IS NOT NULL AND medicare_reference <> '')::int AS meds_populated
    FROM contacts
  `);
  return row;
}

// Idempotency check/mark — replaces lib/idempotency.js Sheets calls.
const IDEMPOTENCY_EXPIRY_DAYS = 60;

async function checkIdempotencyKey(key) {
  const cutoff = Date.now() - IDEMPOTENCY_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const row = await getOne(
    `SELECT timestamp FROM idempotency_keys WHERE key = $1`,
    [String(key)]
  );
  if (!row) return false;
  return Number(row.timestamp) > cutoff;
}

async function markIdempotencyKey(key) {
  await query(
    `INSERT INTO idempotency_keys (key, timestamp) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET timestamp = EXCLUDED.timestamp`,
    [String(key), Date.now()]
  );
}

// Sweep keys older than `keepDays` (default 90). Returns the row count.
// Safe to run unconditionally — the check() function already ignores keys
// older than IDEMPOTENCY_EXPIRY_DAYS (60), so deleting at 90 leaves a
// 30-day buffer for paranoia.
async function sweepIdempotencyKeys(keepDays = 90) {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const r = await run(`DELETE FROM idempotency_keys WHERE timestamp < $1`, [cutoff]);
  return r.rowCount;
}

module.exports = {
  // upserts
  upsertContact,
  upsertStripeClinikoLink,
  upsertInvoice,
  upsertAppointment,
  upsertPayment,
  upsertBankTransaction,
  upsertReferral,
  // appends
  appendActionRequired,
  appendTyroIngest,
  appendStripePayment,
  appendAppointmentInvoice,
  appendReconciliationFlag,
  // state
  getWorkerState,
  setWorkerState,
  // lookups
  findContactByMembership,
  getTab,
  // admin helpers
  replaceBankRules,
  clearIdempotencyKeys,
  contactsDiag,
  // idempotency
  checkIdempotencyKey,
  markIdempotencyKey,
  sweepIdempotencyKeys,
  // exposed for callers that need raw access
  pool,
  COLUMNS,
};
