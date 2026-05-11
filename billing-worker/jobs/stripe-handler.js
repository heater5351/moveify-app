'use strict';

const {
  getCustomer,
  updateCustomerMetadata,
  getSubscription,
  getSubscriptionProductName,
} = require('../services/stripe');
const {
  getTab,
  appendStripePayment,
  appendReconciliationFlag,
} = require('../services/sheets');
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
async function resolveClinikoPatient(customer, log) {
  if (customer.metadata?.cliniko_id) return customer.metadata.cliniko_id;

  const contacts = await getTab('Contacts');
  const email = (customer.email || '').toLowerCase().trim();
  const name = (customer.name || '').toLowerCase().trim();

  let match = email
    ? contacts.find((c) => (c.email || '').toLowerCase().trim() === email)
    : null;

  if (!match && name) {
    match = contacts.find((c) => {
      const contactName = (c.name || '').toLowerCase().trim();
      return contactName === name || contactName.includes(name) || name.includes(contactName);
    });
  }

  if (!match) {
    log.warn({ customer_id: customer.id }, 'No matching Cliniko patient for Stripe customer');
    await appendReconciliationFlag({
      id: `stripe-patient-not-found:${customer.id}`,
      type: 'stripe_patient_not_found',
      entity_id: customer.id,
      cliniko_state: '',
      ledger_state: `Stripe customer email: ${email}`,
      diff: 'No Cliniko patient matched by email or name',
      resolved_at: '',
      resolution: '',
      notes: 'Check patient email in both Cliniko and Stripe',
      created_at: new Date().toISOString(),
    });
    return null;
  }

  await updateCustomerMetadata(customer.id, { cliniko_id: match.cliniko_id }).catch((err) =>
    log.warn({ err: err.message }, 'Failed to cache cliniko_id in Stripe metadata')
  );

  log.info({ customer_id: customer.id, cliniko_id: match.cliniko_id }, 'Linked Stripe customer to Cliniko patient');
  return match.cliniko_id;
}

async function handleInvoicePaid(event, log) {
  const invoice = event.data.object;
  log.info({ invoice_id: invoice.id, amount: invoice.amount_paid }, 'Processing invoice.payment_succeeded');

  if (!invoice.customer) {
    log.warn({ invoice_id: invoice.id }, 'No customer on invoice — skipping');
    return;
  }

  const clearingAccountId = process.env.XERO_STRIPE_CLEARING_ACCOUNT_ID;
  if (!clearingAccountId) {
    log.error({ invoice_id: invoice.id }, 'XERO_STRIPE_CLEARING_ACCOUNT_ID not set — cannot create overpayment');
    await appendReconciliationFlag({
      id: `stripe-config-missing:${event.id}`,
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
  if (subscriptionId) {
    subscription = await getSubscription(subscriptionId).catch((err) => {
      log.warn({ err: err.message, subscription_id: subscriptionId }, 'Failed to retrieve subscription');
      return null;
    });
    if (subscription) {
      productName = await getSubscriptionProductName(subscription).catch(() => null);
    }
  }

  if (!productName) {
    await appendReconciliationFlag({
      id: `stripe-no-product:${event.id}`,
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
    : (invoice.created || event.created) * 1000;
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
      id: `stripe-contact-fail:${event.id}`,
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
      id: `stripe-overpayment-fail:${event.id}`,
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
    productName,
    clinikoId,
    xeroContactId,
    overpaymentId,
    overpaymentAmount: amountDollars,
    log,
  });

  // Ledger append is best-effort. Xero records (the source of truth) are
  // already committed at this point — a Sheets quota / API blip here must not
  // surface as a handler failure or trigger a Stripe webhook retry that would
  // create duplicate Xero records (idempotency keys are already marked).
  try {
    await appendStripePayment({
      stripe_event_id: event.id,
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
        event_id: event.id,
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
 * Cycle anchor = invoice.period_start. Idempotency key = pp:<cliniko>:<period_start>
 * — one P&P invoice per patient per cycle, ever.
 */
async function maybeCreatePpInvoice({ invoice, productName, clinikoId, xeroContactId, overpaymentId, overpaymentAmount, log }) {
  if (!productName) return null;

  const ppFee = getPpFee(productName);
  if (!ppFee || !ppFee.amount || ppFee.amount === 0) {
    log.debug({ product: productName }, 'No P&P fee for this product — skipping P&P invoice');
    return null;
  }

  const periodStart = invoice.period_start
    ? new Date(invoice.period_start * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const periodEnd = invoice.period_end
    ? new Date(invoice.period_end * 1000).toISOString().slice(0, 10)
    : '';

  const ppKey = `pp:${clinikoId}:${periodStart}`;
  if (await check(ppKey)) {
    log.info({ cliniko_id: clinikoId, period_start: periodStart }, 'P&P invoice already created for this cycle');
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

module.exports = { handleStripeEvent };
