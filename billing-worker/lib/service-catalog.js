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

module.exports = { SERVICES, lookup };
