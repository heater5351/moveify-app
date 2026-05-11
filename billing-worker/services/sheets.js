'use strict';

const { google } = require('googleapis');
const { getSecret } = require('../lib/secrets');
const { logger } = require('../lib/logger');

let _sheets = null;

async function getSheets() {
  if (_sheets) return _sheets;

  const raw = await getSecret('google-sheets-service-account-credentials');
  const creds = JSON.parse(raw);

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

const TAB_HEADERS = {
  Contacts: ['cliniko_id', 'name', 'email', 'phone', 'dob', 'condition', 'medicare', 'medicare_reference', 'dva_card_number', 'phi_fund', 'phi_membership_number', 'updated_at'],
  Invoices: ['cliniko_id', 'patient_id', 'status', 'total', 'type', 'created_at', 'updated_at'],
  Appointments: ['cliniko_id', 'patient_id', 'practitioner_id', 'status', 'starts_at', 'updated_at'],
  Payments: ['cliniko_id', 'invoice_id', 'patient_id', 'amount', 'payment_type', 'paid_at'],
  BankTransactions: ['hash', 'date', 'amount', 'description', 'reconciled', 'gl_code', 'ingested_at'],
  BankRules: ['pattern', 'type', 'gl_code', 'notes'],
  ReconciliationFlags: ['id', 'type', 'entity_id', 'cliniko_state', 'ledger_state', 'diff', 'resolved_at', 'resolution', 'notes', 'created_at'],
  ActionsRequired: ['id', 'type', 'cliniko_id', 'patient_name', 'amount', 'description', 'status', 'created_at', 'done_at'],
  IdempotencyKeys: ['key', 'timestamp'],
  WorkerState: ['key', 'value'],
  // email_subject may contain patient name (PHI) — stored here for debugging convenience
  // Access to the Sheets ledger is already restricted to the billing worker service account
  Referrals: ['gmail_message_id', 'cliniko_patient_id', 'status', 'processed_at', 'email_subject', 'attachment_filename'],
  TyroIngest: ['transaction_id', 'date', 'patient', 'amount_charged', 'funder', 'status', 'xero_invoice_id', 'xero_invoice_number', 'ingested_at'],
  StripePayments: ['stripe_event_id', 'stripe_invoice_id', 'stripe_subscription_id', 'cliniko_id', 'xero_contact_id', 'xero_overpayment_id', 'amount', 'currency', 'tier', 'paid_at', 'pp_invoice_id', 'pp_amount', 'created_at'],
  AppointmentInvoices: ['cliniko_appointment_id', 'cliniko_patient_id', 'service_name', 'appointment_date', 'appointment_status', 'casual_price', 'xero_invoice_id', 'xero_invoice_number', 'overpayment_allocated', 'gap_amount', 'created_at'],
  StripeClinikoLinks: ['stripe_customer_id', 'cliniko_id', 'match_method', 'linked_at'],
};

async function ensureSheets(spreadsheetId) {
  const sheets = await getSheets();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Set(meta.data.sheets.map((s) => s.properties.title));

  const toCreate = Object.keys(TAB_HEADERS).filter((t) => !existing.has(t));

  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: toCreate.map((title) => ({
          addSheet: { properties: { title } },
        })),
      },
    });
    logger.info({ created: toCreate }, 'Created missing Sheets tabs');
  }

  for (const tab of Object.keys(TAB_HEADERS)) {
    const range = `${tab}!A1:Z1`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [TAB_HEADERS[tab]] },
      });
    }
  }
}

/**
 * Finds a row by primary key value in column 0 and updates it,
 * or appends a new row if not found.
 */
async function upsertRow(tab, primaryKey, rowData) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:A`,
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === String(primaryKey));

  const headers = TAB_HEADERS[tab];
  const values = headers.map((h) => (rowData[h] !== undefined ? String(rowData[h]) : ''));

  if (rowIndex > 0) {
    // rowIndex is 0-based; sheet rows are 1-based and row 1 is the header
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:A`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
  }
}

async function upsertContact(data) { return upsertRow('Contacts', data.cliniko_id, data); }
async function upsertStripeClinikoLink(data) { return upsertRow('StripeClinikoLinks', data.stripe_customer_id, data); }
async function upsertInvoice(data) { return upsertRow('Invoices', data.cliniko_id, data); }
async function upsertAppointment(data) { return upsertRow('Appointments', data.cliniko_id, data); }
async function upsertPayment(data) { return upsertRow('Payments', data.cliniko_id, data); }
async function upsertBankTransaction(data) { return upsertRow('BankTransactions', data.hash, data); }
async function upsertReferral(data) { return upsertRow('Referrals', data.gmail_message_id, data); }

async function appendTyroIngest(data) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const headers = TAB_HEADERS['TyroIngest'];
  const values = headers.map((h) => (data[h] !== undefined ? String(data[h]) : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'TyroIngest!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function appendStripePayment(data) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const headers = TAB_HEADERS['StripePayments'];
  const values = headers.map((h) => (data[h] !== undefined ? String(data[h]) : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'StripePayments!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function appendAppointmentInvoice(data) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const headers = TAB_HEADERS['AppointmentInvoices'];
  const values = headers.map((h) => (data[h] !== undefined ? String(data[h]) : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'AppointmentInvoices!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function appendActionRequired(data) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const headers = TAB_HEADERS['ActionsRequired'];
  const values = headers.map((h) => (data[h] !== undefined ? String(data[h]) : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'ActionsRequired!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function appendReconciliationFlag(data) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const headers = TAB_HEADERS['ReconciliationFlags'];
  const values = headers.map((h) => (data[h] !== undefined ? String(data[h]) : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'ReconciliationFlags!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function getWorkerState(key) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'WorkerState!A:B' });
  const rows = res.data.values || [];
  const row = rows.find((r) => r[0] === key);
  return row ? row[1] : null;
}

async function setWorkerState(key, value) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'WorkerState!A:A' });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === key);

  if (rowIndex >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `WorkerState!A${rowIndex + 1}:B${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[key, String(value)]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'WorkerState!A:B',
      valueInputOption: 'RAW',
      requestBody: { values: [[key, String(value)]] },
    });
  }
}

function normaliseFunder(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('medicare')) return 'medicare';
  if (s.includes('dva') || s.includes('veteran')) return 'dva';
  return 'phi';
}

async function findContactByMembership({ funder, membership }) {
  const m = String(membership || '').trim();
  if (!m) return [];
  const kind = normaliseFunder(funder);
  const rows = await getTab('Contacts');
  const lc = m.toLowerCase();
  const matched = rows.filter((r) => {
    if (kind === 'medicare') {
      const ref = String(r.medicare_reference || '').trim();
      const card = String(r.medicare || '').trim();
      if (ref && ref === m) return true;
      if (card && card.includes(m)) return true;
      return false;
    }
    if (kind === 'dva') {
      return String(r.dva_card_number || '').trim() === m;
    }
    return String(r.phi_membership_number || '').trim().toLowerCase() === lc;
  });
  return matched.map((r) => ({ cliniko_id: r.cliniko_id, name: r.name }));
}

async function getTab(tab) {
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:Z` });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}

module.exports = {
  getSheets,
  ensureSheets,
  upsertContact,
  upsertStripeClinikoLink,
  upsertInvoice,
  upsertAppointment,
  upsertPayment,
  upsertBankTransaction,
  upsertReferral,
  appendActionRequired,
  appendTyroIngest,
  appendStripePayment,
  appendAppointmentInvoice,
  findContactByMembership,
  appendReconciliationFlag,
  getWorkerState,
  setWorkerState,
  getTab,
};
