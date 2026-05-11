'use strict';

const { getSecret } = require('../lib/secrets');
const { logger } = require('../lib/logger');

let _stripe = null;

async function getStripe() {
  if (_stripe) return _stripe;
  const key = await getSecret('stripe-secret-key');
  _stripe = require('stripe')(key);
  return _stripe;
}

async function getWebhookSecret() {
  return getSecret('stripe-webhook-secret');
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
  if (!Number.isFinite(targetMs)) return [];

  let customers = [];

  // 1) Sheets-cached links written by stripe-handler when it successfully
  // resolves a Stripe customer to a Cliniko patient. Carries the load when
  // the Stripe API key is restricted (can't write customer.metadata).
  try {
    const { getTab } = require('./sheets');
    const links = await getTab('StripeClinikoLinks');
    const matched = links.filter((r) => String(r.cliniko_id) === String(clinikoId));
    for (const link of matched) {
      try {
        const c = await stripe.customers.retrieve(link.stripe_customer_id);
        if (c && !c.deleted) customers.push(c);
      } catch (_) { /* customer may have been deleted; ignore */ }
    }
  } catch (_) { /* Sheets unavailable — fall through to other paths */ }

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
    return [];
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
  return covering;
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

module.exports = {
  getStripe,
  constructWebhookEvent,
  getBalanceTransactions,
  getCharge,
  getCustomer,
  updateCustomerMetadata,
  getActiveSubscription,
  getSubscription,
  getSubscriptionByClinikoId,
  findSubscriptionsCoveringDate,
  getSubscriptionProductName,
  getProductNameFromInvoice,
};
