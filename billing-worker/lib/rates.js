'use strict';

/**
 * Maps Cliniko appointment type name → exact billable item name + price.
 * Billable item names must match exactly what is configured in Cliniko.
 */
const APPOINTMENT_RATE_MAP = {
  // Group
  'Exercise Physiology Group Consultation': {
    billableItem: '(502) Exercise Physiology Group Consultation',
    amount: 30.00,
    claimable: false,
  },

  // Initial assessments
  'Exercise Physiology Initial Assessment (GPCCMP)': {
    billableItem: '(10953) Exercise Physiology Initial Assessment - GP CCMP',
    amount: 61.81,
    claimable: true,
  },
  'Exercise Physiology Initial Assessment (Private)': {
    billableItem: '(102) Exercise Physiology Initial Assessment - Private',
    amount: 61.81,
    claimable: true,
  },

  // Phone check-in
  'Exercise Physiology Phone Check In': {
    billableItem: 'Phone Check In',
    amount: 50.00,
    claimable: false,
  },

  // Reassessments (30 min)
  'Exercise Physiology Reassessment - 30 mins (GPCCMP)': {
    billableItem: '(10953) Subsequent Exercise Physiology Consultation - 30 mins GPCCMP',
    amount: 85.00,
    claimable: true,
  },
  'Exercise Physiology Reassessment - 30 mins (Private)': {
    billableItem: '(202) Subsequent Exercise Physiology Consultation - 30 mins Private',
    amount: 85.00,
    claimable: true,
  },

  // Program setup (60 min)
  'Program Setup Exercise Physiology Consultation - 60 mins (GPCCMP)': {
    billableItem: '(10953) Subsequent Exercise Physiology Consultation - 60 mins GPCCMP',
    amount: 170.00,
    claimable: true,
  },
  'Program Setup Exercise Physiology Consultation - 60 mins (Private)': {
    billableItem: '(202) Subsequent Exercise Physiology Consultation - 60 mins Private',
    amount: 170.00,
    claimable: true,
  },

  // Subsequent 30 min
  'Subsequent Exercise Physiology Consultation - 30 mins (GPCCMP)': {
    billableItem: '(10953) Subsequent Exercise Physiology Consultation - 30 mins GPCCMP',
    amount: 85.00,
    claimable: true,
  },
  'Subsequent Exercise Physiology Consultation - 30 mins (Private)': {
    billableItem: '(202) Subsequent Exercise Physiology Consultation - 30 mins Private',
    amount: 85.00,
    claimable: true,
  },

  // Subsequent 45 min (note: Cliniko has capital M in one)
  'Subsequent Exercise Physiology Consultation - 45 Mins (GPCCMP)': {
    billableItem: '(10953) Subsequent Exercise Physiology Consultation - 45 mins GPCCMP',
    amount: 130.00,
    claimable: true,
  },
  'Subsequent Exercise Physiology Consultation - 45 mins (Private)': {
    billableItem: '(202) Subsequent Exercise Physiology Consultation - 45 mins Private',
    amount: 130.00,
    claimable: true,
  },
};

/**
 * Program & Platform billable item names and amounts by Stripe product name.
 * Billable item names must match exactly what is configured in Cliniko.
 */
// Entitlements: appointment types that a subscription product covers. The
// appointment poller invoices + allocates from credit only when the attended
// service matches one of these names. Anything else is treated as casual
// (skipped, settled via Tyro at the desk) even if the patient is subscribed.
// Source: SOP v6 § 4d/4f + Part-Time Pricing v3 §§ 3, 5, 6.
//
// (V1: type whitelist only. Counts/quotas — e.g. "4 group sessions per block"
// — are not yet enforced. Over-attended patients would over-invoice and may
// flag as insufficient_credit; deliberate trade-off for ship speed.)
const STD_BLOCK_T1 = [
  'Program Setup Exercise Physiology Consultation - 60 mins (Private)',
  'Program Setup Exercise Physiology Consultation - 60 mins (GPCCMP)',
  'Exercise Physiology Group Consultation',
  'Exercise Physiology Reassessment - 30 mins (Private)',
  'Exercise Physiology Reassessment - 30 mins (GPCCMP)',
];
const STD_BLOCK_T2_T3 = [
  'Program Setup Exercise Physiology Consultation - 60 mins (Private)',
  'Program Setup Exercise Physiology Consultation - 60 mins (GPCCMP)',
  'Subsequent Exercise Physiology Consultation - 30 mins (Private)',
  'Subsequent Exercise Physiology Consultation - 30 mins (GPCCMP)',
  'Subsequent Exercise Physiology Consultation - 45 mins (Private)',
  'Subsequent Exercise Physiology Consultation - 45 mins (GPCCMP)',
  'Exercise Physiology Reassessment - 30 mins (Private)',
  'Exercise Physiology Reassessment - 30 mins (GPCCMP)',
];
// Post-casual variants exclude Program Setup ($170 paid casually before the
// block starts; only the remaining sessions are covered by the subscription).
const POST_CASUAL_T1 = STD_BLOCK_T1.filter((s) => !s.startsWith('Program Setup'));
const POST_CASUAL_T2_T3 = STD_BLOCK_T2_T3.filter((s) => !s.startsWith('Program Setup'));

const PP_FEES = {
  'T1 Foundation':      { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block',    entitlements: STD_BLOCK_T1 },
  'T2 Progress':        { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block',    entitlements: STD_BLOCK_T2_T3 },
  'T3 Performance':     { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block',    entitlements: STD_BLOCK_T2_T3 },
  // Post-casual variants — same per-block P&P ($85). The $170 program design
  // was paid casually before the block started; the block fee covers gym + app
  // + P&P for the remaining 5 weeks. Em dash in the name is intentional and
  // must match Stripe verbatim.
  'Tier 1 — Foundation Block Post-Casual':  { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block', entitlements: POST_CASUAL_T1 },
  'Tier 2 — Progress Block Post-Casual':    { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block', entitlements: POST_CASUAL_T2_T3 },
  'Tier 3 — Performance Block Post-Casual': { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block', entitlements: POST_CASUAL_T2_T3 },
  // Independent: 1 monthly 1:1 review (30-min reassessment). No groups.
  'Independent':        { billableItem: 'Gym & App Access - Independent',                 amount: 55.00, billing: '4-weekly', entitlements: ['Exercise Physiology Reassessment - 30 mins (Private)', 'Exercise Physiology Reassessment - 30 mins (GPCCMP)', 'Subsequent Exercise Physiology Consultation - 30 mins (Private)', 'Subsequent Exercise Physiology Consultation - 30 mins (GPCCMP)'] },
  // One-off discounted variant of Independent — $140 → $120 DD; the $20
  // discount applies to the P&P portion, sessions retain their standard rate.
  'Independent - Discounted': { billableItem: 'Gym & App Access - Independent',           amount: 35.00, billing: '4-weekly', entitlements: ['Exercise Physiology Reassessment - 30 mins (Private)', 'Exercise Physiology Reassessment - 30 mins (GPCCMP)', 'Subsequent Exercise Physiology Consultation - 30 mins (Private)', 'Subsequent Exercise Physiology Consultation - 30 mins (GPCCMP)'] },
  // Maintain: 4 group + 1 reassessment every 8 weeks.
  'Maintain':           { billableItem: 'Gym & App Access - Maintain',                    amount: 57.50, billing: '4-weekly', entitlements: ['Exercise Physiology Group Consultation', 'Exercise Physiology Reassessment - 30 mins (Private)', 'Exercise Physiology Reassessment - 30 mins (GPCCMP)'] },
  // Evolve: 2 group + 2 30-min 1:1 per cycle. Fortnightly 1:1 doubles as reassessment.
  'Evolve':             { billableItem: 'Gym & App Access - Evolve',                      amount: 55.00, billing: '4-weekly', entitlements: ['Exercise Physiology Group Consultation', 'Subsequent Exercise Physiology Consultation - 30 mins (Private)', 'Subsequent Exercise Physiology Consultation - 30 mins (GPCCMP)'] },
  // Elite: 4× 45-min 1:1 per cycle. Gym bundled into session price → no P&P fee.
  'Elite':              { billableItem: null, amount: 0, billing: '4-weekly', entitlements: ['Subsequent Exercise Physiology Consultation - 45 mins (Private)', 'Subsequent Exercise Physiology Consultation - 45 mins (GPCCMP)'] },
  // Remote tiers: phone check-ins only, no gym, no P&P invoice.
  'Remote Weekly':      { billableItem: null, amount: 0, billing: '4-weekly', entitlements: ['Exercise Physiology Phone Check In'] },
  'Remote Fortnightly': { billableItem: null, amount: 0, billing: '4-weekly', entitlements: ['Exercise Physiology Phone Check In'] },
  // App-only: no supervised sessions; nothing the poller should invoice.
  'App-Only':           { billableItem: null, amount: 0, billing: '4-weekly', entitlements: [] },
};

/**
 * Returns the rate entry for an appointment type name.
 * Falls back to duration-based lookup if exact name not found.
 */
function getSessionRate(appointmentTypeName) {
  const rate = APPOINTMENT_RATE_MAP[appointmentTypeName];
  if (rate) return rate;

  // Fallback: unknown appointment type — log and use a generic private rate
  return null;
}

function getPpFee(stripeProductName) {
  return PP_FEES[stripeProductName] || null;
}

module.exports = { getSessionRate, getPpFee, APPOINTMENT_RATE_MAP, PP_FEES };
