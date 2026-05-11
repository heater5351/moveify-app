'use strict';

const { sendEmail } = require('../services/gmail');
const { getTab } = require('../services/sheets');
const { logger } = require('../lib/logger');

const OPERATOR_EMAIL = 'ryan@moveifyhealth.com';
const AGED_DEBTOR_DAYS = 14;

async function runDailySummary(log = logger) {
  const flags = await getTab('ReconciliationFlags');
  const openFlags = flags.filter((f) => !f.resolved_at);

  // Aged debtors: NDIS/RTWSA invoices unpaid > 14 days
  const invoices = await getTab('Invoices');
  const cutoff = new Date(Date.now() - AGED_DEBTOR_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const agedDebtors = invoices.filter(
    (inv) =>
      (inv.type === 'ndis' || inv.type === 'rtwsa') &&
      inv.status === 'awaiting_payment' &&
      inv.created_at < cutoff
  );

  const failedDDs = openFlags.filter((f) => f.type === 'failed_stripe_dd');
  const disputes = openFlags.filter((f) => f.type === 'stripe_dispute');

  // Alert thresholds
  const alerts = [];
  if (openFlags.length > 10) alerts.push(`⚠ Open reconciliation flags: ${openFlags.length} (threshold: 10)`);
  if (disputes.length > 0) alerts.push(`⚠ ${disputes.length} active Stripe dispute(s) require attention`);

  const subject = `Moveify Billing Summary — ${new Date().toLocaleDateString('en-AU')}`;

  const body = [
    `MOVEIFY BILLING DAILY SUMMARY`,
    `Date: ${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    ``,
    alerts.length > 0 ? `ALERTS\n${alerts.join('\n')}\n` : '',
    `OPEN RECONCILIATION FLAGS: ${openFlags.length}`,
    openFlags.slice(0, 20).map((f) => `  [${f.type}] ${f.entity_id}: ${f.diff}`).join('\n'),
    openFlags.length > 20 ? `  ... and ${openFlags.length - 20} more` : '',
    ``,
    `AGED DEBTORS (NDIS/RTWSA > ${AGED_DEBTOR_DAYS} days unpaid): ${agedDebtors.length}`,
    agedDebtors.map((inv) => `  Invoice ${inv.cliniko_id} | $${inv.total} | ${inv.type.toUpperCase()} | created ${inv.created_at}`).join('\n'),
    ``,
    `FAILED STRIPE DDs: ${failedDDs.length}`,
    failedDDs.map((f) => `  Charge ${f.entity_id}: ${f.diff}`).join('\n'),
  ]
    .filter((l) => l !== '')
    .join('\n');

  await sendEmail({ to: OPERATOR_EMAIL, subject, body });
  log.info({ open_flags: openFlags.length, aged_debtors: agedDebtors.length, failed_dds: failedDDs.length }, 'Daily summary sent');

  // Log alert-threshold breaches as severity ERROR for Cloud Logging alerting
  if (openFlags.length > 10) {
    log.error({ open_flag_count: openFlags.length }, 'Alert: reconciliation flag count exceeds threshold');
  }
}

module.exports = { runDailySummary };
