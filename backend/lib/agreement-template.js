'use strict';

// Canonical service-agreement copy (Part A — clinical services) and tier labels
// for the sign-up automation. Part B (the BECS/card Direct Debit authorisation)
// is captured by Stripe Checkout, NOT here — do not duplicate it in this text.
//
// ⚠ PLACEHOLDER COPY. The final Part A wording + version string must be confirmed
// with Ryan (see the plan's "Open items"). When the canonical text lands, bump
// AGREEMENT_VERSION so previously-signed agreements stay attributable to the
// exact wording the patient saw. The version is stored on each signed row.
const AGREEMENT_VERSION = 'partA-draft-2026-06-01';

const PART_A_TITLE = 'Moveify Health Solutions — Service Agreement';

// Plain paragraphs; rendered to PDF and shown on the sign page. Keep prose only
// (no health data, no patient specifics — those are merged in at render time).
const PART_A_PARAGRAPHS = [
  'This agreement is between Moveify Health Solutions and the client named below for the provision of Exercise Physiology and related allied-health services.',
  'Services are delivered by Accredited Exercise Physiologists and may include individual consultations, group sessions, exercise programming, and remote check-ins as appropriate to the selected program.',
  'The client understands that exercise carries inherent risks and agrees to disclose relevant medical history and to report any pain, discomfort, or adverse symptoms to their practitioner.',
  'Fees for the selected program are set out in the program summary below and are billed by Direct Debit (card or bank account) via our payment provider, Stripe. Block programs run for a fixed number of payments and then end automatically; continuity programs continue until cancelled with the required notice.',
  'Cancellation, refund, and notice terms are as described in the Moveify cancellation policy provided to the client. Continuity memberships require two weeks’ written notice to cancel.',
  'By signing below, the client confirms they have read and understood this agreement, consent to the collection and handling of their health information in accordance with the Moveify Privacy Policy, and authorise the selected program and its associated fees.',
];

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

module.exports = {
  AGREEMENT_VERSION,
  PART_A_TITLE,
  PART_A_PARAGRAPHS,
  TIER_LABELS,
  VALID_PATHS,
  tierLabel,
};
