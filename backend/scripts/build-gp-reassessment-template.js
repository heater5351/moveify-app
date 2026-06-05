/**
 * One-off generator for backend/assets/GP_Reassessment_Template.docx.
 *
 * The GP-facing companion to the patient reassessment handout: same before/after
 * comparison engine, but written clinician-to-GP and laid out as a formal referral
 * letter. Blends the reassessment handout's brand styling (handout-kit.js masthead,
 * navy table headers, teal accents) with the GP report's letter structure
 * (recipient block, Re: line, clinical sections, sign-off).
 *
 * Run: node backend/scripts/build-gp-reassessment-template.js
 */
const fs = require('fs');
const path = require('path');
const {
  Paragraph, Table, TableRow, WidthType, AlignmentType,
  NAVY, TEAL, INK, SUB, RULE,
  ASSETS, NONE, edge, t, SPACER,
  masthead, navyHeaderCell, bodyCell, subHeading, footerRule, buildDoc, Packer,
} = require('./handout-kit');

const OUT_PATH = path.join(ASSETS, 'GP_Reassessment_Template.docx');

// Before/after comparison table — clinician-facing "Clinical Interpretation" column.
function comparisonTable() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NONE,
    columnWidths: [2300, 1350, 1350, 1500, 3100],
    rows: [
      new TableRow({ tableHeader: true, children: [
        navyHeaderCell('Measure', 24), navyHeaderCell('Baseline', 14), navyHeaderCell('Latest', 14),
        navyHeaderCell('Change', 16), navyHeaderCell('Clinical Interpretation', 32),
      ] }),
      new TableRow({ children: [
        bodyCell([t('{{#comparison_rows}}{{test}}', { color: NAVY, bold: true, size: 22 })]),
        bodyCell([t('{{baseline}}', { color: SUB, size: 22 })]),
        bodyCell([t('{{latest}}', { color: NAVY, bold: true, size: 22 })]),
        bodyCell([t('{{change}}', { color: NAVY, bold: true, size: 22 })]),
        bodyCell([t('{{interpretation}}{{/comparison_rows}}', { color: SUB, size: 22 })]),
      ] }),
    ],
  });
}

const para = (token) => new Paragraph({ keepLines: true, spacing: { after: 160 }, children: [t(`{{${token}}}`, { color: INK, size: 22 })] });

const doc = buildDoc([
  masthead(),
  // Letter meta + recipient
  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 120, after: 200 }, children: [t('{{report_date}}', { color: SUB, size: 20 })] }),
  new Paragraph({ spacing: { after: 20 }, children: [t('{{gp_name}}', { color: NAVY, bold: true, size: 22 })] }),
  new Paragraph({ spacing: { after: 20 }, children: [t('{{practice_name}}', { color: INK, size: 21 })] }),
  new Paragraph({ spacing: { after: 200 }, children: [t('{{practice_address}}', { color: SUB, size: 20 })] }),
  new Paragraph({ spacing: { after: 160 }, children: [t('Dear Dr {{gp_name}},', { color: INK, size: 22 })] }),
  // Re: line — teal-accented, brand touch
  new Paragraph({
    spacing: { after: 240 }, border: { bottom: edge(TEAL, 12) },
    children: [
      t('RE: ', { color: TEAL, bold: true, size: 22 }),
      t('{{patient_full_name}}', { color: NAVY, bold: true, size: 22 }),
      t('  (DOB {{patient_dob}})  ', { color: SUB, size: 20 }),
      t('— Exercise Physiology Reassessment', { color: NAVY, bold: true, size: 22 }),
    ],
  }),
  new Paragraph({ spacing: { after: 200 }, children: [
    t('Baseline ', { color: SUB, size: 20 }), t('{{baseline_date}}', { color: NAVY, bold: true, size: 20 }),
    t('   →   ', { color: TEAL, bold: true, size: 20 }),
    t('Reassessed ', { color: SUB, size: 20 }), t('{{latest_date}}', { color: NAVY, bold: true, size: 20 }),
  ] }),

  subHeading('Executive Summary'),
  para('executive_summary'),

  subHeading('Objective Findings — Baseline vs Latest'),
  comparisonTable(),

  subHeading('Clinical Interpretation'),
  para('clinical_interpretation'),

  subHeading('Recommendations'),
  para('recommendations'),

  // Sign-off
  new Paragraph({ spacing: { before: 280, after: 40 }, children: [t('Kind regards,', { color: INK, size: 22 })] }),
  SPACER(120),
  new Paragraph({ spacing: { after: 10 }, children: [t('Ryan Heath', { color: NAVY, bold: true, size: 24 })] }),
  new Paragraph({ spacing: { after: 4 }, children: [t('BClinExPhys (Hons)  ·  Accredited Exercise Physiologist', { color: SUB, size: 20 })] }),
  new Paragraph({ children: [t('Moveify Health Solutions', { color: NAVY, bold: true, size: 20 }), t('  ·  ', { color: TEAL, bold: true, size: 20 }), t('0435 524 991', { color: SUB, size: 20 }), t('  ·  ', { color: TEAL, bold: true, size: 20 }), t('ryan@moveifyhealth.com', { color: SUB, size: 20 })] }),
  footerRule(),
]);

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`[build-gp-reassessment-template] wrote ${OUT_PATH} (${buf.length} bytes)`);
});
