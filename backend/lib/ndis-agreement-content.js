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
// Sources (verified 2026-06-13 against official NDIS material):
//   - Clause set + completeness: NDIS "Things to consider when making a service
//     agreement" fact sheet (supports/cost/travel/responsibilities/review/
//     dispute) — ndis.gov.au/media/2429.
//   - Code of Conduct (8 elements): NDIS Quality & Safeguards Commission —
//     ndiscommission.gov.au/rules-and-standards/ndis-code-conduct.
//   - Line items, $166.99/hr cap, travel (therapy: 50% labour up to time caps,
//     $0.99/km non-labour) and non-face-to-face claiming: NDIS Pricing
//     Arrangements & Price Limits 2025-26 + vault NDIS EP Billing Reference.
// ⚠ Final clinical/legal wording still needs Ryan's sign-off before go-live
// (the feature ships behind AGREEMENT_AUTOMATION_ENABLED).

const { PROVIDER } = require('./agreement-content');
const { formatMoney } = require('./agreement-template');

// Bump if the clause wording changes, so previously-signed agreements stay
// attributable to the exact text the participant saw (stored per signed row).
const NDIS_AGREEMENT_VERSION = 'ndis-v1.3-2026-06-13';

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

// Travel rates (therapy, 2025-26): labour at 50% of the support rate; non-labour
// at $0.99/km for a provider vehicle. Used for the indicative funding estimate.
const TRAVEL_LABOUR_FACTOR = 0.5;
const TRAVEL_KM_RATE_CENTS = 99;

// NDIA-managed (Agency) is intentionally absent — Moveify is an unregistered
// provider and cannot claim from NDIA-managed plans. The route hard-rejects it.
const MANAGEMENT_TYPES = ['self_managed', 'plan_managed'];

// Funding periods (NDIS Act s33, in effect from 19 May 2025): a plan's budget is
// released in instalments over the plan, not all up front. Default is quarterly
// for most therapy supports; the operator picks the one the participant's plan
// uses. Providers can't see these in the portal — the participant / plan manager
// must advise. Service agreements MUST now address funding periods, hence the
// always-on clause below. `unset` renders the clause generically.
const FUNDING_PERIODS = {
  quarterly: 'Quarterly — funding released every 3 months',
  monthly: 'Monthly — funding released each month',
  upfront: 'Up front — funding released at the start of the plan',
  '12_months': '12 months — the whole budget is available for the plan',
  other: 'As stated in the participant’s NDIS plan',
};

const MANAGEMENT_LABELS = {
  self_managed: 'Self-managed',
  plan_managed: 'Plan-managed',
};

// Default itemised non-face-to-face supports (claimable only because listed in
// the signed agreement). Operator can override via details.nffItems.
const DEFAULT_NFF_ITEMS = [
  'Program and resource development — designing and updating your individualised exercise program and home-exercise resources',
  'Progress and outcome report writing — e.g. reports for your support coordinator, plan manager, GP, or NDIS plan review',
  'Communication and liaison with your support coordinator, plan manager, GP, and other providers (with your consent)',
  'Phone, video, or email check-ins and clinical follow-up between sessions',
  'Case conferencing about your supports',
];

const SUPPORT_EMAIL = 'ryan@moveifyhealth.com';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isValidLineItem(code) {
  return Object.prototype.hasOwnProperty.call(NDIS_LINE_ITEMS, code);
}

// Default per-plan ending notice (clause: Ending this agreement). The NDIS
// short-notice cancellation rule is fixed by the Pricing Arrangements.
const DEFAULT_ENDING_NOTICE_DAYS = 14;

// ── Header block (un-numbered) ─────────────────────────────────────────────────

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

// ── Numbered clause builders (each takes details; heading carries NO number —
// buildNdisAgreement prefixes the running clause number) ───────────────────────

function termSection(details) {
  const start = str(details.planStart) || '—';
  const end = str(details.planEnd) || '—';
  return {
    heading: 'Term & review',
    body: [
      `This agreement starts on ${start} and ends on ${end}, aligned to the participant’s current NDIS plan.`,
      'The agreement will be reviewed at the participant’s NDIS plan review, or sooner if either party requests it. A new agreement will be issued when a new plan begins.',
    ],
  };
}

function goalsSection(details) {
  const goals = Array.isArray(details.goals) ? details.goals.map(str).filter(Boolean) : [];
  const section = {
    heading: 'Purpose & goals',
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
    heading: 'Supports to be provided (Schedule of Supports)',
    body: ['Accredited Exercise Physiology supports, billed against the participant’s NDIS plan:'],
    bullets,
    note: 'The schedule may be adjusted by agreement between both parties as the participant’s needs change (see “Changes to this agreement”).',
  };
}

function costsSection(details) {
  const rate = formatMoney(details.rateCents);
  return {
    heading: 'Costs',
    bullets: [
      `Rate: ${rate} per hour (NDIS unit: hour; charged pro-rata for part hours). This does not exceed the NDIS price limit.`,
      'Materials or products, if any, are charged only as agreed in writing.',
      'GST: The parties agree the supports under this agreement are supports provided to a participant under their NDIS plan and are GST-free under section 38-38 of A New Tax System (Goods and Services Tax) Act 1999.',
    ],
    note: 'Travel and non-face-to-face supports are addressed in the clauses below — they can only be charged because they are set out in this agreement.',
  };
}

function travelSection(details) {
  if (details.travelApplicable) {
    return {
      heading: 'Travel',
      body: ['Where supports are delivered in your home or the community, provider travel may be charged in addition to the support, in line with the NDIS Pricing Arrangements:'],
      bullets: [
        'Travel time at up to 50% of the hourly support rate, within the NDIS travel-time limits for our area.',
        'Non-labour travel costs — $0.99 per kilometre for a provider vehicle, plus actual tolls and parking — claimed under the separate “Provider Travel – non-labour costs” line item.',
      ],
      note: 'Travel is only charged where agreed in this agreement and reflects actual travel undertaken. Clinic-based sessions do not incur travel charges.',
    };
  }
  return {
    heading: 'Travel',
    body: ['Supports are delivered at the clinic, so no provider travel is charged. If home or community visits are agreed in future, travel will be charged in line with the NDIS Pricing Arrangements and recorded in an updated agreement.'],
  };
}

function nonFaceToFaceSection(details) {
  if (details.nonFaceToFace === false) {
    return {
      heading: 'Non-face-to-face supports',
      body: ['Non-face-to-face supports (e.g. program design, report writing, liaison) are not separately charged under this agreement.'],
    };
  }
  const items = Array.isArray(details.nffItems) && details.nffItems.length
    ? details.nffItems.map(str).filter(Boolean)
    : DEFAULT_NFF_ITEMS;
  return {
    heading: 'Non-face-to-face supports',
    body: ['In addition to face-to-face sessions, the following non-face-to-face supports may be claimed against your plan at the hourly support rate — but only where they are clinically required and directly benefit you, and only because they are listed here:'],
    bullets: items,
    note: 'Non-face-to-face time is recorded and itemised on invoices using the relevant support item’s non-face-to-face option.',
  };
}

// Indicative funding estimate (Schedule of Supports cost). Renders only when the
// operator supplies at least one estimate. Frames figures as "up to / estimated"
// — reserves funding + records consent, but actual claims reflect real delivery
// (Code of Conduct: integrity + fair pricing). Returns null when nothing to show.
function estimatesSection(details) {
  const rateCents = details.rateCents;
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const f2f = num(details.estSessionHours);
  const rep = num(details.estReportingHours);
  const travH = details.travelApplicable ? num(details.estTravelHours) : 0;
  const travKm = details.travelApplicable ? num(details.estTravelKm) : 0;
  if (!(f2f || rep || travH || travKm)) return null;

  const bullets = [];
  let total = 0;
  if (f2f) {
    const c = Math.round(f2f * rateCents); total += c;
    bullets.push(`Exercise Physiology sessions: ~${f2f} hours × ${formatMoney(rateCents)} = ~${formatMoney(c)}`);
  }
  if (rep) {
    const c = Math.round(rep * rateCents); total += c;
    bullets.push(`Reporting & non-face-to-face: up to ${rep} hours × ${formatMoney(rateCents)} = ~${formatMoney(c)}`);
  }
  if (travH) {
    const travRate = Math.round(rateCents * TRAVEL_LABOUR_FACTOR);
    const c = Math.round(travH * travRate); total += c;
    bullets.push(`Travel time: ~${travH} hours × ${formatMoney(travRate)} (50% of rate) = ~${formatMoney(c)}`);
  }
  if (travKm) {
    const c = Math.round(travKm * TRAVEL_KM_RATE_CENTS); total += c;
    bullets.push(`Travel distance: ~${travKm} km × ${formatMoney(TRAVEL_KM_RATE_CENTS)} = ~${formatMoney(c)}`);
  }
  return {
    heading: 'Estimated funding usage (indicative)',
    body: ['The following estimates the funding this agreement may use over its term, so that enough budget is set aside. These figures are indicative only:'],
    bullets,
    note: `Estimated total over the agreement: ~${formatMoney(total)}. These are estimates, not a fixed charge — actual claims reflect supports actually delivered and clinically required, are made only against available funding, and will not exceed it. Unused estimates are not charged.`,
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
  return { heading: 'Payment & claiming', body };
}

// Funding periods (NDIS Act s33). Always rendered — the NDIA's provider guidance
// is explicit that service agreements must now set out how supports are delivered
// and claimed within each funding period. States the specific period when known.
function fundingPeriodSection(details) {
  const label = FUNDING_PERIODS[details.fundingPeriod];
  const body = [
    'The participant’s NDIS funding is released in funding periods — portions of the plan budget made available at set intervals (most commonly every 3 months) rather than all at once. A funding period starts on the participant’s plan start date, not at the start of a calendar month.',
  ];
  if (label) body.push(`For this participant, funding for these supports is released: ${label}.`);
  const bullets = [];
  if (Number.isFinite(details.fundingPeriodAmountCents) && details.fundingPeriodAmountCents > 0) {
    bullets.push(`Indicative funding available for these supports each period: ~${formatMoney(details.fundingPeriodAmountCents)} (the participant or plan manager confirms the exact amount).`);
  }
  bullets.push(
    'Moveify will deliver and claim supports within the funding available in the current funding period, and will not claim more than is available for that period.',
    'Where a course of supports spans two funding periods, claims may be split so each is claimed in the correct period.',
    'Because providers cannot see funding-period dates or amounts in the NDIS portal, the participant (or their plan manager / support coordinator) will tell Moveify the funding-period dates and the amount available for these supports, and will advise of any change at plan reassessment.',
    'Unspent funds roll over into the next funding period within the same plan; they do not carry past the plan end date.',
  );
  return {
    heading: 'Funding periods',
    body,
    bullets,
    note: 'Funding periods control when funding becomes available, not the total amount in the plan. This keeps supports available across the whole plan and helps avoid overspending early.',
  };
}

function cancellationSection() {
  return {
    heading: 'Cancellations & no-shows',
    body: ['For NDIS-funded supports, the NDIS short-notice cancellation rule applies. This replaces Moveify’s general 48-hour clinic policy.'],
    bullets: [
      'A short-notice cancellation occurs if the participant does not attend, is not present at the agreed place/time, or gives less than 7 clear days’ notice.',
      'Moveify may claim up to 100% of the agreed support fee for a short-notice cancellation or no-show, from the participant’s plan, in line with the NDIS Pricing Arrangements & Price Limits.',
      '"Clear days" excludes the day notice is given and the day of the appointment.',
      'Genuine emergencies may be waived at the practitioner’s discretion.',
    ],
  };
}

function responsibilitiesSection() {
  return {
    heading: 'Responsibilities',
    subsections: [
      {
        subheading: 'Moveify will',
        body: [
          'Deliver supports by a qualified Accredited Exercise Physiologist, safely and on time; treat the participant with respect and protect their privacy; give as much notice as possible if it needs to change or cancel an appointment; and communicate honestly about supports and costs, issuing clear, itemised invoices.',
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
    heading: 'Changes to this agreement',
    body: [
      'Either party may request changes. Changes to the supports, schedule or costs will be agreed in writing (an amendment sheet or updated schedule) and signed or acknowledged by both parties before they take effect.',
    ],
  };
}

function endingSection(details) {
  const days = Number.isFinite(details.endingNoticeDays) ? details.endingNoticeDays : DEFAULT_ENDING_NOTICE_DAYS;
  return {
    heading: 'Ending this agreement',
    bullets: [
      `Either party may end this agreement with ${days} days’ written notice.`,
      'Either party may end it immediately if the other seriously breaches it, or if continuing would create a health or safety risk.',
      'The participant ending the agreement does not affect their right to choose another provider at any time.',
    ],
  };
}

function complaintsSection() {
  return {
    heading: 'Feedback & complaints',
    body: [
      `Raise any concern directly with Moveify at ${SUPPORT_EMAIL}. We will acknowledge within 2 business days and respond within 10.`,
      'If a concern can’t be resolved, the participant can contact the NDIS Quality and Safeguards Commission: 1800 035 544 · www.ndiscommission.gov.au.',
    ],
  };
}

// NDIS Code of Conduct — all 8 elements as published by the NDIS Quality &
// Safeguards Commission (incl. sexual misconduct and fair pricing).
function codeOfConductSection() {
  return {
    heading: 'NDIS Code of Conduct',
    body: ['Moveify Health Solutions and its workers deliver these supports in accordance with the NDIS Code of Conduct, which requires us to:'],
    bullets: [
      'Act with respect for your individual rights to freedom of expression, self-determination, and decision-making;',
      'Respect your privacy;',
      'Provide supports and services in a safe and competent manner, with care and skill;',
      'Act with integrity, honesty, and transparency;',
      'Promptly raise and act on concerns about matters that may affect the quality or safety of your supports;',
      'Take all reasonable steps to prevent and respond to all forms of violence against, and exploitation, neglect and abuse of, people with disability;',
      'Take all reasonable steps to prevent and respond to sexual misconduct; and',
      'Provide supports at fair prices, with no unreasonable price difference for NDIS participants.',
    ],
  };
}

function privacySection() {
  return {
    heading: 'Privacy, consent & other providers',
    body: [
      'Moveify collects, uses, stores and discloses personal and health information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. Specific consents (treatment, communication with the participant’s GP and funded-scheme contacts including the plan manager and support coordinator, data handling, and session documentation) are set out in the Moveify Consent & Pre-Exercise Questionnaire, which forms part of this engagement. The participant may withdraw any consent at any time by contacting ' + SUPPORT_EMAIL + '.',
      'Moveify will work cooperatively with the participant’s other providers where the participant consents, and declares no conflict of interest in providing these supports.',
    ],
  };
}

// ── Top-level builder ──────────────────────────────────────────────────────────

// Numbered clauses, in order. Travel + non-face-to-face always render (content
// varies by toggle) so cost coverage is explicit per the NDIS service-agreement
// checklist.
const CLAUSE_BUILDERS = [
  termSection,
  goalsSection,
  supportsSection,
  costsSection,
  travelSection,
  nonFaceToFaceSection,
  estimatesSection, // conditional — returns null when no estimate supplied
  paymentSection,
  fundingPeriodSection,
  cancellationSection,
  responsibilitiesSection,
  changesSection,
  endingSection,
  complaintsSection,
  codeOfConductSection,
  privacySection,
];

// Returns the full structured NDIS agreement, or null if details are unusable.
function buildNdisAgreement({ details, patientName, patientDob } = {}) {
  if (!details || !isValidLineItem(details.lineItem) || !MANAGEMENT_TYPES.includes(details.managementType)) {
    return null;
  }
  const item = NDIS_LINE_ITEMS[details.lineItem];
  const rate = formatMoney(details.rateCents);
  const mgmt = MANAGEMENT_LABELS[details.managementType];

  const numbered = CLAUSE_BUILDERS
    .map((fn) => fn(details))
    .filter(Boolean)
    .map((s, i) => ({ ...s, heading: `${i + 1}. ${s.heading}` }));
  const sections = [participantSection(details, patientName, patientDob), ...numbered];

  return {
    version: NDIS_AGREEMENT_VERSION,
    kind: 'ndis',
    docTitle: 'NDIS Service Agreement',
    tier: 'ndis',
    path: 'ndis',
    tierLabel: `NDIS Exercise Physiology — ${item.budgetCategory}`,
    startDate: str(details.planStart) || null,
    provider: PROVIDER,
    about: 'This NDIS Service Agreement sets out the Accredited Exercise Physiology supports Moveify Health Solutions will provide under the participant’s NDIS plan, the costs (including travel and non-face-to-face supports), and how supports are claimed. It is read alongside the Moveify Consent & Pre-Exercise Questionnaire. By signing, the participant (or authorised representative) confirms they have read and understood all terms.',
    feesSummary: `${rate}/hr · GST-free · ${mgmt}`,
    parts: [
      { key: 'A', title: 'Agreement Terms', sections },
    ],
    signatureNote: 'By signing, the participant (or their authorised representative) confirms they have read and understood this NDIS Service Agreement and agree to its terms, including the NDIS short-notice cancellation policy and the travel and non-face-to-face supports set out above. Where signing as a representative, the signatory confirms they have legal authority to enter this agreement on the participant’s behalf.',
  };
}

module.exports = {
  NDIS_AGREEMENT_VERSION,
  NDIS_LINE_ITEMS,
  NDIS_RATE_CAP_CENTS,
  MANAGEMENT_TYPES,
  MANAGEMENT_LABELS,
  FUNDING_PERIODS,
  DEFAULT_NFF_ITEMS,
  isValidLineItem,
  buildNdisAgreement,
};
