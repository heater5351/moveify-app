'use strict';

// Reconcile sweep for the service-agreement sign-up flow — the self-heal that
// closes the one residual gap in the webhook path: the worker acks the Stripe
// webhook 200 before processing, so if it crashes in the brief window after the
// ack but before creating the schedule, that schedule is silently lost (patient
// has a saved mandate but no billing, and no flag).
//
// This sweep walks recent COMPLETED setup-mode Checkout Sessions and, for any
// that has no linked schedule/subscription (metadata.agreement_session), re-runs
// provisioning. It is safe to run repeatedly:
//   - sessionProvisioned() skips sessions that already have a schedule/sub, so a
//     patient's earlier (even completed) plan is never confused for a new one;
//   - provisionFromSetupSession() is itself idempotent (DB session key + Stripe
//     idempotencyKey), so a race can't double-create.
//
// Dry-run by default — reports what it WOULD heal without writing anything.

const { logger } = require('../lib/logger');
const { listRecentSetupCheckouts, sessionProvisioned } = require('../services/stripe');
const { provisionFromSetupSession } = require('./stripe-handler');
const { appendReconciliationFlag } = require('../services/billing-db');

async function reconcileAgreementSchedules({ sinceHours = 48, dryRun = true } = {}, log = logger) {
  const sinceSec = Math.floor(Date.now() / 1000) - sinceHours * 3600;
  const sessions = await listRecentSetupCheckouts(sinceSec);

  const summary = { scanned: 0, healthy: 0, recovered: 0, would_recover: 0, no_customer: 0, failed: 0 };

  for (const session of sessions) {
    // Only our agreement sessions carry agreement_tier metadata; ignore any other
    // setup-mode checkouts.
    if (!session.metadata?.agreement_tier) continue;
    summary.scanned++;

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!customerId) {
      summary.no_customer++;
      log.warn({ session_id: session.id }, 'reconcile: completed setup session has no customer');
      continue;
    }

    let provisioned;
    try {
      provisioned = await sessionProvisioned(customerId, session.id);
    } catch (err) {
      summary.failed++;
      log.error({ session_id: session.id, err: err.message }, 'reconcile: provisioned-check failed');
      continue;
    }

    if (provisioned) {
      summary.healthy++;
      continue;
    }

    // Lost: completed setup, no schedule/subscription linked to it.
    if (dryRun) {
      summary.would_recover++;
      log.warn({ session_id: session.id, customer_id: customerId, tier: session.metadata.agreement_tier, path: session.metadata.agreement_path },
        'reconcile (dry-run): would recover lost schedule');
      continue;
    }

    const result = await provisionFromSetupSession(session, log, { source: 'reconcile' });
    if (result === 'created') {
      summary.recovered++;
      log.warn({ session_id: session.id, customer_id: customerId }, 'reconcile: RECOVERED lost schedule');
      // Surface the heal so an operator knows it happened (not an error — info).
      await appendReconciliationFlag({
        id: `agreement-recovered:${session.id}`,
        type: 'agreement_schedule_recovered',
        entity_id: session.id,
        cliniko_state: String(session.metadata.cliniko_id || ''),
        ledger_state: `${session.metadata.agreement_tier}/${session.metadata.agreement_path}`,
        diff: 'Schedule/subscription was missing for a completed setup checkout — auto-recreated by the reconcile sweep',
        resolved_at: '',
        resolution: '',
        notes: 'Verify the patient was not double-set-up; this is expected after a worker crash mid-webhook',
        created_at: new Date().toISOString(),
      }).catch((e) => log.error({ session_id: session.id, err: e.message }, 'reconcile: failed to write recovered flag'));
    } else if (result === 'duplicate') {
      // The DB session key was marked but no Stripe object was linked — provision
      // skipped. Treat as healthy-enough but log for visibility.
      summary.healthy++;
      log.info({ session_id: session.id }, 'reconcile: session key already marked, nothing to recreate');
    } else {
      summary.failed++;
    }
  }

  log.info({ since_hours: sinceHours, dryRun, ...summary }, 'reconcile-agreements complete');
  return summary;
}

module.exports = { reconcileAgreementSchedules };
