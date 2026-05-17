'use strict';

const cliniko = require('../services/cliniko').finance;
const { appendReconciliationFlag, getTab } = require('../services/billing-db');
const { run } = require('../db/pool');
const { logger } = require('../lib/logger');

async function resolveFlag({ flag_id, resolution, notes }, log = logger) {
  const r = await run(
    `UPDATE reconciliation_flags
     SET resolved_at = $1, resolution = $2, notes = $3
     WHERE id = $4`,
    [new Date().toISOString(), resolution, notes || '', flag_id]
  );
  if (r.rowCount === 0) {
    log.warn({ flag_id }, 'Flag not found');
    return false;
  }
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

    // Coerce both sides to string before comparison. Cliniko returns status as
    // a number (e.g. 20) while the PG `invoices.status` column is TEXT, so
    // `inv.status === ledger.status` is always false even when values match.
    // Pre-migration Sheets storage stringified everything implicitly, masking
    // this. Strict-equal on stringified values is the correct check.
    if (String(ledger.status) !== String(inv.status)) {
      await appendReconciliationFlag({
        id: `status-drift:${inv.id}`,
        type: 'invoice_status_drift',
        entity_id: inv.id,
        cliniko_state: String(inv.status),
        ledger_state: String(ledger.status),
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
