'use strict';

const cliniko = require('../services/cliniko').finance;
const { appendReconciliationFlag, getTab } = require('../services/sheets');
const { logger } = require('../lib/logger');

async function resolveFlag({ flag_id, resolution, notes }, log = logger) {
  const sheets = await require('../services/sheets').getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'ReconciliationFlags!A:A',
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === flag_id);
  if (rowIndex < 0) {
    log.warn({ flag_id }, 'Flag not found');
    return false;
  }

  // Columns: id, type, entity_id, cliniko_state, ledger_state, diff, resolved_at, resolution, notes, created_at
  // resolved_at = col G (index 6), resolution = col H (index 7), notes = col I (index 8)
  const rowNum = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `ReconciliationFlags!G${rowNum}:I${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[new Date().toISOString(), resolution, notes || '']] },
  });

  log.info({ flag_id, resolution }, 'Flag resolved');
  return true;
}

async function runReconciliation(log = logger) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  log.info({ since }, 'Starting reconciliation');

  const stats = { invoices_checked: 0, flags_created: 0 };

  // Walk Cliniko invoices updated in last 24h → compare to ledger
  const invRes = await cliniko.getInvoices(since);
  const ledgerInvoices = await getTab('Invoices');
  const ledgerMap = new Map(ledgerInvoices.map((r) => [r.cliniko_id, r]));

  for (const inv of invRes.invoices || []) {
    stats.invoices_checked++;
    const ledger = ledgerMap.get(String(inv.id));

    if (!ledger) {
      await appendReconciliationFlag({
        id: `missing-invoice:${inv.id}`,
        type: 'invoice_missing_in_ledger',
        entity_id: inv.id,
        cliniko_state: inv.status,
        ledger_state: 'not_found',
        diff: `Invoice ${inv.id} exists in Cliniko but not in ledger`,
        resolved_at: '',
        resolution: '',
        notes: '',
        created_at: new Date().toISOString(),
      });
      stats.flags_created++;
      continue;
    }

    if (ledger.status !== inv.status) {
      await appendReconciliationFlag({
        id: `status-drift:${inv.id}`,
        type: 'invoice_status_drift',
        entity_id: inv.id,
        cliniko_state: inv.status,
        ledger_state: ledger.status,
        diff: `Cliniko: ${inv.status}, ledger: ${ledger.status}`,
        resolved_at: '',
        resolution: '',
        notes: '',
        created_at: new Date().toISOString(),
      });
      stats.flags_created++;
    }
  }

  log.info(stats, 'Reconciliation complete');
  return stats;
}

module.exports = { runReconciliation, resolveFlag };
