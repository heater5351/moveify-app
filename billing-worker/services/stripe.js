'use strict';

const { getSecret } = require('../lib/secrets');

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

// Returns the active subscription for a customer, or null
async function getActiveSubscription(customerId) {
  const stripe = await getStripe();
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
  return subs.data[0] || null;
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

// Returns the Stripe product name for a subscription (e.g. "T2 Progress")
async function getSubscriptionProductName(subscription) {
  const stripe = await getStripe();
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  return price.product?.name || null;
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
  getSubscriptionProductName,
};
