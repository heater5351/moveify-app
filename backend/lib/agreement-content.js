'use strict';

// Full structured Service Agreement content for the sign-up automation, mapped
// to mirror the Cliniko service agreements (provider header, Part A clinical
// services, Part B Direct Debit Request Service Agreement). One builder,
// buildAgreement({ tier, path, startDate }), returns a structured object that the
// PDF renderer, the /validate API, and the patient sign page all render the same
// way — so the three surfaces never drift.
//
// Sources (vault, read-only): clinical inclusions + fees from Part-Time Pricing
// Scheme v3.1 §3/§5/§6/§7; generic legal copy (Part B DDRSA, privacy, failed
// payments, disputes) reproduced from the canonical Cliniko agreement so the
// automated document matches the manual one.
//
// ⚠ The clinical/legal copy below should get a final read by Ryan before the
// automation goes live (flag is off in prod). Tier amounts come from billingTerms
// in agreement-template.js, which mirrors the worker's Stripe Prices.

const {
  AGREEMENT_VERSION,
  tierLabel,
  billingTerms,
  formatMoney,
  PLAN_BILLING,
  upfrontPrice,
  upfrontTermsSummary,
} = require('./agreement-template');

// ── Provider / business identity (shown in the header of every agreement) ──────
// NOTE: postcode here is 5351 to match the brand kit + the real Williamstown SA
// postcode. The current Cliniko agreement shows 5352 — confirm which is correct.
const PROVIDER = {
  name: 'Ryan Heath — Accredited Exercise Physiologist',
  accreditation: 'ESSA Accreditation: AEP ID #48977',
  business: 'Moveify Health Solutions  |  ABN 52 263 141 529',
  location: '4 George St, Williamstown SA 5351',
  contact: 'ryan@moveifyhealth.com',
  phone: '0435 524 991',
};

const SUPPORT_EMAIL = 'ryan@moveifyhealth.com';

// ── Per-tier clinical content, keyed `${path}:${tier}` ─────────────────────────
// family: 'block' (fixed 6-week term) | 'continuity' (rolling)
// hasGym: whether unlimited partner-gym access is included
// included: "What's Included" bullets
// review:  { heading, body[] } describing the supervised/review touchpoints (or null)
const TIER_CONTENT = {
  // ── Treatment blocks (standard path) — 6 weeks, weekly DD ──
  'standard:T1': {
    family: 'block', hasGym: true,
    docTitle: 'Foundation Treatment Block Service Agreement',
    tierName: 'Tier 1 — Foundation Block',
    intro: 'The Foundation block is a six-week program combining a weekly supervised group session with independent gym training.',
    included: [
      'Week 1 — 60-minute 1:1 program design',
      'Weeks 2–5 — 1× supervised group session per week (4 total)',
      'Week 6 — 30-minute 1:1 reassessment',
      'Unlimited gym access for the full six-week block',
      'Full Moveify app access — program, tracking, and education library',
    ],
    review: {
      heading: 'Supervised Sessions',
      body: ['Your supervised contacts are two individual face-to-face sessions (program design and reassessment) plus four weekly group sessions, all delivered on the clinic days (Monday or Tuesday). To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '. Missed sessions without notice are forfeited.'],
    },
  },
  'standard:T2': {
    family: 'block', hasGym: true,
    docTitle: 'Progress Treatment Block Service Agreement',
    tierName: 'Tier 2 — Progress Block',
    intro: 'The Progress block is a six-week program with weekly individual clinical oversight alongside independent gym training.',
    included: [
      'Week 1 — 60-minute 1:1 program design',
      'Weeks 2–5 — weekly 30-minute 1:1 program progression',
      'Week 6 — 30-minute 1:1 reassessment',
      'Unlimited gym access for the full six-week block',
      'Full Moveify app access — program, tracking, and education library',
    ],
    review: {
      heading: 'Supervised Sessions',
      body: ['Your supervised contacts are six individual face-to-face sessions (a 60-minute program design, four weekly 30-minute 1:1 sessions, and a 30-minute reassessment), all delivered on the clinic days (Monday or Tuesday). To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '. Missed sessions without notice are forfeited.'],
    },
  },
  'standard:T3': {
    family: 'block', hasGym: true,
    docTitle: 'Performance Treatment Block Service Agreement',
    tierName: 'Tier 3 — Performance Block',
    intro: 'The Performance block is a six-week program with longer weekly 1:1 sessions for deeper clinical work.',
    included: [
      'Week 1 — 60-minute 1:1 program design',
      'Weeks 2–5 — weekly 45-minute 1:1 program progression',
      'Week 6 — 30-minute 1:1 reassessment',
      'Unlimited gym access for the full six-week block',
      'Full Moveify app access — program, tracking, and education library',
    ],
    review: {
      heading: 'Supervised Sessions',
      body: ['Your supervised contacts are six individual face-to-face sessions (a 60-minute program design, four weekly 45-minute 1:1 sessions, and a 30-minute reassessment), all delivered on the clinic days (Monday or Tuesday). To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '. Missed sessions without notice are forfeited.'],
    },
  },

  // ── Post-casual blocks — same clinical content, 5 weekly DDs after $170 credit ──
  'post_casual:T1': {
    family: 'block', hasGym: true, postCasual: true,
    docTitle: 'Foundation Treatment Block Service Agreement',
    tierName: 'Tier 1 — Foundation Block (Post-Casual)',
    intro: 'The Foundation block is a six-week program combining a weekly supervised group session with independent gym training.',
    included: [
      'Week 1 — 60-minute 1:1 program design',
      'Weeks 2–5 — 1× supervised group session per week (4 total)',
      'Week 6 — 30-minute 1:1 reassessment',
      'Unlimited gym access for the full six-week block',
      'Full Moveify app access — program, tracking, and education library',
    ],
    review: {
      heading: 'Supervised Sessions',
      body: ['Your supervised contacts are two individual face-to-face sessions plus four weekly group sessions, delivered on the clinic days (Monday or Tuesday). To reschedule, provide at least 24 hours notice. Missed sessions without notice are forfeited.'],
    },
  },
  'post_casual:T2': {
    family: 'block', hasGym: true, postCasual: true,
    docTitle: 'Progress Treatment Block Service Agreement',
    tierName: 'Tier 2 — Progress Block (Post-Casual)',
    intro: 'The Progress block is a six-week program with weekly individual clinical oversight alongside independent gym training.',
    included: [
      'Week 1 — 60-minute 1:1 program design',
      'Weeks 2–5 — weekly 30-minute 1:1 program progression',
      'Week 6 — 30-minute 1:1 reassessment',
      'Unlimited gym access for the full six-week block',
      'Full Moveify app access — program, tracking, and education library',
    ],
    review: {
      heading: 'Supervised Sessions',
      body: ['Your supervised contacts are six individual face-to-face sessions, delivered on the clinic days (Monday or Tuesday). To reschedule, provide at least 24 hours notice. Missed sessions without notice are forfeited.'],
    },
  },
  'post_casual:T3': {
    family: 'block', hasGym: true, postCasual: true,
    docTitle: 'Performance Treatment Block Service Agreement',
    tierName: 'Tier 3 — Performance Block (Post-Casual)',
    intro: 'The Performance block is a six-week program with longer weekly 1:1 sessions for deeper clinical work.',
    included: [
      'Week 1 — 60-minute 1:1 program design',
      'Weeks 2–5 — weekly 45-minute 1:1 program progression',
      'Week 6 — 30-minute 1:1 reassessment',
      'Unlimited gym access for the full six-week block',
      'Full Moveify app access — program, tracking, and education library',
    ],
    review: {
      heading: 'Supervised Sessions',
      body: ['Your supervised contacts are six individual face-to-face sessions, delivered on the clinic days (Monday or Tuesday). To reschedule, provide at least 24 hours notice. Missed sessions without notice are forfeited.'],
    },
  },

  // ── In-clinic continuity (rolling) ──
  'continuity:Independent': {
    family: 'continuity', hasGym: true,
    docTitle: 'Independent Continuity Service Agreement',
    tierName: 'Independent Tier',
    intro: 'The Independent Tier provides unlimited gym access and a monthly 30-minute 1:1 clinical review, supporting largely independent training with periodic oversight.',
    included: [
      'Unlimited gym access — any day the partner facility is open',
      'Monthly 30-minute 1:1 review — program update, load progression, and clinical check-in (1 per 4-week billing cycle)',
      'Full Moveify app access — program, tracking, and education library',
      'Group sessions not included (available as a casual add-on at $30/session)',
    ],
    review: {
      heading: 'Monthly Review Session',
      body: [
        'Your monthly 30-minute 1:1 review is scheduled within each 4-week billing cycle. To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '. Missed reviews without notice are forfeited for that cycle.',
      ],
    },
  },
  'continuity:Maintain': {
    family: 'continuity', hasGym: true,
    docTitle: 'Maintain Continuity Service Agreement',
    tierName: 'Maintain Tier',
    intro: 'The Maintain Tier provides one supervised group session each week plus unlimited gym access, with an 8-weekly 1:1 reassessment.',
    included: [
      '1× supervised group session per week (Monday or Tuesday)',
      'Unlimited gym access — any day the partner facility is open',
      '8-weekly 30-minute 1:1 reassessment and program update',
      'Full Moveify app access — program, tracking, and education library',
    ],
    review: {
      heading: 'Group Sessions & Reassessment',
      body: [
        'Your weekly group session runs on a clinic day (Monday or Tuesday). A 30-minute 1:1 reassessment and program update is scheduled every 8 weeks. To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '. Missed sessions without notice are forfeited.',
      ],
    },
  },
  'continuity:Evolve': {
    family: 'continuity', hasGym: true,
    docTitle: 'Evolve Continuity Service Agreement',
    tierName: 'Evolve Tier',
    intro: 'The Evolve Tier alternates weekly group and 30-minute 1:1 sessions (two of each per 4-week cycle) alongside unlimited gym access, with the fortnightly 1:1 serving as your ongoing reassessment.',
    included: [
      'Alternating weekly — 1× group session one week, 1× 30-minute 1:1 the next (2 group + 2 1:1 per 4-week cycle)',
      'Unlimited gym access — any day the partner facility is open',
      'Your fortnightly 1:1 serves as your ongoing reassessment — no separate reassessment needed',
      'Full Moveify app access — program, tracking, and education library',
    ],
    review: {
      heading: 'Sessions & Reassessment',
      body: [
        'Each 4-week cycle includes two supervised group sessions and two 30-minute 1:1 sessions, alternating week to week on the clinic days (Monday or Tuesday). The fortnightly 1:1 doubles as your ongoing reassessment. To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '. Missed sessions without notice are forfeited.',
      ],
    },
  },
  'continuity:Elite': {
    family: 'continuity', hasGym: true,
    docTitle: 'Elite Continuity Service Agreement',
    tierName: 'Elite Tier',
    intro: 'The Elite Tier provides a weekly 45-minute 1:1 session with unlimited gym access and between-session program adjustments in the Moveify app.',
    included: [
      'Weekly 45-minute 1:1 session',
      'Unlimited gym access — any day the partner facility is open',
      'Moveify app with between-session program adjustments',
    ],
    review: {
      heading: 'Weekly 1:1 Session',
      body: [
        'Your 45-minute 1:1 session runs each week on a clinic day (Monday or Tuesday), with program adjustments made between sessions in the Moveify app. To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '. Missed sessions without notice are forfeited.',
      ],
    },
  },

  // ── Remote continuity (no gym) ──
  'continuity:Remote Weekly': {
    family: 'continuity', hasGym: false,
    docTitle: 'Remote Weekly Continuity Service Agreement',
    tierName: 'Remote Weekly Tier',
    intro: 'Remote Weekly provides a weekly 10-minute phone check-in with app-based programming, delivered entirely remotely (no gym access).',
    included: [
      'Weekly 10-minute phone check-in',
      'Moveify app with program updates as needed',
      'No gym access (remote tier)',
    ],
    review: {
      heading: 'Phone Check-Ins',
      body: ['Your 10-minute phone check-in is scheduled weekly. To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '.'],
    },
  },
  'continuity:Remote Fortnightly': {
    family: 'continuity', hasGym: false,
    docTitle: 'Remote Fortnightly Continuity Service Agreement',
    tierName: 'Remote Fortnightly Tier',
    intro: 'Remote Fortnightly provides a fortnightly 10-minute phone check-in with app-based programming, delivered entirely remotely (no gym access).',
    included: [
      'Fortnightly 10-minute phone check-in',
      'Moveify app with program updates as needed',
      'No gym access (remote tier)',
    ],
    review: {
      heading: 'Phone Check-Ins',
      body: ['Your 10-minute phone check-in is scheduled fortnightly. To reschedule, provide at least 24 hours notice by contacting ' + SUPPORT_EMAIL + '.'],
    },
  },

  // ── App-only ──
  'continuity:App-Only': {
    family: 'continuity', hasGym: false, noReview: true,
    docTitle: 'Moveify App Membership Service Agreement',
    tierName: 'App-Only Membership',
    intro: 'App-Only keeps your Moveify program and content library active for self-directed training. It requires a previously completed 1:1 program-design session and includes no clinical contact.',
    included: [
      'Your individualised Moveify exercise program (built during a prior 1:1 session)',
      'Full access to the Moveify content library — technique videos, condition guides, education modules',
      'Self-directed — no phone calls or clinical contact included',
      'No gym access',
    ],
    review: {
      heading: 'Optional Program Refresh',
      body: ['App-Only includes no scheduled clinical contact. A 30-minute Program Refresh ($85) can be booked every 6–8 weeks if you would like your program progressed — contact ' + SUPPORT_EMAIL + '.'],
    },
  },
};

function planKey(tier, path) {
  return `${String(path || '').trim()}:${String(tier || '').trim()}`;
}

function getTierContent(tier, path) {
  return TIER_CONTENT[planKey(tier, path)] || null;
}

// ── Generic section builders ───────────────────────────────────────────────────

function medicarePhiSection(c) {
  // App-Only / remote-only patients have no rebate-eligible in-person 1:1 — skip
  // the Medicare/PHI section for the pure App-Only membership.
  if (c.noReview) return null;
  return {
    heading: 'Medicare CDM and Private Health Insurance',
    subsections: [
      {
        subheading: 'Medicare CDM',
        body: ['Your eligible 1:1 sessions may qualify for a Medicare rebate of $61.80 under MBS Item 10953 where a GP Chronic Condition Management Plan (GPCCMP) is in place. Up to 5 individual allied-health sessions per calendar year are available (shared across all disciplines). You pay Moveify’s fee and claim your Medicare rebate separately.'],
      },
      {
        subheading: 'Private Health Insurance',
        body: ['Your 1:1 sessions may attract a PHI rebate on your extras cover. Rebates vary by fund and policy. You cannot claim both Medicare and PHI on the same session.'],
      },
    ],
  };
}

function gymSection(c) {
  if (!c.hasGym) return null;
  const duration = c.family === 'block' ? 'the six-week block' : 'your active subscription';
  return {
    heading: 'Gym Access',
    body: [
      `Unlimited gym access at the partner facility is included for the duration of ${duration}. Access is for independent training using your Moveify program. You must comply with the facility’s conditions of entry. Moveify is not responsible for injury sustained during independent gym use.`,
    ],
  };
}

function obligationsSection(c) {
  const bullets = [
    'Inform your Exercise Physiologist of any changes to your health, medications, or medical conditions',
    'Follow your individualised Moveify program and your Exercise Physiologist’s guidance on load and progression',
  ];
  if (c.hasGym) {
    bullets.push('Not use the gym facility if you are unwell, injured, or advised by a medical professional not to exercise');
  }
  if (!c.noReview) {
    bullets.push('Attend your scheduled sessions at the agreed time or provide adequate notice to reschedule');
  }
  return {
    heading: 'Patient Obligations',
    bullets,
    note: 'Exercise carries inherent risks including muscle soreness, fatigue, and in rare cases injury. Your Exercise Physiologist will review and adjust your program at each session.',
  };
}

const PRIVACY_SECTION = {
  heading: 'Privacy',
  body: [
    'Moveify Health Solutions handles your personal and health information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. Records are retained for a minimum of 7 years from your last service date. Data collected through the Moveify app is stored securely in Australia and not shared with third parties except as required for your care or by law.',
  ],
};

const VARIATION_SECTION = {
  heading: 'Variation and Complaints',
  body: [
    `Moveify may update these terms with at least 28 days written notice of any material change. For complaints, contact ${SUPPORT_EMAIL} — we acknowledge within 2 business days and respond within 10. Concerns about professional conduct may be directed to ESSA at essa.org.au.`,
  ],
};

function pauseCancelSection(c) {
  if (c.family !== 'continuity') return null;
  return {
    heading: 'Pausing and Cancelling',
    subsections: [
      {
        subheading: 'Pause',
        body: ['You may pause your subscription for up to 12 weeks cumulative per calendar year. Notify us in writing at least 3 business days before your next billing date. Your services and billing will pause for the confirmed period.'],
      },
      {
        subheading: 'Cancellation',
        body: [`You may cancel at any time by providing 14 days written notice to ${SUPPORT_EMAIL}. Your subscription continues and is billed until the notice period expires. No refund is issued for the current billing cycle after notice is given.`],
      },
      {
        subheading: 'Upgrading',
        body: [`You may move to a higher continuity tier or re-enter a treatment block at any time. Contact ${SUPPORT_EMAIL} — changes take effect at the start of the next billing cycle.`],
      },
    ],
  };
}

function blockTermSection(c, paymentMethod) {
  if (c.family !== 'block') return null;
  // Upfront blocks are paid as a single lump — no weekly debit language.
  const termSentence = paymentMethod === 'upfront'
    ? 'A treatment block is a fixed six-week commitment, paid in full upfront. The block ends automatically at the end of the six weeks — there is no rolling charge.'
    : (() => {
        const debits = c.postCasual ? 'five weekly debits (following the credit of your casual program-design session)' : 'six weekly debits';
        return `A treatment block is a fixed six-week commitment billed over ${debits}. The block ends automatically after the final payment — there is no rolling charge.`;
      })();
  return {
    heading: 'Block Term and What Happens Next',
    body: [
      termSentence,
      `At your week-6 reassessment we’ll discuss continuity options to keep your momentum (Independent, Maintain, Evolve, or Elite). If you need to pause or stop mid-block, contact ${SUPPORT_EMAIL} to discuss your options.`,
    ],
  };
}

// ── Fees section (tier-specific, derived from billingTerms) ────────────────────

function feesSection(tier, path, paymentMethod) {
  // Upfront block: a single lump payment, no Direct Debit. Overrides the
  // per-week DD wording entirely.
  if (paymentMethod === 'upfront') {
    const cents = upfrontPrice(tier, path);
    if (!cents) return null;
    return {
      heading: 'Fees and Billing',
      body: [
        `This block is paid in full upfront — a single payment of ${formatMoney(cents)}, ` +
        'with no recurring or scheduled payments. Your program begins once payment is received. ' +
        'The block ends automatically at the conclusion of its term.',
      ],
    };
  }
  const b = billingTerms(tier, path, null);
  const pb = PLAN_BILLING[planKey(tier, path)];
  if (!b || !pb) return null;
  const body = [];
  if (pb.shape === 'continuity') {
    const weekly = formatMoney(Math.round(pb.amountCents / 4));
    body.push(`This tier is billed ${formatMoney(pb.amountCents)} every 4 weeks (advertised as approximately ${weekly}/week, 13 billing cycles per year). There is no lock-in contract — the subscription rolls automatically until cancelled with the required notice.`);
  } else if (pb.shape === 'post_casual') {
    const total = formatMoney(pb.amountCents * pb.paidPayments);
    body.push(`Your casual program-design session is credited toward this block. The remaining balance is billed as ${formatMoney(pb.amountCents)} per week over ${pb.paidPayments} weekly debits (total ${total}), with your first week complimentary. The block ends automatically after the final payment.`);
  } else {
    const total = formatMoney(pb.amountCents * pb.paidPayments);
    body.push(`This block is billed ${formatMoney(pb.amountCents)} per week over ${pb.paidPayments} weekly debits (total ${total}). The block ends automatically after the final payment.`);
  }
  return { heading: 'Fees and Billing', body };
}

// ── Part B (Direct Debit Request Service Agreement) — generic across tiers ─────

function partBSections(tier, path, startDate) {
  const terms = billingTerms(tier, path, startDate);
  const sections = [];
  if (terms) {
    sections.push({
      heading: 'Payment Authorisation',
      body: [terms.authorisation],
    });
    sections.push({
      heading: terms.whenChargesTitle,
      body: [terms.whenCharges],
    });
  }
  sections.push({
    heading: 'Failed Payments',
    bullets: [
      'We will notify you promptly if a payment fails',
      'We may attempt to re-process the payment after contacting you',
      'Scheduled services and any gym access may be suspended until payment is resolved',
      'A $10 failed-payment administration fee may apply',
    ],
    note: 'Please ensure sufficient funds are available on each charge date and notify us of any changes to your payment details before the next charge.',
  });
  sections.push({
    heading: 'Disputing a Charge',
    body: [`If you believe a charge has been made in error, contact ${SUPPORT_EMAIL} first. If unresolved, contact your financial institution. We will respond to any dispute within 5 business days.`],
  });
  sections.push({
    heading: 'Changing Payment Details',
    body: [`To update your card or bank-account details, contact ${SUPPORT_EMAIL} at least 3 business days before your next charge date. A new payment authorisation will be required.`],
  });
  sections.push({
    heading: 'Payment Data and Privacy',
    body: ['Your payment details are transmitted securely to Stripe for processing. Moveify does not store your full card or bank-account details. Payment data is held by Stripe in accordance with PCI-DSS compliant security standards. Stripe Payments Australia Pty Ltd (ACN 160 180 343, Direct Debit User ID 507156) processes payments on Moveify’s behalf.'],
  });
  return sections;
}

// ── Top-level builder ──────────────────────────────────────────────────────────

// Returns the full structured agreement for a tier/path, or null if unknown.
// `paymentMethod` ('dd' | 'upfront', default 'dd') decouples signing from payment:
// 'upfront' blocks pay a single lump out-of-band (Tyro/manual), so the document
// omits Part B (the DDRSA) and uses lump-sum fee/consent copy.
function buildAgreement({ tier, path, startDate, paymentMethod = 'dd' } = {}) {
  const c = getTierContent(tier, path);
  if (!c) return null;
  // Upfront is only offered on the block paths; anything else falls back to DD.
  const isUpfront = paymentMethod === 'upfront' && !!upfrontPrice(tier, path);
  const terms = billingTerms(tier, path, startDate);

  const partA = [];
  // 1. What's included
  partA.push({ heading: `${c.tierName} — What’s Included`, body: [c.intro], bullets: c.included });
  // 2. Fees
  const fees = feesSection(tier, path, isUpfront ? 'upfront' : 'dd');
  if (fees) partA.push(fees);
  // 3. Medicare / PHI
  const mp = medicarePhiSection(c);
  if (mp) partA.push(mp);
  // 4. Gym
  const gym = gymSection(c);
  if (gym) partA.push(gym);
  // 5. Sessions / review
  if (c.review) partA.push(c.review);
  // 6. Pause/cancel (continuity) or block term (block)
  const pc = pauseCancelSection(c);
  if (pc) partA.push(pc);
  const bt = blockTermSection(c, isUpfront ? 'upfront' : 'dd');
  if (bt) partA.push(bt);
  // 7. Obligations, Privacy, Variation
  partA.push(obligationsSection(c));
  partA.push(PRIVACY_SECTION);
  partA.push(VARIATION_SECTION);

  // Part B (the DDRSA) only applies to the Direct Debit path. Upfront blocks pay
  // a lump out-of-band, so the document is Part A only with non-DD consent copy.
  const parts = [{ key: 'A', title: 'Part A — Clinical Services', sections: partA }];
  if (!isUpfront) {
    parts.push({
      key: 'B',
      title: 'Part B — Direct Debit Authorisation',
      intro: 'This section constitutes the Direct Debit Request Service Agreement (DDRSA) required under BECS operating rules. By signing this Agreement, you acknowledge and accept these direct debit terms.',
      sections: partBSections(tier, path, startDate),
    });
  }

  return {
    version: AGREEMENT_VERSION,
    docTitle: c.docTitle,
    tier,
    path,
    paymentMethod: isUpfront ? 'upfront' : 'dd',
    tierLabel: tierLabel(tier, path),
    startDate: startDate || null,
    provider: PROVIDER,
    about: isUpfront
      ? 'This Clinical Services Agreement sets out the terms under which Moveify Health Solutions will provide the services described below. Your block is paid in full upfront. By signing, you confirm you have read and understood all terms.'
      : 'This Clinical Services & Billing Agreement sets out the terms under which Moveify Health Solutions will provide the services described below and collect payments. By signing, you confirm you have read and understood all terms.',
    feesSummary: isUpfront ? upfrontTermsSummary(tier, path) : (terms ? terms.summary : null),
    parts,
    signatureNote: isUpfront
      ? 'By signing, you confirm that you have read and understood Part A (Clinical Services), agree to be bound by all terms, and agree to pay the block fee in full upfront.'
      : 'By signing, you confirm that you have read and understood both Part A (Clinical Services) and Part B (Direct Debit Request Service Agreement), agree to be bound by all terms, and confirm that you are an account holder or authorised signatory on the nominated payment account.',
  };
}

module.exports = {
  PROVIDER,
  TIER_CONTENT,
  buildAgreement,
  getTierContent,
};
