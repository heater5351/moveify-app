'use strict';

// NDIS Service Agreement content for the agreements feature. Unlike the private
// (block / post-casual / continuity) agreements, an NDIS agreement is
// SIGNATURE-ONLY — there is no Stripe / Direct Debit leg. Funding flows from the
// participant's NDIS plan (invoiced to a plan manager, or to the participant for
// self-managed). So this builder deliberately emits NO Part B (DDRSA).
//
// buildNdisAgreement({ details, patientName, patientDob }) returns the SAME
// structured shape as agreement-content.js buildAgreement(...) — { provider,
// docTitle, parts: [{ sections: [...] }], signatureNote, ... } — so the PDF
// renderer, the /validate API, and the patient sign page render it with no
// renderer changes.
//
// Source (vault, read-only): NDIS Service Agreement Template + NDIS EP Billing
// Reference (NDIS Pricing Arrangements & Price Limits 2025-26). The clause prose
// reproduces that template; line items + the $166.99/hr cap come from the billing
// reference. ⚠ Final clinical/legal wording still needs Ryan's sign-off before
// go-live (the feature ships behind AGREEMENT_AUTOMATION_ENABLED).

const { PROVIDER } = require('./agreement-content');
const { formatMoney } = require('./agreement-template');

// Bump if the clause wording changes, so previously-signed agreements stay
// attributable to the exact text the participant saw (stored per signed row).
const NDIS_AGREEMENT_VERSION = 'ndis-v1.0-2026-06-13';

// EP line items, verified against NDIS Pricing Arrangements & Price Limits
// 2025-26 (effective 1 July 2025). Re-check on the next 1 July update.
// `15_200_0126_1_3` (IDL) is the workhorse — covers assessment AND ongoing
// therapy/training. Use IHW only if that's where the plan funding sits.
const NDIS_LINE_ITEMS = {
  '15_200_0126_1_3': {
    name: 'Exercise Physiology — assessment, recommendation, therapy or training',
    budgetCategory: 'Improved Daily Living',
    registrationGroup: '0126 — Exercise Physiology & Personal Well-being',
  },
  '12_027_0128_3_3': {
    name: 'Advice from an Exercise Physiologist regarding exercise required',
    budgetCategory: 'Improved Health & Wellbeing',
    registrationGroup: '0128 — Therapeutic Supports',
  },
};

// National price cap (MMM 1–5), 2025-26. Therapy supports have no per-state
// variation. The operator-entered rate must not exceed this.
const NDIS_RATE_CAP_CENTS = 16699;

// NDIA-managed (Agency) is intentionally absent — Moveify is an unregistered
// provider and cannot claim from NDIA-managed plans. The route hard-rejects it.
const MANAGEMENT_TYPES = ['self_managed', 'plan_managed'];

const MANAGEMENT_LABELS = {
  self_managed: 'Self-managed',
  plan_managed: 'Plan-managed',
};

const SUPPORT_EMAIL = 'ryan@moveifyhealth.com';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isValidLineItem(code) {
  return Object.prototype.hasOwnProperty.call(NDIS_LINE_ITEMS, code);
}

// Default per-plan cancellation/ending notice. The NDIS short-notice rule (clause
// 6) is fixed by the Pricing Arrangements; this only governs ending the whole
// agreement (clause 9).
const DEFAULT_ENDING_NOTICE_DAYS = 14;

// ── Section builders ───────────────────────────────────────────────────────────

function participantSection(details, patientName, patientDob) {
  const lines = [];
  lines.push(`Participant: ${patientName || '—'}`);
  if (str(details.ndisNumber)) lines.push(`NDIS number: ${str(details.ndisNumber)}`);
  if (patientDob) lines.push(`Date of birth: ${patientDob}`);
  const rep = details.representative || {};
  if (str(rep.name)) {
    lines.push(`Representative / nominee: ${[str(rep.name), str(rep.relationship), str(rep.authority)].filter(Boolean).join(' · ')}`);
  }
  const sc = details.supportCoordinator || {};
  if (str(sc.name)) {
    lines.push(`Support Coordinator: ${[str(sc.name), str(sc.org), str(sc.contact)].filter(Boolean).join(' · ')}`);
  }
  return { heading: 'Participant & Plan', body: lines };
}

function termSection(details) {
  const start = str(details.planStart) || '—';
  const end = str(details.planEnd) || '—';
  return {
    heading: '1. Term',
    body: [
      `This agreement starts on ${start} and ends on ${end}, aligned to the participant's current NDIS plan. A new agreement will be issued when a new plan begins.`,
    ],
  };
}

function goalsSection(details) {
  const goals = Array.isArray(details.goals) ? details.goals.map(str).filter(Boolean) : [];
  const section = {
    heading: '2. Purpose & goals',
    body: ['This agreement covers Accredited Exercise Physiology supports to work toward the participant’s NDIS plan goals.'],
  };
  if (goals.length) section.bullets = goals;
  return section;
}

function supportsSection(details) {
  const item = NDIS_LINE_ITEMS[details.lineItem] || {};
  const bullets = [
    `Support: ${item.name || 'Exercise Physiology'}`,
    `NDIS line item: ${str(details.lineItem) || '—'}${item.budgetCategory ? ` (${item.budgetCategory})` : ''}`,
  ];
  if (str(details.delivery)) bullets.push(`Delivery: ${str(details.delivery)}`);
  if (str(details.frequency)) bullets.push(`Frequency: ${str(details.frequency)}`);
  return {
    heading: '3. Supports to be provided (Schedule of Supports)',
    body: ['Accredited Exercise Physiology supports, billed against the participant’s NDIS plan:'],
    bullets,
    note: 'The schedule may be adjusted by agreement between both parties as the participant’s needs change (see clause 8).',
  };
}

function costsSection(details) {
  const rate = formatMoney(details.rateCents);
  return {
    heading: '4. Costs',
    bullets: [
      `Rate: ${rate} per hour (NDIS unit: hour; charged pro-rata for part hours). This does not exceed the NDIS price limit.`,
      'Non-face-to-face supports (e.g. program design, liaison) and report writing are charged at the above hourly rate only where clinically required and agreed — and only because it is stated here.',
      'Travel is charged per NDIS travel rules where applicable.',
      'GST: The parties agree the supports under this agreement are supports provided to a participant under their NDIS plan and are GST-free under section 38-38 of A New Tax System (Goods and Services Tax) Act 1999.',
    ],
  };
}

function paymentSection(details) {
  const mgmt = MANAGEMENT_LABELS[details.managementType] || details.managementType;
  const body = [`Plan management — this participant is: ${mgmt}.`];
  if (details.managementType === 'plan_managed') {
    const pm = details.planManager || {};
    const who = [str(pm.name), str(pm.contact)].filter(Boolean).join(' · ') || '[plan manager]';
    body.push(`Moveify will invoice the participant’s plan manager (${who}), who pays from the participant’s NDIS funding.`);
  } else {
    body.push('Moveify will invoice the participant directly; the participant pays and claims reimbursement from the NDIS.');
  }
  body.push('By signing, the participant authorises Moveify to claim/invoice for supports delivered under this agreement, and confirms there is sufficient funding in the relevant support budget.');
  return { heading: '5. Payment & claiming', body };
}

function cancellationSection() {
  return {
    heading: '6. Cancellations & no-shows',
    body: ['For NDIS-funded supports, the NDIS short-notice cancellation rule applies. This replaces Moveify’s general 48-hour clinic policy.'],
    bullets: [
      'A short-notice cancellation occurs if the participant does not attend, is not present at the agreed place/time, or gives less than 7 clear days’ notice.',
      'Moveify may claim up to 100% of the agreed support fee for a short-notice cancellation or no-show, from the participant’s plan, in line with the NDIS Pricing Arrangements & Price Limits.',
      '"Clear days" excludes the day notice is given and the day of the appointment.',
      'Genuine emergencies may be waived at the practitioner’s discretion.',
    ],
  };
}

function responsibilitiesSection(details) {
  return {
    heading: '7. Responsibilities',
    subsections: [
      {
        subheading: 'Moveify will',
        body: [
          'Deliver supports by a qualified Accredited Exercise Physiologist, safely and on time; treat the participant with respect and protect their privacy; give as much notice as possible if it needs to change or cancel an appointment; and communicate honestly about supports and costs, issuing clear invoices.',
        ],
      },
      {
        subheading: 'The participant (or representative) will',
        body: [
          'Provide accurate information (including the completed Pre-Exercise Screening Questionnaire) and notify Moveify of any changes to their health; give 7 clear days’ notice to cancel or reschedule where possible; treat staff with respect and provide a safe environment for any home or community sessions; and keep sufficient NDIS funding available, notifying Moveify of any plan changes.',
        ],
      },
    ],
  };
}

function changesSection() {
  return {
    heading: '8. Changes to this agreement',
    body: [
      'Either party may request changes. Changes to the supports, schedule or costs will be agreed in writing (an amendment sheet or updated schedule) and signed or acknowledged by both parties before they take effect.',
    ],
  };
}

function endingSection(details) {
  const days = Number.isFinite(details.endingNoticeDays) ? details.endingNoticeDays : DEFAULT_ENDING_NOTICE_DAYS;
  return {
    heading: '9. Ending this agreement',
    bullets: [
      `Either party may end this agreement with ${days} days’ written notice.`,
      'Either party may end it immediately if the other seriously breaches it, or if continuing would create a health or safety risk.',
      'The participant ending the agreement does not affect their right to choose another provider at any time.',
    ],
  };
}

function complaintsSection() {
  return {
    heading: '10. Feedback & complaints',
    body: [
      `Raise any concern directly with Moveify at ${SUPPORT_EMAIL}. We will acknowledge within 2 business days and respond within 10.`,
      'If a concern can’t be resolved, the participant can contact the NDIS Quality and Safeguards Commission: 1800 035 544 · www.ndiscommission.gov.au.',
    ],
  };
}

// NDIS Code of Conduct clause (explicitly requested). The Code governs provider
// and worker conduct; complaints route to the NDIS Commission (clause 10).
function codeOfConductSection() {
  return {
    heading: '11. NDIS Code of Conduct',
    body: [
      'Moveify Health Solutions and its practitioners deliver these supports in accordance with the NDIS Code of Conduct. This means we will act with respect for the participant’s rights, dignity and autonomy; provide supports safely, competently and with care and skill; act with integrity, honesty and transparency; promptly raise and act on concerns about the quality or safety of supports; and take all reasonable steps to prevent and respond to abuse, neglect, violence and exploitation.',
    ],
  };
}

function privacySection() {
  return {
    heading: '12. Privacy, consent & other providers',
    body: [
      'Moveify collects, uses, stores and discloses personal and health information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. Specific consents (treatment, communication with the participant’s GP and funded-scheme contacts including the plan manager and support coordinator, data handling, and session documentation) are set out in the Moveify Consent & Pre-Exercise Questionnaire, which forms part of this engagement. The participant may withdraw any consent at any time by contacting ' + SUPPORT_EMAIL + '.',
      'Moveify will work cooperatively with the participant’s other providers where the participant consents, and declares no conflict of interest in providing these supports.',
    ],
  };
}

// ── Top-level builder ──────────────────────────────────────────────────────────

// Returns the full structured NDIS agreement, or null if details are unusable.
function buildNdisAgreement({ details, patientName, patientDob } = {}) {
  if (!details || !isValidLineItem(details.lineItem) || !MANAGEMENT_TYPES.includes(details.managementType)) {
    return null;
  }
  const item = NDIS_LINE_ITEMS[details.lineItem];
  const rate = formatMoney(details.rateCents);
  const mgmt = MANAGEMENT_LABELS[details.managementType];

  const sections = [
    participantSection(details, patientName, patientDob),
    termSection(details),
    goalsSection(details),
    supportsSection(details),
    costsSection(details),
    paymentSection(details),
    cancellationSection(),
    responsibilitiesSection(details),
    changesSection(),
    endingSection(details),
    complaintsSection(),
    codeOfConductSection(),
    privacySection(),
  ];

  return {
    version: NDIS_AGREEMENT_VERSION,
    kind: 'ndis',
    docTitle: 'NDIS Service Agreement',
    tier: 'ndis',
    path: 'ndis',
    tierLabel: `NDIS Exercise Physiology — ${item.budgetCategory}`,
    startDate: str(details.planStart) || null,
    provider: PROVIDER,
    about: 'This NDIS Service Agreement sets out the Accredited Exercise Physiology supports Moveify Health Solutions will provide under the participant’s NDIS plan, the costs, and how supports are claimed. It is read alongside the Moveify Consent & Pre-Exercise Questionnaire. By signing, the participant (or authorised representative) confirms they have read and understood all terms.',
    feesSummary: `${rate}/hr · GST-free · ${mgmt}`,
    parts: [
      { key: 'A', title: 'Agreement Terms', sections },
    ],
    signatureNote: 'By signing, the participant (or their authorised representative) confirms they have read and understood this NDIS Service Agreement and agree to its terms, including the NDIS short-notice cancellation policy. Where signing as a representative, the signatory confirms they have legal authority to enter this agreement on the participant’s behalf.',
  };
}

module.exports = {
  NDIS_AGREEMENT_VERSION,
  NDIS_LINE_ITEMS,
  NDIS_RATE_CAP_CENTS,
  MANAGEMENT_TYPES,
  MANAGEMENT_LABELS,
  isValidLineItem,
  buildNdisAgreement,
};
