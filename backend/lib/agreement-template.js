'use strict';

// Canonical service-agreement copy (Part A — clinical services) and tier labels
// for the sign-up automation. Part B (the BECS/card Direct Debit authorisation)
// is captured by Stripe Checkout, NOT here — do not duplicate it in this text.
//
// ⚠ The clinical Part A prose below is still DRAFT and must be confirmed with Ryan
// (see the plan's "Open items"). The billing terms (PLAN_BILLING + billingTerms())
// are concrete and match the Stripe Prices / schedule shapes the worker creates.
// When the canonical Part A text lands, bump AGREEMENT_VERSION so previously-signed
// agreements stay attributable to the exact wording the patient saw. The version
// is stored on each signed row.
const AGREEMENT_VERSION = 'partA-2026-06-02';

const PART_A_TITLE = 'Moveify Health Solutions — Service Agreement';

// Plain paragraphs; rendered to PDF and shown on the sign page. Keep prose only
// (no health data, no patient specifics — those are merged in at render time).
// The specific charge mechanics (amount, cadence, when the first charge lands)
// live in billingTerms() below and are rendered as their own section, so these
// paragraphs stay general.
const PART_A_PARAGRAPHS = [
  'This agreement is between Moveify Health Solutions and the client named below for the provision of Exercise Physiology and related allied-health services.',
  'Services are delivered by Accredited Exercise Physiologists and may include individual consultations, group sessions, exercise programming, and remote check-ins as appropriate to the selected program.',
  'The client understands that exercise carries inherent risks and agrees to disclose relevant medical history and to report any pain, discomfort, or adverse symptoms to their practitioner.',
  'Fees for the selected program are billed by Direct Debit (card or bank account) via our payment provider, Stripe, as set out in the Payment Authorisation below. Block programs run for a fixed number of payments and then end automatically; continuity programs continue until cancelled with the required notice.',
  'Cancellation, refund, and notice terms are as described in the Moveify cancellation policy provided to the client. Continuity memberships require two weeks’ written notice to cancel.',
  'By signing below, the client confirms they have read and understood this agreement, consent to the collection and handling of their health information in accordance with the Moveify Privacy Policy, and authorise the selected program and its associated fees.',
];

// How charges appear on the client's bank/card statement (Stripe descriptor).
const STATEMENT_DESCRIPTOR = 'MOVEIFY HEALTH';

// Per-plan billing facts, keyed `${path}:${tier}` (mirrors TIER_LABELS and the
// worker's SUBSCRIPTION_PLANS). `amountCents` MUST match the Stripe Price for the
// plan — i.e. billing-worker/scripts/create-agreement-prices.js PLAN_PRICING. If
// you change a price there, change it here too, or the signed authorisation will
// quote the wrong amount. `paidPayments`/`freeWeeks` mirror the schedule shape the
// worker's checkout.session.completed handler builds:
//   block       → paidPayments weekly debits, no free week, then auto-cancel
//   post_casual → 1 free trial week, then paidPayments weekly debits, then cancel
//   continuity  → rolling every 4 weeks until cancelled (no fixed count)
const PLAN_BILLING = {
  // Block standard — weekly, 6 debits
  'standard:T1': { amountCents: 7667,  shape: 'block', intervalWeeks: 1, paidPayments: 6, freeWeeks: 0 },
  'standard:T2': { amountCents: 11333, shape: 'block', intervalWeeks: 1, paidPayments: 6, freeWeeks: 0 },
  'standard:T3': { amountCents: 14333, shape: 'block', intervalWeeks: 1, paidPayments: 6, freeWeeks: 0 },
  // Post-casual — 1 free week, then 5 weekly debits
  'post_casual:T1': { amountCents: 5800,  shape: 'post_casual', intervalWeeks: 1, paidPayments: 5, freeWeeks: 1 },
  'post_casual:T2': { amountCents: 10200, shape: 'post_casual', intervalWeeks: 1, paidPayments: 5, freeWeeks: 1 },
  'post_casual:T3': { amountCents: 13800, shape: 'post_casual', intervalWeeks: 1, paidPayments: 5, freeWeeks: 1 },
  // Continuity — rolling every 4 weeks
  'continuity:Independent':        { amountCents: 14000, shape: 'continuity', intervalWeeks: 4 },
  'continuity:Maintain':           { amountCents: 22000, shape: 'continuity', intervalWeeks: 4 },
  'continuity:Evolve':             { amountCents: 28500, shape: 'continuity', intervalWeeks: 4 },
  'continuity:Elite':              { amountCents: 52000, shape: 'continuity', intervalWeeks: 4 },
  'continuity:Remote Weekly':      { amountCents: 20000, shape: 'continuity', intervalWeeks: 4 },
  'continuity:Remote Fortnightly': { amountCents: 10000, shape: 'continuity', intervalWeeks: 4 },
  'continuity:App-Only':           { amountCents: 4000,  shape: 'continuity', intervalWeeks: 4 },
};

// $220 for whole dollars, $76.67 otherwise.
function formatMoney(cents) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

// Human-readable labels for the tier/path the operator selected, shown to the
// patient as a read-only summary. Keys mirror lib service-catalog plan keys on
// the worker; kept here so the backend can render without a worker round-trip.
const TIER_LABELS = {
  'standard:T1': 'Tier 1 — Foundation (Block)',
  'standard:T2': 'Tier 2 — Progress (Block)',
  'standard:T3': 'Tier 3 — Performance (Block)',
  'post_casual:T1': 'Tier 1 — Foundation (Post-Casual Block)',
  'post_casual:T2': 'Tier 2 — Progress (Post-Casual Block)',
  'post_casual:T3': 'Tier 3 — Performance (Post-Casual Block)',
  'continuity:Independent': 'Independent (Continuity)',
  'continuity:Maintain': 'Maintain (Continuity)',
  'continuity:Evolve': 'Evolve (Continuity)',
  'continuity:Elite': 'Elite (Continuity)',
  'continuity:Remote Weekly': 'Remote Weekly (Continuity)',
  'continuity:Remote Fortnightly': 'Remote Fortnightly (Continuity)',
  'continuity:App-Only': 'App-Only (Continuity)',
};

const VALID_PATHS = ['standard', 'post_casual', 'continuity'];

function planKey(tier, path) {
  return `${String(path || '').trim()}:${String(tier || '').trim()}`;
}

// Returns the display label for a tier/path, or null if the combination is unknown.
function tierLabel(tier, path) {
  return TIER_LABELS[planKey(tier, path)] || null;
}

// Builds the plan-specific Payment Authorisation + "When Charges Occur" copy that
// the patient signs. Wording is accurate to the shape the worker actually creates:
//   - continuity → first charge at the start date (or at payment setup), then
//                  every 28 days, rolling until cancelled.
//   - block      → first charge at the start date (or at payment setup), then
//                  weekly for a fixed number of debits, then auto-ends.
//   - post_casual→ first week free (no charge), first debit 7 days after start,
//                  then weekly for a fixed number of debits, then auto-ends.
// `startDate` (YYYY-MM-DD or null) is the operator-chosen program start; when set
// the copy names the exact date, otherwise it refers to "payment setup".
// Returns { summary, authorisation, whenChargesTitle, whenCharges } or null.
function billingTerms(tier, path, startDate) {
  const b = PLAN_BILLING[planKey(tier, path)];
  if (!b) return null;

  const money = formatMoney(b.amountCents);
  const startRef = startDate ? `on ${startDate}` : 'when you complete payment setup';
  const startNoun = startDate ? startDate : 'the date of payment setup';
  const confirmation = 'You will receive a payment confirmation from Stripe at the time of authorisation.';
  const nonBusiness = 'If a charge date falls on a non-business day it will be processed on the next business day.';
  const descriptor = `Charges will appear on your statement as "${STATEMENT_DESCRIPTOR}" or similar.`;
  const authPrefix = 'By completing the payment setup at the link provided at the end of this document, you authorise Moveify Health Solutions to charge your nominated card or debit your nominated bank account';

  if (b.shape === 'continuity') {
    return {
      summary: `${money} every 4 weeks (rolling)`,
      authorisation: `${authPrefix} ${money} every 4 weeks on a rolling basis until you cancel with the required two weeks’ written notice. ${confirmation}`,
      whenChargesTitle: 'When Charges Occur',
      whenCharges: `Your first charge of ${money} occurs ${startRef}, and subsequent charges occur every 28 days from that date. ${nonBusiness} ${descriptor}`,
    };
  }

  if (b.shape === 'post_casual') {
    const total = formatMoney(b.amountCents * b.paidPayments);
    return {
      summary: `1 free week, then ${money}/week × ${b.paidPayments} (total ${total})`,
      authorisation: `${authPrefix} ${money} per week for this block. Your first week is complimentary (no charge), followed by ${b.paidPayments} weekly payments totalling ${total}. After the final payment the block ends automatically and no further charges are made. ${confirmation}`,
      whenChargesTitle: 'When Charges Occur',
      whenCharges: `No charge is made at payment setup — your first week is free. Your first charge of ${money} occurs 7 days after ${startNoun}, with the remaining ${b.paidPayments - 1} weekly charges every 7 days thereafter. The final, ${b.paidPayments}th charge completes the block. ${nonBusiness} ${descriptor}`,
    };
  }

  // block (standard) — weekly, fixed number of debits
  const total = formatMoney(b.amountCents * b.paidPayments);
  return {
    summary: `${money}/week × ${b.paidPayments} (total ${total})`,
    authorisation: `${authPrefix} ${money} per week for ${b.paidPayments} weeks, totalling ${total} over the block. After the final payment the block ends automatically and no further charges are made. ${confirmation}`,
    whenChargesTitle: 'When Charges Occur',
    whenCharges: `Your first charge of ${money} occurs ${startRef}, with the remaining ${b.paidPayments - 1} weekly charges every 7 days thereafter. The final, ${b.paidPayments}th charge completes the block. ${nonBusiness} ${descriptor}`,
  };
}

module.exports = {
  AGREEMENT_VERSION,
  PART_A_TITLE,
  PART_A_PARAGRAPHS,
  TIER_LABELS,
  VALID_PATHS,
  STATEMENT_DESCRIPTOR,
  PLAN_BILLING,
  formatMoney,
  tierLabel,
  billingTerms,
};
