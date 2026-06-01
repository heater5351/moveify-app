'use strict';

// Maps Cliniko `appointment_type.name` (verbatim) → Xero invoice metadata.
// Source: Moveify billable-items list confirmed 2026-05-10.
//
// Pricing rule:
//   GPCCMP and Private variants share the same casual price. They differ only
//   in the item code (10953 = Medicare CDM, 102/202 = private) which steers
//   the downstream claim path. The dollar amount on the Xero invoice is the
//   same; the routing differs.
//
// Subscription-credit handling:
//   GPCCMP-coded appointments are NOT auto-skipped — a subscribed patient
//   attending a GPCCMP session still consumes credit from their overpayment.
//   The 10953 item code on the invoice description signals Medicare claim
//   routing downstream (manual via THO, out of scope for the worker). The
//   poller's subscription-coverage check is the gate: subscribed patient
//   on the appointment date → invoiced and allocated; unsubscribed → skipped.
//
// `funder` field meaning (read by poll-cliniko-appointments.js):
//   Only services with funder ∈ { 'NDIS', 'RTWSA', 'DVA' } are skipped via
//   the funder tag — those have their own non-subscription pipelines
//   (`runNdisRtwsa`, Tyro CSV). Medicare-routed (GPCCMP) and Manual-routed
//   (pre-subscription initial assessments) flow through normal subscription
//   coverage; if no sub covers the appointment, they're silently skipped
//   and recorded for manual handling.
//
// Lookup is normalised (lowercased + whitespace-collapsed) so casing and
// minor spacing variants all map to the same entry.
//
// All prices are GST-free allied health services (account 200, EXEMPTOUTPUT).

const SERVICES = {
  // Group consultations
  'Exercise Physiology Group Consultation': {
    code: '502', casualPrice: 30.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Initial assessments — $61.81 flat (matches Medicare 10953 rebate).
  // Typically pre-subscription so naturally skipped via subscription gate;
  // for returning subscribed patients who reassess, they'll be invoiced and
  // allocated normally.
  'Exercise Physiology Initial Assessment (GPCCMP)': {
    code: '10953', casualPrice: 61.81, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Exercise Physiology Initial Assessment (Private)': {
    code: '102', casualPrice: 61.81, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Phone check-in
  'Exercise Physiology Phone Check In': {
    code: null, casualPrice: 50.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Reassessments
  'Exercise Physiology Reassessment - 30 mins (GPCCMP)': {
    code: '10953', casualPrice: 85.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Exercise Physiology Reassessment - 30 mins (Private)': {
    code: '202', casualPrice: 85.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Program Setup 60-min (= first paid 1:1 of a new program). Billed at the
  // Subsequent-60min rate; Cliniko names it "Program Setup" but the line item
  // is the same as a 60-min subsequent.
  'Program Setup Exercise Physiology Consultation - 60 mins (GPCCMP)': {
    code: '10953', casualPrice: 170.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Program Setup Exercise Physiology Consultation - 60 mins (Private)': {
    code: '202', casualPrice: 170.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Subsequent consultations
  'Subsequent Exercise Physiology Consultation - 30 mins (GPCCMP)': {
    code: '10953', casualPrice: 85.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Subsequent Exercise Physiology Consultation - 30 mins (Private)': {
    code: '202', casualPrice: 85.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Subsequent Exercise Physiology Consultation - 45 mins (GPCCMP)': {
    code: '10953', casualPrice: 130.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Subsequent Exercise Physiology Consultation - 45 mins (Private)': {
    code: '202', casualPrice: 130.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Subsequent Exercise Physiology Consultation - 60 mins (GPCCMP)': {
    code: '10953', casualPrice: 170.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Subsequent Exercise Physiology Consultation - 60 mins (Private)': {
    code: '202', casualPrice: 170.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
};

const _normalisedIndex = new Map(
  Object.entries(SERVICES).map(([name, svc]) => [normalise(name), { name, ...svc }])
);

function normalise(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function lookup(appointmentTypeName) {
  return _normalisedIndex.get(normalise(appointmentTypeName)) || null;
}

// ─── Subscription plans (sign-up automation) ─────────────────────────────────
//
// Maps the operator-chosen { tier, path } to the Stripe product + the schedule
// shape the `checkout.session.completed` handler builds. Keyed `${path}:${tier}`.
//
// `productName` MUST match a key in lib/rates.js `PP_FEES` verbatim — the
// downstream P&P-fee + entitlement logic resolves the tier from the Stripe
// product name on the paid invoice. A mismatch silently breaks P&P billing.
// (Em dashes in the post-casual names are intentional and must match Stripe.)
//
// `priceEnv` names a Cloud Run env var holding the Stripe Price ID, so test and
// live modes use different Prices without code changes. getPlanPriceId() reads it.
//
// shape:
//   'block'        → Subscription Schedule, `iterations` weekly debits, end_behavior=cancel
//   'post_casual'  → Schedule: `trialIterations` free week(s) → `iterations` debits → cancel
//   'continuity'   → plain rolling Subscription (interval baked into the Price), no end
const SUBSCRIPTION_PLANS = {
  // Block standard — weekly DD, 6 debits, auto-cancel
  'standard:T1': { productName: 'T1 Foundation',  priceEnv: 'STRIPE_PRICE_T1_STANDARD', shape: 'block', iterations: 6 },
  'standard:T2': { productName: 'T2 Progress',    priceEnv: 'STRIPE_PRICE_T2_STANDARD', shape: 'block', iterations: 6 },
  'standard:T3': { productName: 'T3 Performance', priceEnv: 'STRIPE_PRICE_T3_STANDARD', shape: 'block', iterations: 6 },

  // Post-casual — 1 free week (trial), then 5 weekly debits, auto-cancel
  'post_casual:T1': { productName: 'Tier 1 — Foundation Block Post-Casual',  priceEnv: 'STRIPE_PRICE_T1_POST_CASUAL', shape: 'post_casual', trialIterations: 1, iterations: 5 },
  'post_casual:T2': { productName: 'Tier 2 — Progress Block Post-Casual',    priceEnv: 'STRIPE_PRICE_T2_POST_CASUAL', shape: 'post_casual', trialIterations: 1, iterations: 5 },
  'post_casual:T3': { productName: 'Tier 3 — Performance Block Post-Casual', priceEnv: 'STRIPE_PRICE_T3_POST_CASUAL', shape: 'post_casual', trialIterations: 1, iterations: 5 },

  // Continuity — plain rolling subscription (4-weekly interval baked into the Price)
  'continuity:Independent':        { productName: 'Independent',        priceEnv: 'STRIPE_PRICE_INDEPENDENT',         shape: 'continuity' },
  'continuity:Maintain':           { productName: 'Maintain',           priceEnv: 'STRIPE_PRICE_MAINTAIN',            shape: 'continuity' },
  'continuity:Evolve':             { productName: 'Evolve',             priceEnv: 'STRIPE_PRICE_EVOLVE',              shape: 'continuity' },
  'continuity:Elite':              { productName: 'Elite',              priceEnv: 'STRIPE_PRICE_ELITE',               shape: 'continuity' },
  'continuity:Remote Weekly':      { productName: 'Remote Weekly',      priceEnv: 'STRIPE_PRICE_REMOTE_WEEKLY',       shape: 'continuity' },
  'continuity:Remote Fortnightly': { productName: 'Remote Fortnightly', priceEnv: 'STRIPE_PRICE_REMOTE_FORTNIGHTLY',  shape: 'continuity' },
  'continuity:App-Only':           { productName: 'App-Only',           priceEnv: 'STRIPE_PRICE_APP_ONLY',            shape: 'continuity' },
};

const SUBSCRIPTION_PATHS = ['standard', 'post_casual', 'continuity'];

function planKey(tier, path) {
  return `${String(path || '').trim()}:${String(tier || '').trim()}`;
}

// Resolves { tier, path } to a plan definition, or null if unknown.
function lookupPlan(tier, path) {
  return SUBSCRIPTION_PLANS[planKey(tier, path)] || null;
}

// Resolves a plan's Stripe Price ID from the env var it names. Returns null if
// the env var is unset (so callers can flag a config gap rather than 500).
function getPlanPriceId(plan) {
  if (!plan || !plan.priceEnv) return null;
  return process.env[plan.priceEnv] || null;
}

module.exports = {
  SERVICES,
  lookup,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PATHS,
  lookupPlan,
  getPlanPriceId,
};
