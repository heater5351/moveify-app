'use strict';

// Pushes operator-facing dashboards to the Google Sheet identified by
// SHEETS_DASHBOARD_ID. Runs daily via Cloud Scheduler + on-demand via
// /admin/dashboard-sync. The Sheet must be shared with the worker's
// runtime SA as Editor. Each run REPLACES the tab contents — the Sheet
// is a view, not a journal.
//
// Tabs written:
//   - "Open Flags"      reconciliation_flags WHERE resolved_at IS NULL
//   - "Open Actions"    actions_required     WHERE status = 'open'
//   - "Metrics"         rolling counts (today / 7d / 30d) by activity
//   - "Aged Debtors"    Xero AR aging from /Reports/AgedReceivablesSummary

const { getAll, query } = require('../db/pool');
const { writeTab } = require('../lib/sheets-client');
const xero = require('../lib/xero');
const { logger } = require('../lib/logger');

const TAB_FLAGS = 'Open Flags';
const TAB_ACTIONS = 'Open Actions';
const TAB_METRICS = 'Metrics';
const TAB_AGED = 'Aged Debtors';
const TAB_APPTS = 'Appointment Invoices (Live)';

function tsLocal(date = new Date()) {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

async function buildFlagsRows() {
  const rows = await getAll(`
    SELECT id, type, entity_id, cliniko_state, ledger_state, diff, notes, created_at
    FROM reconciliation_flags
    WHERE resolved_at IS NULL
    ORDER BY created_at DESC
    LIMIT 5000
  `);
  const header = ['id', 'type', 'entity_id', 'cliniko_state', 'ledger_state', 'diff', 'notes', 'created_at'];
  return [header, ...rows.map((r) => header.map((c) => r[c] == null ? '' : String(r[c])))];
}

async function buildActionsRows() {
  const rows = await getAll(`
    SELECT id, type, cliniko_id, patient_name, amount, description, created_at
    FROM actions_required
    WHERE status = 'open'
    ORDER BY created_at DESC
    LIMIT 5000
  `);
  const header = ['id', 'type', 'cliniko_id', 'patient_name', 'amount', 'description', 'created_at'];
  return [header, ...rows.map((r) => header.map((c) => r[c] == null ? '' : String(r[c])))];
}

async function buildMetricsRows() {
  // Rolling counts of pipeline activity over today / last 7 days / last 30 days.
  // Uses COUNT(*) over each source table filtered on the relevant timestamp column.
  const windows = [
    { label: 'Today',   days: 1 },
    { label: 'Last 7d', days: 7 },
    { label: 'Last 30d', days: 30 },
  ];
  const metrics = [
    { key: 'Stripe payments processed', table: 'stripe_payments',     ts: 'paid_at' },
    { key: 'P&P invoices created',      table: 'stripe_payments',     ts: 'paid_at', where: "pp_invoice_id IS NOT NULL AND pp_invoice_id <> ''" },
    { key: 'Appointment invoices',      table: 'appointment_invoices', ts: 'created_at' },
    { key: 'Tyro ingest rows',          table: 'tyro_ingest',          ts: 'ingested_at' },
    { key: 'Reconciliation flags raised', table: 'reconciliation_flags', ts: 'created_at' },
    { key: 'Actions raised',            table: 'actions_required',     ts: 'created_at' },
  ];

  const rows = [['Metric', ...windows.map((w) => w.label)]];
  for (const m of metrics) {
    const counts = [];
    for (const w of windows) {
      const whereClause = m.where ? `AND ${m.where}` : '';
      const r = await query(
        `SELECT COUNT(*)::int AS n FROM ${m.table}
         WHERE ${m.ts} > NOW() - INTERVAL '${w.days} day' ${whereClause}`
      );
      counts.push(r.rows[0].n);
    }
    rows.push([m.key, ...counts.map(String)]);
  }

  // Current open snapshots (point-in-time)
  const open = [
    { key: 'Open flags (now)',   sql: `SELECT COUNT(*)::int AS n FROM reconciliation_flags WHERE resolved_at IS NULL` },
    { key: 'Open actions (now)', sql: `SELECT COUNT(*)::int AS n FROM actions_required WHERE status = 'open'` },
    { key: 'Idempotency keys',   sql: `SELECT COUNT(*)::int AS n FROM idempotency_keys` },
    { key: 'Contacts (PG)',      sql: `SELECT COUNT(*)::int AS n FROM contacts` },
  ];
  rows.push(['', '', '', '']);
  rows.push(['Snapshot', 'Value', '', '']);
  for (const s of open) {
    const r = await query(s.sql);
    rows.push([s.key, String(r.rows[0].n), '', '']);
  }

  rows.push(['', '', '', '']);
  rows.push(['Generated at (UTC)', tsLocal(), '', '']);
  return rows;
}

// Per-appointment invoice live status, pulled from Xero on each sync. The PG
// columns `overpayment_allocated` and `gap_amount` are point-in-time snapshots
// (set at invoice creation) and do not reflect later back-allocations from
// subsequent DDs. This view asks Xero for the authoritative current state.
async function buildAppointmentInvoicesLiveRows(log) {
  const rows = await getAll(`
    SELECT cliniko_appointment_id, cliniko_patient_id, service_name,
           appointment_date, casual_price, xero_invoice_id, xero_invoice_number,
           created_at
    FROM appointment_invoices
    WHERE xero_invoice_id IS NOT NULL AND xero_invoice_id <> ''
    ORDER BY appointment_date DESC
    LIMIT 1000
  `);

  const header = [
    'appointment_date', 'cliniko_patient_id', 'service_name', 'casual_price',
    'xero_invoice_number', 'xero_status', 'xero_amount_due', 'xero_amount_paid',
    'created_at',
  ];
  const out = [header];
  for (const r of rows) {
    let xeroStatus = '', amountDue = '', amountPaid = '';
    try {
      const inv = await xero.getInvoice(r.xero_invoice_id);
      if (inv) {
        xeroStatus = inv.Status || '';
        amountDue = inv.AmountDue != null ? String(inv.AmountDue) : '';
        amountPaid = inv.AmountPaid != null ? String(inv.AmountPaid) : '';
      } else {
        xeroStatus = 'NOT_FOUND';
      }
    } catch (err) {
      log.warn({ invoice_id: r.xero_invoice_id, err: err.message }, 'Xero invoice fetch failed');
      xeroStatus = `ERR:${err.message.slice(0, 40)}`;
    }
    out.push([
      r.appointment_date || '', r.cliniko_patient_id || '', r.service_name || '',
      r.casual_price != null ? String(r.casual_price) : '',
      r.xero_invoice_number || '', xeroStatus, amountDue, amountPaid,
      r.created_at || '',
    ]);
  }
  return out;
}

async function buildAgedDebtorRows(log) {
  // Xero AR aging summary. We pull the report and reshape into per-contact rows.
  // Falls back to a 1-row "unavailable" notice if Xero throws (so the rest of
  // the dashboard still updates).
  try {
    const report = await xero.getAgedReceivablesSummary();
    if (!report || !Array.isArray(report.rows)) {
      return [['Aged Receivables', 'No data returned from Xero']];
    }
    return report.rows;
  } catch (err) {
    log.warn({ err: err.message }, 'aged-debtors report fetch failed');
    return [['Error', `Could not fetch from Xero: ${err.message}`]];
  }
}

async function runDashboardSync(log = logger) {
  const sheetId = process.env.SHEETS_DASHBOARD_ID;
  if (!sheetId) throw new Error('SHEETS_DASHBOARD_ID env var not set');

  const t0 = Date.now();
  log.info({ sheetId }, 'dashboard-sync start');

  const [flagsRows, actionsRows, metricsRows, agedRows, apptsRows] = await Promise.all([
    buildFlagsRows(),
    buildActionsRows(),
    buildMetricsRows(),
    buildAgedDebtorRows(log),
    buildAppointmentInvoicesLiveRows(log),
  ]);

  await writeTab(sheetId, TAB_FLAGS, flagsRows);
  await writeTab(sheetId, TAB_ACTIONS, actionsRows);
  await writeTab(sheetId, TAB_METRICS, metricsRows);
  await writeTab(sheetId, TAB_AGED, agedRows);
  await writeTab(sheetId, TAB_APPTS, apptsRows);

  const stats = {
    flags: flagsRows.length - 1,
    actions: actionsRows.length - 1,
    metrics_rows: metricsRows.length,
    aged_rows: agedRows.length,
    appt_invoices: apptsRows.length - 1,
    ms: Date.now() - t0,
  };
  log.info(stats, 'dashboard-sync complete');
  return stats;
}

module.exports = { runDashboardSync };
