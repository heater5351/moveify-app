/**
 * One-off generator for backend/assets/Handout_Template.docx.
 *
 * Replicates the "Geometric Whitepaper" (V4) patient-handout design as closely
 * as docx allows: full-width navy banners (shaded cells), big teal section
 * numerals, full-width tier cards, and navy table headers. The diagonal corner
 * accent and some finesse from the HTML design can't survive in docx, but the
 * layout and colour blocking carry over. Restyle in LibreOffice without code.
 *
 * All brand constants and shared building blocks live in handout-kit.js (shared
 * with build-continuity-handout.js). This file only holds the handout-specific
 * pieces (assessment table, tier band) and the document body / runtime tokens.
 *
 * Run: node backend/scripts/build-handout-template.js
 */
const fs = require('fs');
const path = require('path');
const {
  Paragraph, Table, TableRow, TableCell, WidthType,
  NAVY, TEAL, OCEAN, INK, SUB, SOFT, RULE,
  ASSETS, NONE, edge, t, shadeCell, fullWidthTable, SPACER,
  masthead, banner, eyebrow, section, navyHeaderCell, bodyCell, subHeading,
  tierCard, offsets, footerRule, buildDoc, Packer,
} = require('./handout-kit');

const OUT_PATH = path.join(ASSETS, 'Handout_Template.docx');

// ── Page 2: assessment results table ─────────────────────────────────────────
function assessmentTable() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NONE,
    columnWidths: [3100, 2100, 4400],
    rows: [
      new TableRow({ tableHeader: true, children: [navyHeaderCell('Test', 32), navyHeaderCell('Result', 22), navyHeaderCell('Interpretation')] }),
      new TableRow({ children: [
        bodyCell([t('{{#assessment_rows}}{{test}}', { color: NAVY, bold: true, size: 22 })]),
        bodyCell([t('{{result}}', { color: NAVY, bold: true, size: 22 })]),
        bodyCell([t('{{interpretation}}{{/assessment_rows}}', { color: SUB, size: 22 })]),
      ] }),
    ],
  });
}

// ── Page 3: teal tier band ───────────────────────────────────────────────────
function tierBand() {
  return fullWidthTable([new TableRow({ children: [
    shadeCell(TEAL, [new Paragraph({ children: [t('Choose Your Tier', { bold: true, color: NAVY, size: 30 })] })]),
  ] })]);
}

// ── Page 4: casual options table ─────────────────────────────────────────────
function casualTable() {
  const rows = [
    ['1:1 Consultation (60 min)', '$170', 'Full program design or complex consultation'],
    ['1:1 Consultation (45 min)', '$130', 'Standard clinical session'],
    ['1:1 Consultation (30 min)', '$85', 'Follow-up or program adjustment'],
    ['Group Session (45–60 min)', '$30', 'Supervised floor session with your program'],
    ['Phone Check-in (10 min)', '$50', 'Brief clinical check-in'],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NONE,
    columnWidths: [4400, 1600, 3600],
    rows: [
      new TableRow({ tableHeader: true, children: [navyHeaderCell('Service', 44), navyHeaderCell('Fee', 16), navyHeaderCell('Details')] }),
      ...rows.map(([s, f, d]) => new TableRow({ cantSplit: true, children: [
        bodyCell([t(s, { color: INK, size: 22 })]),
        bodyCell([t(f, { color: NAVY, bold: true, size: 22 })]),
        bodyCell([t(d, { color: SUB, size: 22 })]),
      ] })),
    ],
  });
}

// Block tier card: weekly DD hero + total / pay-in-full footer.
function blockTierCard(pill, name, weekly, total, upfront, includes) {
  const footRuns = [
    t(`${total} total`, { bold: true, color: NAVY, size: 18 }),
    t('  ·  ', { color: TEAL, bold: true, size: 18 }),
    t(`or ${upfront} paid in full `, { color: INK, size: 18 }),
    t('(save 5%)', { bold: true, color: OCEAN, size: 18 }),
  ];
  return tierCard(pill, name, weekly, 'per week · 6-week direct debit', footRuns, includes);
}

const doc = buildDoc([
  // ───────── PAGE 1 ─────────
  masthead(),
  banner(
    eyebrow('Exercise Physiology  ·  Assessment Summary'),
    [t('A plan for ', { bold: true, color: 'FFFFFF', size: 52 }), t('{{patient_first_name}}', { bold: true, color: TEAL, size: 52 }), t('.', { bold: true, color: 'FFFFFF', size: 52 })],
    [t('Prepared ', { color: 'E6EDF2', size: 22 }), t('{{assessment_date}}', { color: 'FFFFFF', bold: true, size: 22 })],
  ),
  SPACER(240),
  section(1, "What's Going On", 'whats_going_on'),
  section(2, "What We're Aiming For", 'our_aims'),
  section(3, "How We'll Get There", 'how_we_get_there', '↘ 1:1 support is flexible. See Your Options.'),
  section(4, 'What You Can Expect', 'what_to_expect'),

  // ───────── PAGE 2 — Assessment results ─────────
  new Paragraph({ pageBreakBefore: true, children: [] }),
  masthead(),
  banner(
    eyebrow('Exercise Physiology  ·  Assessment'),
    [t('Understanding your ', { bold: true, color: 'FFFFFF', size: 52 }), t('results', { bold: true, color: TEAL, size: 52 }), t('.', { bold: true, color: 'FFFFFF', size: 52 })],
    [t('Measured ', { color: 'E6EDF2', size: 22 }), t('{{assessment_date}}', { color: 'FFFFFF', bold: true, size: 22 })],
  ),
  SPACER(240),
  subHeading('Your Results at a Glance'),
  assessmentTable(),
  subHeading('What Your Results Mean'),
  new Paragraph({ keepLines: true, children: [t('{{results_summary}}', { color: INK, size: 23 })] }),

  // ───────── PAGE 3 — Treatment options ─────────
  new Paragraph({ pageBreakBefore: true, children: [] }),
  masthead(),
  banner(
    eyebrow('Treatment Options'),
    [t('Your ', { bold: true, color: 'FFFFFF', size: 52 }), t('treatment', { bold: true, color: TEAL, size: 52 }), t(' options.', { bold: true, color: 'FFFFFF', size: 52 })],
    [t('6-week blocks', { color: 'E6EDF2', size: 22 }), t('  ·  ', { color: TEAL, bold: true, size: 22 }), t('Three tiers of 1:1 support', { color: 'FFFFFF', bold: true, size: 22 })],
  ),
  SPACER(240),
  new Paragraph({ keepLines: true, spacing: { after: 240 }, children: [
    t('How it works. ', { bold: true, color: NAVY, size: 23 }),
    t('Payment is a weekly direct debit over 6 weeks. The clinical program is the same across all three tiers — they differ in how much 1:1 support and supervision you receive.', { color: INK, size: 23 }),
  ] }),
  tierBand(),
  SPACER(200),
  blockTierCard('Tier 3', 'Performance', '$143.33', '$860', '$817', [
    '60-min 1:1 program design',
    '4 × 45-min weekly 1:1 sessions',
    '30-min reassessment',
    'Unlimited gym access',
    'Moveify app access',
    'Ongoing support',
  ]),
  SPACER(220),
  blockTierCard('Tier 2', 'Progress', '$113.33', '$680', '$646', [
    '60-min 1:1 program design',
    '4 × 30-min weekly 1:1 sessions',
    '30-min reassessment',
    'Unlimited gym access',
    'Moveify app access',
    'Ongoing support',
  ]),
  SPACER(220),
  blockTierCard('Tier 1', 'Foundation', '$76.67', '$460', '$437', [
    '60-min 1:1 program design',
    '4 × group sessions',
    '30-min reassessment',
    'Unlimited gym access',
    'Moveify app access',
    'Ongoing support',
  ]),

  // ───────── PAGE 4 — Casual options & rebates ─────────
  new Paragraph({ pageBreakBefore: true, children: [] }),
  masthead(),
  subHeading('Casual Options'),
  casualTable(),
  new Paragraph({ spacing: { before: 120 }, keepLines: true, children: [t('↳  ', { color: TEAL, bold: true, size: 22 }), t('Commit to a treatment block within 7 days of your casual sessions and the fees paid are credited toward your block price.', { color: OCEAN, size: 19 })] }),
  subHeading('Rebates & Offsets'),
  offsets(),
  new Paragraph({
    spacing: { before: 360, after: 80 }, border: { top: edge(RULE, 4) },
    children: [t('Ready when you are. ', { bold: true, color: NAVY, size: 26 }), t('Call or email any time.', { bold: true, color: TEAL, size: 26 })],
  }),
  new Paragraph({ children: [t('ryan@moveifyhealth.com', { color: NAVY, bold: true, size: 20 }), t('  ·  ', { color: TEAL, bold: true, size: 20 }), t('0435 524 991', { color: SUB, size: 20 })] }),
  footerRule(),
]);

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`[build-handout-template] wrote ${OUT_PATH} (${buf.length} bytes)`);
});
