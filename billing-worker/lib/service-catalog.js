'use strict';

// Maps Cliniko `appointment_type.name` (verbatim) → Xero invoice metadata.
// Source: Moveify billable-items list confirmed 2026-05-10.
//
// Pricing rule:
//   GPCCMP and Private variants share the same casual price. They only differ
//   in the item code (10953 = Medicare CDM, 102/202 = private) which determines
//   the downstream claim path. The dollar amount on the Xero invoice is the
//   same; the routing differs.
//
// Funder tagging (services skipped by the appointment poller):
//   - GPCCMP services        → funder: 'Medicare' — bulk-billed via Medicare,
//                              not consumed from subscription credit. Manual
//                              claim submission via THO is out of scope.
//   - Initial Assessment     → funder: 'Manual'   — pre-subscription gateway
//     (Private)                 visit, paid on the day. Patient typically has
//                              no subscription credit at this point.
//
// Subscription-credit-covered services (poller invoices + allocates):
//   - Group Consultation
//   - Phone Check-in
//   - Private Reassessments
//   - Private Subsequents (30 / 45 / 60 mins)
//   - Program Setup 60 min (Private)  — first paid 1:1 of a program; Cliniko
//     calls it "Program Setup" but it's billed under the Subsequent 60-min
//     line ($170, code 202).
//
// Lookup is normalised (lowercased + whitespace-collapsed) so casing and
// minor spacing variants all map to the same entry.
//
// All prices are GST-free allied health services (account 200, EXEMPTOUTPUT).

const SERVICES = {
  // Group consultations — subscription credit covers
  'Exercise Physiology Group Consultation': {
    code: '502', casualPrice: 30.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Initial assessments — gateway visit, $61.81 flat (matches Medicare 10953
  // rebate). Skipped by the poller; routed manually.
  'Exercise Physiology Initial Assessment (GPCCMP)': {
    code: '10953', casualPrice: 61.81, accountCode: '200', taxType: 'EXEMPTOUTPUT', funder: 'Medicare',
  },
  'Exercise Physiology Initial Assessment (Private)': {
    code: '102', casualPrice: 61.81, accountCode: '200', taxType: 'EXEMPTOUTPUT', funder: 'Manual',
  },

  // Phone check-in — subscription credit covers
  'Exercise Physiology Phone Check In': {
    code: null, casualPrice: 50.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Reassessments — Private subscription-funded, GPCCMP Medicare-funded
  'Exercise Physiology Reassessment - 30 mins (GPCCMP)': {
    code: '10953', casualPrice: 85.00, accountCode: '200', taxType: 'EXEMPTOUTPUT', funder: 'Medicare',
  },
  'Exercise Physiology Reassessment - 30 mins (Private)': {
    code: '202', casualPrice: 85.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Program Setup 60-min (= first paid 1:1 of a new program). Billed at the
  // Subsequent-60min rate; Cliniko names it "Program Setup" but the line item
  // is the same as a 60-min subsequent.
  'Program Setup Exercise Physiology Consultation - 60 mins (GPCCMP)': {
    code: '10953', casualPrice: 170.00, accountCode: '200', taxType: 'EXEMPTOUTPUT', funder: 'Medicare',
  },
  'Program Setup Exercise Physiology Consultation - 60 mins (Private)': {
    code: '202', casualPrice: 170.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },

  // Subsequent consultations — Private subscription-funded, GPCCMP Medicare-funded
  'Subsequent Exercise Physiology Consultation - 30 mins (GPCCMP)': {
    code: '10953', casualPrice: 85.00, accountCode: '200', taxType: 'EXEMPTOUTPUT', funder: 'Medicare',
  },
  'Subsequent Exercise Physiology Consultation - 30 mins (Private)': {
    code: '202', casualPrice: 85.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Subsequent Exercise Physiology Consultation - 45 mins (GPCCMP)': {
    code: '10953', casualPrice: 130.00, accountCode: '200', taxType: 'EXEMPTOUTPUT', funder: 'Medicare',
  },
  'Subsequent Exercise Physiology Consultation - 45 mins (Private)': {
    code: '202', casualPrice: 130.00, accountCode: '200', taxType: 'EXEMPTOUTPUT',
  },
  'Subsequent Exercise Physiology Consultation - 60 mins (GPCCMP)': {
    code: '10953', casualPrice: 170.00, accountCode: '200', taxType: 'EXEMPTOUTPUT', funder: 'Medicare',
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
