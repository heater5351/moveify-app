'use strict';

const { getSecret } = require('../lib/secrets');
const { logger } = require('../lib/logger');

let _stripe = null;

// STRIPE_MODE selects which Stripe credentials to use. Default 'live' (prod
// worker, unchanged). The staging worker sets STRIPE_MODE=test to read the
// `*-test` secrets so it never touches the live Stripe account.
function isTestMode() {
  return process.env.STRIPE_MODE === 'test';
}

async function getStripe() {
  if (_stripe) return _stripe;
  const key = await getSecret(isTestMode() ? 'stripe-secret-key-test' : 'stripe-secret-key');
  _stripe = require('stripe')(key);
  return _stripe;
}

async function getWebhookSecret() {
  return getSecret(isTestMode() ? 'stripe-webhook-secret-test' : 'stripe-webhook-secret');
}

async function constructWebhookEvent(rawBody, sig) {
  const stripe = await getStripe();
  const secret = await getWebhookSecret();
  return stripe.webhooks.constructEvent(rawBody, sig, secret);
}

async function getBalanceTransactions(payoutId) {
  const stripe = await getStripe();
  const txns = [];
  for await (const txn of stripe.balanceTransactions.list({ payout: payoutId, limit: 100 })) {
    txns.push(txn);
  }
  return txns;
}

async function getCharge(chargeId) {
  const stripe = await getStripe();
  return stripe.charges.retrieve(chargeId);
}

async function getCustomer(customerId) {
  const stripe = await getStripe();
  return stripe.customers.retrieve(customerId);
}

async function updateCustomerMetadata(customerId, metadata) {
  const stripe = await getStripe();
  return stripe.customers.update(customerId, { metadata });
}

async function getSubscription(subscriptionId) {
  const stripe = await getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
}

// Returns an active OR trialing subscription for a customer, or null.
// We treat trialing as "subscribed" — the patient is in the credit-consumption
// flow and their session billing should run normally during the trial period.
async function getActiveSubscription(customerId) {
  const stripe = await getStripe();
  const active = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
  if (active.data[0]) return active.data[0];
  const trialing = await stripe.subscriptions.list({ customer: customerId, status: 'trialing', limit: 1 });
  return trialing.data[0] || null;
}

// Returns the active subscription for a Cliniko patient ID.
// Primary: searches Stripe customer metadata for cliniko_id.
// Fallback: searches by email from the Contacts sheet, then caches cliniko_id in metadata.
async function getSubscriptionByClinikoId(clinikoId, patientEmail) {
  const stripe = await getStripe();

  // Primary: metadata search
  const byMeta = await stripe.customers.search({
    query: `metadata['cliniko_id']:'${clinikoId}'`,
    limit: 1,
  });
  if (byMeta.data[0]) {
    return getActiveSubscription(byMeta.data[0].id);
  }

  // Fallback: email search
  if (!patientEmail) return null;
  const byEmail = await stripe.customers.list({ email: patientEmail, limit: 5 });
  if (!byEmail.data.length) return null;

  // Find the customer with an active subscription
  for (const customer of byEmail.data) {
    const sub = await getActiveSubscription(customer.id);
    if (sub) {
      // Cache cliniko_id so future lookups are instant
      await stripe.customers.update(customer.id, { metadata: { cliniko_id: clinikoId } }).catch(() => {});
      return sub;
    }
  }
  return null;
}

// Returns Stripe subscriptions whose lifetime covered the given date — used by
// the appointment poller to verify a patient was a paid/trial subscriber when
// the appointment actually happened, not just "right now".
//
// "Lifetime" = [sub.start_date, sub.ended_at || now]. This catches:
//   - Active subs covering today
//   - Trialing subs covering today
//   - Cancelled subs whose final period covered the appointment date
//     (so we still bill late-polled appointments that occurred while the
//     patient was subscribed, even though they've since cancelled)
// And correctly rejects:
//   - Appointments that happened BEFORE the patient subscribed
//
// Returns array of {subscription, customer}. Empty array if patient is
// unknown to Stripe or no sub covered the date.
async function findSubscriptionsCoveringDate(clinikoId, patientEmail, patientName, dateIso) {
  const stripe = await getStripe();
  const targetMs = new Date(dateIso).getTime();
  if (!Number.isFinite(targetMs)) return { covering: [], reason: 'bad_date' };

  let customers = [];

  // 1) Postgres-cached links written by stripe-handler (upsertStripeClinikoLink)
  // when it resolves a Stripe customer to a Cliniko patient. Carries the load
  // because the live Stripe key is restricted (can't write customer.metadata),
  // so the metadata path below is usually empty. (Previously read a since-
  // deleted Sheets module — the require threw and was silently swallowed,
  // disabling this path entirely; see the Sheets→Postgres migration.)
  try {
    const { getStripeClinikoLinksByClinikoId } = require('./billing-db');
    const links = await getStripeClinikoLinksByClinikoId(clinikoId);
    for (const link of links) {
      try {
        const c = await stripe.customers.retrieve(link.stripe_customer_id);
        if (c && !c.deleted) customers.push(c);
      } catch (_) { /* customer may have been deleted; ignore */ }
    }
  } catch (err) {
    logger.warn({ err: err.message, cliniko_id: clinikoId }, 'Postgres link lookup failed — falling through to metadata/email');
  }

  // 2) Trust explicit cliniko_id metadata on Stripe customers (in case
  // someone set it manually or a future write succeeds).
  if (customers.length === 0) {
    const byMeta = await stripe.customers.search({
      query: `metadata['cliniko_id']:'${clinikoId}'`,
      limit: 5,
    });
    customers = byMeta.data;
  }

  // 3) Email fallback. Even with a single email hit, validate the names
  // agree to defend against stale email data in either system. With multiple
  // hits, disambiguate by name. Refuse if ambiguous.
  //
  // First-name tolerance: exact OR ≥3-char prefix match — handles
  // Doug↔Douglas, Alex↔Alexander etc. Last name must match exactly.
  if (customers.length === 0 && patientEmail) {
    const byEmail = await stripe.customers.list({ email: patientEmail, limit: 10 });
    const pTokens = String(patientName || '').toLowerCase().split(/\s+/).filter(Boolean);
    const pFirst = pTokens[0];
    const pLast = pTokens[pTokens.length - 1];
    const firstNamePrefixOk = (a, b) => {
      if (!a || !b) return false;
      const minLen = Math.min(a.length, b.length);
      return minLen >= 3 && a.substring(0, minLen) === b.substring(0, minLen);
    };
    const nameTokensFit = (c) => {
      if (!pFirst || !pLast || pTokens.length < 2) return false;
      const sTokens = String(c.name || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!sTokens.includes(pLast)) return false;
      return sTokens.some((s) => firstNamePrefixOk(s, pFirst));
    };
    if (byEmail.data.length === 1) {
      // Validate names match — if not, refuse.
      if (nameTokensFit(byEmail.data[0])) customers = byEmail.data;
    } else if (byEmail.data.length > 1) {
      const named = byEmail.data.filter(nameTokensFit);
      if (named.length === 1) customers = named;
      // else: leave customers empty → caller treats as no subscription found
    }
  }

  if (customers.length === 0) {
    logger.info({ cliniko_id: clinikoId, date: dateIso }, 'COVERAGE_DIAG: no candidate customers resolved');
    // No Stripe customer resolvable yet — the patient may subscribe shortly
    // after attending (link written by a later DD). Caller should keep this
    // retryable rather than marking it permanently skipped.
    return { covering: [], reason: 'no_customer' };
  }

  // 7-day grace period BEFORE sub.start_date — handles the common pattern of
  // a patient attending a session and signing up for the subscription during
  // (or immediately after) the same visit. Without grace, those leading-edge
  // sessions get classified as casual and never invoice.
  const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

  const covering = [];
  for (const customer of customers) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 });
    for (const sub of subs.data) {
      const startMs = (sub.start_date || sub.created || 0) * 1000;
      const startWithGraceMs = startMs - GRACE_MS;
      const endMs = sub.ended_at ? sub.ended_at * 1000 : Date.now();
      const inRange = targetMs >= startWithGraceMs && targetMs <= endMs;
      logger.info({
        cliniko_id: clinikoId,
        customer_id: customer.id,
        sub_id: sub.id,
        sub_status: sub.status,
        sub_start: new Date(startMs).toISOString(),
        sub_start_with_grace: new Date(startWithGraceMs).toISOString(),
        sub_end: new Date(endMs).toISOString(),
        appt_date: dateIso,
        in_range: inRange,
      }, 'COVERAGE_DIAG');
      if (inRange) {
        covering.push({ subscription: sub, customer });
      }
    }
  }
  // A Stripe customer exists but no subscription window covers this date
  // (e.g. the appointment predates the patient's first subscription, or falls
  // after cancellation). This is definitively a casual visit as far as the
  // subscription poller is concerned — caller can mark it done so it stops
  // being reconsidered, rather than flagging it as unresolved forever.
  return { covering, reason: covering.length ? 'ok' : 'outside_window' };
}

// ─── Sign-up automation (agreement → setup Checkout → schedule) ──────────────

// Finds an existing Stripe customer by metadata.cliniko_id, else creates one.
// Always (re)writes the agreement metadata so the checkout.session.completed
// handler can read tier/path/start_date back off the customer. Returns the
// customer object.
async function findOrCreateCustomer({ clinikoId, name, email, metadata = {} }) {
  const stripe = await getStripe();
  const merged = { cliniko_id: String(clinikoId), ...metadata };

  const found = await stripe.customers.search({
    query: `metadata['cliniko_id']:'${clinikoId}'`,
    limit: 1,
  });
  if (found.data[0]) {
    return stripe.customers.update(found.data[0].id, {
      metadata: merged,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    });
  }

  return stripe.customers.create({
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    metadata: merged,
  });
}

// Creates a Checkout Session in SETUP mode — collects + saves a payment method
// (card, BECS, wallets, Link) without charging. payment_method_types is omitted
// so Stripe's dashboard-configured dynamic payment methods drive what's shown.
// `currency: 'aud'` so AU methods (incl. au_becs_debit) are eligible.
async function createSetupCheckoutSession({ customerId, successUrl, cancelUrl, metadata = {} }) {
  const stripe = await getStripe();
  return stripe.checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    currency: 'aud',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

// Retrieves a Checkout Session with the setup_intent expanded so the resulting
// payment_method can be read without a second round-trip.
async function retrieveCheckoutSession(sessionId) {
  const stripe = await getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent'] });
}

// Resolves the saved payment method id from a (possibly expanded) setup_intent.
async function getSetupIntentPaymentMethod(setupIntent) {
  const stripe = await getStripe();
  const si = typeof setupIntent === 'string'
    ? await stripe.setupIntents.retrieve(setupIntent)
    : setupIntent;
  if (!si) return null;
  return typeof si.payment_method === 'string'
    ? si.payment_method
    : si.payment_method?.id || null;
}

// Sets the customer's default payment method for invoices. Required before any
// schedule/subscription can auto-charge.
async function setDefaultPaymentMethod(customerId, paymentMethodId) {
  const stripe = await getStripe();
  return stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

// Creates a self-capping Subscription Schedule for a block.
//   - standard block:  one phase, `iterations` weekly debits, end_behavior=cancel.
//   - post-casual:      a trial phase (`trialIterations` free week(s), no charge)
//                       then a paid phase of `iterations` debits, then cancel.
// `default_settings.default_payment_method` is set explicitly so the first
// invoice can auto-charge even if the customer-level default isn't picked up.
async function createSubscriptionSchedule({ customerId, priceId, iterations, trialIterations = 0, paymentMethodId, startDate }) {
  const stripe = await getStripe();
  const phases = [];
  if (trialIterations > 0) {
    phases.push({ items: [{ price: priceId, quantity: 1 }], iterations: trialIterations, trial: true });
  }
  phases.push({ items: [{ price: priceId, quantity: 1 }], iterations });

  return stripe.subscriptionSchedules.create({
    customer: customerId,
    start_date: startDate || 'now',
    end_behavior: 'cancel',
    default_settings: { default_payment_method: paymentMethodId },
    phases,
  });
}

// Creates a plain rolling subscription for continuity tiers (interval baked
// into the Price). No end — cancelled manually on notice. A future startDate is
// expressed as `trial_end` so the first charge lands on that date with no
// proration; a past/empty startDate bills immediately.
async function createSubscription({ customerId, priceId, paymentMethodId, startDate }) {
  const stripe = await getStripe();
  const startSec = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : 0;
  const inFuture = startSec > Math.floor(Date.now() / 1000) + 60;
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    default_payment_method: paymentMethodId,
    ...(inFuture ? { trial_end: startSec } : {}),
  });
}

// Returns the Stripe product name for a subscription (e.g. "T2 Progress")
async function getSubscriptionProductName(subscription) {
  const stripe = await getStripe();
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  return price.product?.name || null;
}

// Returns the product name from the invoice's first line item. Use this in
// preference to getSubscriptionProductName when historical accuracy matters —
// the invoice line captures the tier the patient was billed for at the time,
// not the tier they're on now (which can differ after a tier change).
async function getProductNameFromInvoice(invoice) {
  const stripe = await getStripe();
  const line = invoice.lines?.data?.[0];
  if (!line) return null;
  // Stripe webhook invoices have `price` expanded; backfilled invoices may
  // need an explicit fetch. Handle both.
  const priceId = line.price?.id || line.pricing?.price_details?.price;
  if (!priceId) return null;
  const price = typeof line.price === 'object' && line.price.product
    ? line.price
    : await stripe.prices.retrieve(priceId, { expand: ['product'] });
  // Product may be an ID string or an expanded object
  if (typeof price.product === 'object' && price.product?.name) {
    return price.product.name;
  }
  if (typeof price.product === 'string') {
    const prod = await stripe.products.retrieve(price.product);
    return prod.name || null;
  }
  return null;
}

// Resolves the Stripe processing fee for a paid invoice. Stripe nets this fee
// out of the payout, so it must be booked as an expense for the Stripe clearing
// account to reconcile against the (net) bank deposit. The fee comes from the
// charge's balance_transaction. In AU, balance_transaction.fee is GST-inclusive.
//
// Returns { fee, currency, chargeId, balanceTransactionId } in dollars, or null
// if the charge / balance transaction can't be resolved yet (some async payment
// methods settle the balance transaction after the invoice.payment_succeeded
// webhook — card payments expose it immediately, which is our case).
async function getInvoiceFee(invoice) {
  const stripe = await getStripe();

  let chargeId = typeof invoice.charge === 'string'
    ? invoice.charge
    : invoice.charge?.id || null;

  // Newer Stripe API versions drop invoice.charge — resolve via the payment intent.
  if (!chargeId) {
    const piId = typeof invoice.payment_intent === 'string'
      ? invoice.payment_intent
      : invoice.payment_intent?.id || null;
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId);
      chargeId = typeof pi.latest_charge === 'string'
        ? pi.latest_charge
        : pi.latest_charge?.id || null;
    }
  }

  if (!chargeId) return null;

  const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
  const bt = charge.balance_transaction;
  if (!bt || typeof bt === 'string') return null; // not settled yet

  return {
    fee: Number((bt.fee / 100).toFixed(2)),
    currency: bt.currency,
    chargeId,
    balanceTransactionId: bt.id,
  };
}

module.exports = {
  getStripe,
  constructWebhookEvent,
  getBalanceTransactions,
  getInvoiceFee,
  getCharge,
  getCustomer,
  updateCustomerMetadata,
  getActiveSubscription,
  getSubscription,
  getSubscriptionByClinikoId,
  findSubscriptionsCoveringDate,
  getSubscriptionProductName,
  getProductNameFromInvoice,
  findOrCreateCustomer,
  createSetupCheckoutSession,
  retrieveCheckoutSession,
  getSetupIntentPaymentMethod,
  setDefaultPaymentMethod,
  createSubscriptionSchedule,
  createSubscription,
};
