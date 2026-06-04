'use strict';

const { sendEmail } = require('../services/gmail');
const { getTab } = require('../services/billing-db');
const { logger } = require('../lib/logger');

const OPERATOR_EMAIL = 'ryan@moveifyhealth.com';
const AGED_DEBTOR_DAYS = 14;

// Only these flag types reach the inbox. Everything else (block_completed,
// agreement_schedule_recovered, unknown_service_type, stripe_metadata_missing,
// stripe_fee_unbooked, appointment_patient_missing/not_found, …) is informational:
// still written to reconciliation_flags for audit, but never emailed. The benign
// appointment_unresolved_subscription flag is no longer raised at all (poller).
// To promote/demote a flag, just move it in/out of this set.
const ACTIONABLE_FLAG_TYPES = new Set([
  'stripe_payment_failed',        // failed Direct Debit
  'stripe_dispute',               // chargeback
  'insufficient_credit',          // session invoice not fully covered by credit
  'stripe_overpayment_failed',    // credit failed to apply
  'agreement_setup_failed',       // sign-up payment setup failed
  'appointment_invoice_failed',   // couldn't raise a session invoice
  'appointment_ledger_write_failed', // Xero invoice exists but ledger row missing
  'invoice_missing_in_ledger',
  'invoice_status_drift',
  'tyro_unallocated',             // Tyro settlement not allocated
  'tyro_duplicate_contact',
  'stripe_patient_not_found',     // payment couldn't be matched to a patient
]);

async function runDailySummary(log = logger) {
  const flags = await getTab('ReconciliationFlags');
  const openFlags = flags.filter((f) => !f.resolved_at);
  const actionable = openFlags.filter((f) => ACTIONABLE_FLAG_TYPES.has(f.type));

  // Aged debtors: NDIS/RTWSA invoices unpaid > 14 days (also actionable).
  const invoices = await getTab('Invoices');
  const cutoff = new Date(Date.now() - AGED_DEBTOR_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const agedDebtors = invoices.filter(
    (inv) =>
      (inv.type === 'ndis' || inv.type === 'rtwsa') &&
      inv.status === 'awaiting_payment' &&
      inv.created_at < cutoff
  );

  // Only-when-actionable: stay silent on a clean day so the inbox isn't trained
  // to ignore this email.
  if (actionable.length === 0 && agedDebtors.length === 0) {
    log.info(
      { open_flags: openFlags.length, actionable: 0, aged_debtors: 0, suppressed_informational: openFlags.length },
      'Daily summary: nothing actionable — no email sent'
    );
    return;
  }

  const failedDDs = actionable.filter((f) => f.type === 'stripe_payment_failed');
  const disputes = actionable.filter((f) => f.type === 'stripe_dispute');

  const alerts = [];
  if (disputes.length > 0) alerts.push(`⚠ ${disputes.length} active Stripe dispute(s) require attention`);
  if (actionable.length > 10) alerts.push(`⚠ ${actionable.length} actionable reconciliation flags (threshold: 10)`);

  const subject = `Moveify Billing — action needed (${new Date().toLocaleDateString('en-AU')})`;

  const body = [
    `MOVEIFY BILLING — ITEMS NEEDING ATTENTION`,
    `Date: ${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    ``,
    alerts.length > 0 ? `ALERTS\n${alerts.join('\n')}\n` : '',
    `ACTIONABLE FLAGS: ${actionable.length}`,
    actionable.slice(0, 30).map((f) => `  [${f.type}] ${f.entity_id}: ${f.diff}`).join('\n'),
    actionable.length > 30 ? `  ... and ${actionable.length - 30} more` : '',
    ``,
    `AGED DEBTORS (NDIS/RTWSA > ${AGED_DEBTOR_DAYS} days unpaid): ${agedDebtors.length}`,
    agedDebtors.map((inv) => `  Invoice ${inv.cliniko_id} | $${inv.total} | ${inv.type.toUpperCase()} | created ${inv.created_at}`).join('\n'),
  ]
    .filter((l) => l !== '')
    .join('\n');

  await sendEmail({ to: OPERATOR_EMAIL, subject, body });
  log.info(
    {
      actionable: actionable.length,
      failed_dds: failedDDs.length,
      disputes: disputes.length,
      aged_debtors: agedDebtors.length,
      suppressed_informational: openFlags.length - actionable.length,
    },
    'Daily summary sent (actionable only)'
  );

  // Log threshold breaches as ERROR for Cloud Logging alerting.
  if (actionable.length > 10) {
    log.error({ actionable_flag_count: actionable.length }, 'Alert: actionable reconciliation flag count exceeds threshold');
  }
}

module.exports = { runDailySummary };
