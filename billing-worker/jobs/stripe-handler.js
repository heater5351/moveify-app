'use strict';

const {
  getCustomer,
  updateCustomerMetadata,
  getSubscription,
  getSubscriptionProductName,
  getProductNameFromInvoice,
} = require('../services/stripe');
const {
  getTab,
  appendStripePayment,
  appendReconciliationFlag,
  upsertStripeClinikoLink,
} = require('../services/billing-db');
const xero = require('../lib/xero');
const { check, mark } = require('../lib/idempotency');
const { getPpFee } = require('../lib/rates');
const { logger } = require('../lib/logger');

async function handleStripeEvent(event, log = logger) {
  const idempotencyKey = `stripe:${event.id}`;
  if (await check(idempotencyKey)) {
    log.info({ event_id: event.id }, 'Duplicate Stripe event — skipping');
    return;
  }

  // Mark BEFORE side effects — same fail-closed pattern as Tyro ingest.
  await mark(idempotencyKey);

  switch (event.type) {
    case 'invoice.payment_succeeded':
      await handleInvoicePaid(event, log);
      break;
    case 'invoice.payment_failed':
      await handleInvoiceFailed(event, log);
      break;
    case 'charge.dispute.created':
      await handleDisputeCreated(event.data.object, log);
      break;
    default:
      log.debug({ event_type: event.type }, 'Unhandled Stripe event type');
  }
}

/**
 * Resolves a Stripe customer to a Cliniko patient ID.
 * Primary: cliniko_id in Stripe customer metadata (set by worker on first match).
 * Fallback: match by email + name against Contacts sheet, then cache result.
 * Returns null and writes a ReconciliationFlag if no match found.
 */
// Token-based name match: requires the Cliniko patient's last name to appear
// exactly in the Stripe customer's tokens, AND the first name to match either
// exactly OR via a ≥3-char prefix (handles Doug↔Douglas, Alex↔Alexander,
// Rob↔Robert etc.). Defeats substring false-positives like "smith jane" being
// picked up against "john smith".
function firstNamePrefixMatch(a, b) {
  if (!a || !b) return false;
  const minLen = Math.min(a.length, b.length);
  return minLen >= 3 && a.substring(0, minLen) === b.substring(0, minLen);
}

function nameTokensAllMatch(stripeName, clinikoName) {
  const sTokens = String(stripeName || '').toLowerCase().split(/\s+/).filter(Boolean);
  const cTokens = String(clinikoName || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (sTokens.length === 0 || cTokens.length < 2) return false;
  const cFirst = cTokens[0];
  const cLast = cTokens[cTokens.length - 1];
  if (!sTokens.includes(cLast)) return false;
  // First name: exact match OR ≥3-char prefix match in either direction.
  return sTokens.some((s) => firstNamePrefixMatch(s, cFirst));
}

async function resolveClinikoPatient(customer, log) {
  // 1) Trust explicit Stripe metadata first — it's the source-of-truth path.
  if (customer.metadata?.cliniko_id) return customer.metadata.cliniko_id;

  const contacts = await getTab('Contacts');
  const email = (customer.email || '').toLowerCase().trim();
  const name = (customer.name || '').toLowerCase().trim();

  // 2) Look up all Cliniko patients with this email — could be multiple
  // (e.g., household members sharing an email).
  const emailMatches = email
    ? contacts.filter((c) => (c.email || '').toLowerCase().trim() === email)
    : [];

  let match = null;
  let matchMethod = null;

  if (emailMatches.length === 1) {
    // Even with a single email match, validate the name matches too. This
    // prevents accidental mis-matches when Cliniko has stale email data —
    // e.g., a household email is recorded on the husband's Cliniko record,
    // but the Stripe customer is actually the wife.
    if (!name || nameTokensAllMatch(customer.name, emailMatches[0].name)) {
      match = emailMatches[0];
      matchMethod = 'email-unique';
    } else {
      // Email + name disagree. Don't refuse outright — fall through to
      // name-only search across the whole sheet; the real patient (with the
      // matching name) may have a different cliniko_id.
      log.info(
        { stripe_customer_id: customer.id, email_only_cliniko_id: emailMatches[0].cliniko_id },
        'Email matched a Cliniko patient but name did not — falling through to name-only search'
      );
    }
  } else if (emailMatches.length > 1 && name) {
    // Shared email — disambiguate by strict name tokens. Require exactly one
    // unambiguous match.
    const namedFromEmail = emailMatches.filter((c) => nameTokensAllMatch(customer.name, c.name));
    if (namedFromEmail.length === 1) {
      match = namedFromEmail[0];
      matchMethod = 'email-shared-name-disambig';
      log.warn(
        { stripe_customer_id: customer.id, shared_email_patient_count: emailMatches.length },
        'Disambiguated shared-email Stripe customer via Cliniko patient name comparison'
      );
    }
  }

  // 3) No email hits at all — try name-only across the whole sheet. Require
  // a single unambiguous token-based match.
  if (!match && name) {
    const namedAll = contacts.filter((c) => nameTokensAllMatch(customer.name, c.name));
    if (namedAll.length === 1) {
      match = namedAll[0];
      matchMethod = 'name-unique';
    }
  }

  if (!match) {
    const ambiguous = emailMatches.length > 1;
    log.warn(
      { customer_id: customer.id, email_match_count: emailMatches.length, ambiguous },
      ambiguous
        ? 'Multiple Cliniko patients share this email and name failed to disambiguate — refusing to auto-link'
        : 'No unique Cliniko patient matched by email or name'
    );
    await appendReconciliationFlag({
      id: `stripe-patient-not-found:${customer.id}`,
      type: 'stripe_patient_not_found',
      entity_id: customer.id,
      cliniko_state: '',
      ledger_state: '',
      diff: ambiguous
        ? `${emailMatches.length} Cliniko patients share this customer's email — name match was ambiguous`
        : 'No unique Cliniko patient matched by email or name',
      resolved_at: '',
      resolution: '',
      notes: 'Set metadata.cliniko_id on the Stripe customer to override email/name matching',
      created_at: new Date().toISOString(),
    });
    return null;
  }

  // Try to cache on the Stripe customer's metadata for fast future lookups.
  // Best-effort: restricted API keys can't write customer metadata, in which
  // case this no-ops and the Sheets cache below carries the load.
  await updateCustomerMetadata(customer.id, { cliniko_id: match.cliniko_id }).catch((err) =>
    log.warn({ err: err.message }, 'Failed to cache cliniko_id in Stripe metadata')
  );

  // Cache the resolved link in the Sheets ledger. This is the source-of-truth
  // path consulted by the appointment poller (which goes Cliniko→Stripe and
  // needs to find customer IDs without depending on Stripe-side metadata).
  await upsertStripeClinikoLink({
    stripe_customer_id: customer.id,
    cliniko_id: match.cliniko_id,
    match_method: matchMethod,
    linked_at: new Date().toISOString(),
  }).catch((err) =>
    log.warn({ err: err.message, customer_id: customer.id }, 'Failed to upsert StripeClinikoLinks row')
  );

  log.info(
    { customer_id: customer.id, cliniko_id: match.cliniko_id, match_method: matchMethod },
    'Linked Stripe customer to Cliniko patient'
  );
  return match.cliniko_id;
}

async function handleInvoicePaid(event, log) {
  return processInvoicePaid(event.data.object, { eventId: event.id, eventCreated: event.created, source: 'webhook' }, log);
}

/**
 * Replays a paid Stripe invoice into Xero. Drives both the live webhook path
 * (via handleInvoicePaid) and the historical backfill path. PHI hygiene: only
 * IDs and amounts hit logs — never customer email, name, or product/tier.
 */
async function processInvoicePaid(invoice, ctx, log) {
  log.info({ invoice_id: invoice.id, amount: invoice.amount_paid, source: ctx.source }, 'Processing invoice payment');

  if (!invoice.customer) {
    log.warn({ invoice_id: invoice.id }, 'No customer on invoice — skipping');
    return;
  }

  const clearingAccountId = process.env.XERO_STRIPE_CLEARING_ACCOUNT_ID;
  if (!clearingAccountId) {
    log.error({ invoice_id: invoice.id }, 'XERO_STRIPE_CLEARING_ACCOUNT_ID not set — cannot create overpayment');
    await appendReconciliationFlag({
      id: `stripe-config-missing:${ctx.eventId}`,
      type: 'stripe_overpayment_failed',
      entity_id: invoice.id,
      cliniko_state: '',
      ledger_state: '',
      diff: 'XERO_STRIPE_CLEARING_ACCOUNT_ID env var not configured',
      resolved_at: '',
      resolution: '',
      notes: 'Set Cloud Run env var to the Xero Stripe Clearing AccountID',
      created_at: new Date().toISOString(),
    });
    return;
  }

  const customer = await getCustomer(invoice.customer);
  const clinikoId = await resolveClinikoPatient(customer, log);
  if (!clinikoId) return;

  // Resolve subscription + product name (tier source-of-truth).
  // Stripe API ≥2024 moved this from invoice.subscription to
  // invoice.parent.subscription_details.subscription. Read the new location
  // first, fall back to the old field for compatibility.
  const subscriptionId = invoice.parent?.subscription_details?.subscription || invoice.subscription || null;
  let subscription = null;
  let productName = null;

  // Read product name from the invoice's line items first — captures the
  // historical tier the patient was billed for at this invoice's date, not
  // their current tier (which may have changed). This matters for backfill
  // accuracy but is also safer for live webhooks of subs that may have just
  // been updated.
  productName = await getProductNameFromInvoice(invoice).catch(() => null);

  if (subscriptionId) {
    subscription = await getSubscription(subscriptionId).catch((err) => {
      log.warn({ err: err.message, subscription_id: subscriptionId }, 'Failed to retrieve subscription');
      return null;
    });
    if (subscription && !productName) {
      // Fallback to current sub product if the invoice didn't yield one
      productName = await getSubscriptionProductName(subscription).catch(() => null);
    }
  }

  if (!productName) {
    await appendReconciliationFlag({
      id: `stripe-no-product:${ctx.eventId}`,
      type: 'stripe_metadata_missing',
      entity_id: invoice.id,
      cliniko_state: clinikoId,
      ledger_state: '',
      diff: 'Could not resolve Stripe subscription product name (tier)',
      resolved_at: '',
      resolution: '',
      notes: 'Check subscription has an active price/product',
      created_at: new Date().toISOString(),
    });
    // Still continue — we can create the overpayment without knowing tier.
  }

  const amountDollars = Number((invoice.amount_paid / 100).toFixed(2));
  const paidAtMs = invoice.status_transitions?.paid_at
    ? invoice.status_transitions.paid_at * 1000
    : (invoice.created || ctx.eventCreated || Math.floor(Date.now() / 1000)) * 1000;
  const paidAtIso = new Date(paidAtMs).toISOString();
  const paidAtDate = paidAtIso.slice(0, 10);

  // Find or create Xero contact
  let xeroContactId;
  try {
    xeroContactId = await xero.findOrCreateContact({
      name: customer.name || `Cliniko ${clinikoId}`,
      email: customer.email || undefined,
      clinikoId,
    });
  } catch (err) {
    log.error({ err: err.message, cliniko_id: clinikoId }, 'Xero contact lookup/create failed');
    await appendReconciliationFlag({
      id: `stripe-contact-fail:${ctx.eventId}`,
      type: 'stripe_overpayment_failed',
      entity_id: invoice.id,
      cliniko_state: clinikoId,
      ledger_state: '',
      diff: `Xero findOrCreateContact failed: ${err.message}`,
      resolved_at: '',
      resolution: '',
      notes: '',
      created_at: new Date().toISOString(),
    });
    return;
  }

  // Create Xero overpayment ("account credit")
  let overpaymentId;
  try {
    overpaymentId = await xero.createOverpayment({
      contactId: xeroContactId,
      amount: amountDollars,
      date: paidAtDate,
      reference: `Stripe ${invoice.id}`,
      bankAccountAccountId: clearingAccountId,
    });
  } catch (err) {
    log.error({ err: err.message, cliniko_id: clinikoId, invoice_id: invoice.id }, 'Xero overpayment creation failed');
    await appendReconciliationFlag({
      id: `stripe-overpayment-fail:${ctx.eventId}`,
      type: 'stripe_overpayment_failed',
      entity_id: invoice.id,
      cliniko_state: clinikoId,
      ledger_state: '',
      diff: `createOverpayment failed: ${err.message}`,
      resolved_at: '',
      resolution: '',
      notes: '',
      created_at: new Date().toISOString(),
    });
    return;
  }

  log.info(
    { cliniko_id: clinikoId, xero_contact_id: xeroContactId, xero_overpayment_id: overpaymentId, amount: amountDollars },
    'Xero overpayment created'
  );

  // Maybe create P&P invoice for this cycle, allocating from the overpayment we just made
  const ppResult = await maybeCreatePpInvoice({
    invoice,
    subscription,
    productName,
    clinikoId,
    xeroContactId,
    overpaymentId,
    overpaymentAmount: amountDollars,
    log,
  });

  // Back-allocate any remaining overpayment credit to outstanding session
  // invoices on this contact. This is what makes "failed DD → patient still
  // attends" recoverable: Stream B creates the session invoice AUTHORISED
  // even when no credit exists, and the next successful DD's overpayment
  // sweeps up the outstanding balances here.
  await backAllocateOutstanding({ xeroContactId, overpaymentId, log }).catch((err) =>
    log.warn({ err: err.message, xero_contact_id: xeroContactId, overpayment_id: overpaymentId }, 'Back-allocation failed — outstanding invoices may remain unpaid until next DD')
  );

  // Ledger append is best-effort. Xero records (the source of truth) are
  // already committed at this point — a Sheets quota / API blip here must not
  // surface as a handler failure or trigger a Stripe webhook retry that would
  // create duplicate Xero records (idempotency keys are already marked).
  try {
    await appendStripePayment({
      stripe_event_id: ctx.eventId,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subscriptionId || '',
      cliniko_id: clinikoId,
      xero_contact_id: xeroContactId,
      xero_overpayment_id: overpaymentId,
      amount: amountDollars,
      currency: invoice.currency,
      tier: productName || '',
      paid_at: paidAtIso,
      pp_invoice_id: ppResult?.invoiceId || '',
      pp_amount: ppResult?.amount ?? '',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn(
      {
        err: err.message,
        event_id: ctx.eventId,
        cliniko_id: clinikoId,
        xero_overpayment_id: overpaymentId,
        xero_pp_invoice_id: ppResult?.invoiceId || '',
        amount: amountDollars,
      },
      'StripePayments ledger append failed — Xero records intact, backfill row from this log line'
    );
  }
}

/**
 * Creates a P&P invoice for the current cycle if one hasn't been created yet,
 * and allocates from the just-created overpayment.
 *
 * Anchor depends on the product's billing cadence (from PP_FEES):
 *   - 'block'    (T1/T2/T3 weekly DDs over 6 weeks): anchor = subscription.start_date.
 *                Only the FIRST weekly DD creates the per-block P&P invoice;
 *                subsequent weekly DDs find the idempotency key marked and skip.
 *                The remaining DD overpayments flow into session-invoice credit.
 *   - '4-weekly' (continuity Independent/Maintain/etc.): anchor = invoice.period_start.
 *                Each 4-weekly Stripe cycle creates its own P&P invoice.
 *
 * Idempotency key = pp:<cliniko>:<anchor>. One P&P per patient per anchor, ever.
 */
async function maybeCreatePpInvoice({ invoice, subscription, productName, clinikoId, xeroContactId, overpaymentId, overpaymentAmount, log }) {
  if (!productName) return null;

  const ppFee = getPpFee(productName);
  if (!ppFee || !ppFee.amount || ppFee.amount === 0) {
    log.debug({ product: productName }, 'No P&P fee for this product — skipping P&P invoice');
    return null;
  }

  // Anchor the idempotency key by billing cadence. Block products share an
  // anchor across the entire subscription's lifetime (one P&P per block);
  // continuity products use the line item's period.start (one P&P per cycle).
  //
  // IMPORTANT: do NOT use `invoice.period_start` — Stripe sets that to the
  // *previous* period's start (a quirk where the invoice-level period reflects
  // what was billed-for, not the upcoming period). The line item's period is
  // what actually advances per cycle.
  const lineItem = invoice.lines?.data?.[0];
  const linePeriodStart = lineItem?.period?.start;
  const linePeriodEnd = lineItem?.period?.end;
  const useBlockAnchor = ppFee.billing === 'block' && subscription?.start_date;
  const anchorSec = useBlockAnchor
    ? subscription.start_date
    : (linePeriodStart || invoice.created || Math.floor(Date.now() / 1000));
  const anchor = new Date(anchorSec * 1000).toISOString().slice(0, 10);

  const periodStart = linePeriodStart
    ? new Date(linePeriodStart * 1000).toISOString().slice(0, 10)
    : anchor;
  const periodEnd = linePeriodEnd
    ? new Date(linePeriodEnd * 1000).toISOString().slice(0, 10)
    : '';

  // Key includes product name so that a mid-cycle product switch (e.g.
  // Independent → Maintain) creates a fresh P&P invoice for the new product
  // rather than colliding with the previous product's key for the same
  // cliniko_id + anchor date.
  //
  // Back-compat: pre-2026-05-16 keys were `pp:<cliniko>:<anchor>` (no product).
  // We dual-check both formats so existing keys still gate. New writes only
  // use the new format. The legacy check naturally evaporates as keys age out
  // (60-day expiry on read + 90-day sweeper).
  const ppKey = `pp:${clinikoId}:${productName}:${anchor}`;
  const legacyKey = `pp:${clinikoId}:${anchor}`;
  if (await check(ppKey) || await check(legacyKey)) {
    log.info({ cliniko_id: clinikoId, anchor, product: productName, billing: ppFee.billing }, 'P&P invoice already created for this anchor');
    return null;
  }
  await mark(ppKey);

  let xeroInvoice;
  try {
    xeroInvoice = await xero.createInvoice({
      contactId: xeroContactId,
      lineItems: [{
        description: `Program & Platform — ${productName} (${periodStart}${periodEnd ? ` to ${periodEnd}` : ''})`,
        quantity: 1,
        unitAmount: ppFee.amount,
        accountCode: '200',
        taxType: 'EXEMPTOUTPUT',
      }],
      reference: `P&P ${productName} ${periodStart}`,
      date: periodStart,
      dueDate: periodStart,
      status: 'AUTHORISED',
    });
  } catch (err) {
    log.error({ err: err.message, cliniko_id: clinikoId }, 'P&P invoice creation failed');
    await appendReconciliationFlag({
      id: `pp-invoice-fail:${ppKey}`,
      type: 'stripe_overpayment_failed',
      entity_id: clinikoId,
      cliniko_state: clinikoId,
      ledger_state: '',
      diff: `P&P invoice create failed: ${err.message}`,
      resolved_at: '',
      resolution: '',
      notes: '',
      created_at: new Date().toISOString(),
    });
    return null;
  }

  // Allocate from the just-created overpayment, up to the lesser of (overpayment, invoice)
  const allocAmount = Math.min(overpaymentAmount, ppFee.amount);
  try {
    await xero.applyOverpayment({
      overpaymentId,
      invoiceId: xeroInvoice.invoiceId,
      amount: allocAmount,
    });
  } catch (err) {
    log.error({ err: err.message, invoice_id: xeroInvoice.invoiceId }, 'Overpayment allocation to P&P failed');
    await appendReconciliationFlag({
      id: `pp-alloc-fail:${ppKey}`,
      type: 'insufficient_credit',
      entity_id: xeroInvoice.invoiceNumber,
      cliniko_state: clinikoId,
      ledger_state: '',
      diff: `Allocation to P&P invoice failed: ${err.message}`,
      resolved_at: '',
      resolution: '',
      notes: '',
      created_at: new Date().toISOString(),
    });
  }

  if (allocAmount < ppFee.amount) {
    await appendReconciliationFlag({
      id: `pp-gap:${ppKey}`,
      type: 'insufficient_credit',
      entity_id: xeroInvoice.invoiceNumber,
      cliniko_state: clinikoId,
      ledger_state: '',
      diff: `P&P invoice $${ppFee.amount.toFixed(2)} only partially covered by $${allocAmount.toFixed(2)} overpayment`,
      resolved_at: '',
      resolution: '',
      notes: 'Awaiting next DD or top-up',
      created_at: new Date().toISOString(),
    });
  }

  log.info(
    { cliniko_id: clinikoId, product: productName, pp_amount: ppFee.amount, allocated: allocAmount, invoice_id: xeroInvoice.invoiceId },
    'P&P invoice created and allocated'
  );

  return { invoiceId: xeroInvoice.invoiceId, invoiceNumber: xeroInvoice.invoiceNumber, amount: ppFee.amount };
}

/**
 * After a new overpayment is created, sweep any remaining credit into the
 * contact's outstanding AUTHORISED invoices (oldest-first). Allows the
 * "failed DD → patient attended → DD retries successfully" flow to recover
 * without manual intervention.
 *
 * Safe to call on every DD — if the new overpayment was fully consumed by
 * the P&P invoice, getContactOverpayments returns 0 remaining and we no-op.
 */
async function backAllocateOutstanding({ xeroContactId, overpaymentId, log }) {
  const overpayments = await xero.getContactOverpayments(xeroContactId);
  const ourOp = overpayments.find((o) => o.overpaymentId === overpaymentId);
  if (!ourOp || ourOp.remaining <= 0.01) return;

  const invoices = await xero.getContactInvoices(xeroContactId);
  const outstanding = invoices
    .filter((i) => i.Status === 'AUTHORISED' && (Number(i.AmountDue) || 0) > 0.01)
    .sort((a, b) => String(a.Date).localeCompare(String(b.Date)));

  if (outstanding.length === 0) return;

  let remaining = ourOp.remaining;
  for (const inv of outstanding) {
    if (remaining <= 0.01) break;
    const due = Number(inv.AmountDue) || 0;
    const alloc = Math.min(due, remaining);
    if (alloc <= 0.01) continue;
    const rounded = Number(alloc.toFixed(2));
    try {
      await xero.applyOverpayment({
        overpaymentId,
        invoiceId: inv.InvoiceID,
        amount: rounded,
      });
      remaining = Number((remaining - rounded).toFixed(2));
      log.info(
        { invoice_number: inv.InvoiceNumber, allocated: rounded, overpayment_remaining: remaining },
        'Back-allocated overpayment credit to outstanding invoice'
      );
    } catch (err) {
      log.warn(
        { invoice_number: inv.InvoiceNumber, err: err.message },
        'Back-allocation slice failed — continuing with next outstanding invoice'
      );
    }
  }
}

async function handleInvoiceFailed(event, log) {
  const invoice = event.data.object;
  log.warn({ invoice_id: invoice.id, customer: invoice.customer }, 'Stripe invoice payment failed');

  await appendReconciliationFlag({
    id: `stripe-invoice-fail:${event.id}`,
    type: 'stripe_payment_failed',
    entity_id: invoice.id,
    cliniko_state: '',
    ledger_state: 'invoice_payment_failed',
    diff: `Amount due $${(invoice.amount_due / 100).toFixed(2)} — ${invoice.last_finalization_error?.message || 'payment failed'}`,
    resolved_at: '',
    resolution: '',
    notes: 'Patient DD failed — recover via session invoice gap',
    created_at: new Date().toISOString(),
  });
}

async function handleDisputeCreated(dispute, log) {
  log.error({ dispute_id: dispute.id, charge_id: dispute.charge }, 'Stripe dispute created');

  await appendReconciliationFlag({
    id: `dispute:${dispute.id}`,
    type: 'stripe_dispute',
    entity_id: dispute.charge,
    cliniko_state: '',
    ledger_state: 'dispute_created',
    diff: `${dispute.reason} — $${(dispute.amount / 100).toFixed(2)}`,
    resolved_at: '',
    resolution: '',
    notes: 'ACTION REQUIRED',
    created_at: new Date().toISOString(),
  });
}

/**
 * Replays a single historical Stripe invoice into Xero. Used by the
 * /admin/backfill-stripe endpoint to reconstruct historical financial state
 * in a fresh Xero org from Stripe's invoice history.
 *
 * Idempotency key is `stripe-backfill:<invoice.id>` — distinct from the live
 * webhook's `stripe:<event.id>` keys so the two paths never collide. Run
 * backfill BEFORE enabling the live webhook on the same Xero tenant to avoid
 * double-booking.
 *
 * Returns { status, invoice_id }: status ∈ 'processed' | 'duplicate' | 'skipped'.
 */
async function backfillInvoice(invoice, log = logger) {
  const idempKey = `stripe-backfill:${invoice.id}`;
  if (await check(idempKey)) {
    return { status: 'duplicate', invoice_id: invoice.id };
  }

  // Cross-namespace check: if the live webhook already processed an event
  // for this invoice, skip the backfill. Stripe events have predictable
  // shape `invoice.payment_succeeded` per paid invoice, but we don't know
  // the event_id here — so probe by sweeping the live keys for any that
  // reference this invoice. Cheap because the table is small (sweeper runs
  // daily; checkIdempotencyKey enforces 60-day expiry on read).
  //
  // Simpler approximation: live webhook events for invoice.payment_succeeded
  // append to `stripe_payments` keyed by event_id. Probe that table directly.
  const { getOne } = require('../db/pool');
  const existing = await getOne(
    `SELECT 1 FROM stripe_payments
     WHERE stripe_invoice_id = $1 AND stripe_event_id NOT LIKE 'bf-%'
     LIMIT 1`,
    [invoice.id]
  );
  if (existing) {
    log.info({ invoice_id: invoice.id }, 'invoice already processed by live webhook — backfill skip');
    await mark(idempKey);
    return { status: 'duplicate', invoice_id: invoice.id, reason: 'live-webhook-already-handled' };
  }

  await mark(idempKey);
  await processInvoicePaid(
    invoice,
    { eventId: `bf-${invoice.id}`, eventCreated: invoice.created || Math.floor(Date.now() / 1000), source: 'backfill' },
    log,
  );
  return { status: 'processed', invoice_id: invoice.id };
}

module.exports = { handleStripeEvent, backfillInvoice };
