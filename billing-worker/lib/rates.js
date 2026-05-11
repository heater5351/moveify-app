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
const PP_FEES = {
  'T1 Foundation':      { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block'   },
  'T2 Progress':        { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block'   },
  'T3 Performance':     { billableItem: 'Gym & App Access - Block Standard Direct Debit', amount: 85.00, billing: 'block'   },
  'Independent':        { billableItem: 'Gym & App Access - Independent',                 amount: 55.00, billing: '4-weekly' },
  'Maintain':           { billableItem: 'Gym & App Access - Maintain',                    amount: 57.50, billing: '4-weekly' },
  'Evolve':             { billableItem: 'Gym & App Access - Evolve',                      amount: 55.00, billing: '4-weekly' },
  'Elite':              { billableItem: null,                                              amount: 0,     billing: '4-weekly' },
  'Remote Weekly':      { billableItem: null,                                              amount: 0,     billing: '4-weekly' },
  'Remote Fortnightly': { billableItem: null,                                              amount: 0,     billing: '4-weekly' },
  'App-Only':           { billableItem: null,                                              amount: 0,     billing: '4-weekly' },
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
