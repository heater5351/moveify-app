/**
 * One-off generator for backend/assets/Reassessment_Template.docx.
 *
 * The reassessment companion to the patient handout (build-handout-template.js).
 * Where the handout is a single point-in-time snapshot, this report compares a
 * patient's baseline assessment against their latest reassessment: a before/after
 * results table with a grounded change column, plus a short progress narrative.
 *
 * Shares all brand styling with the handout via handout-kit.js. This file only
 * holds the reassessment-specific pieces (comparison table) and the document
 * body / runtime tokens. Restyle in LibreOffice without code.
 *
 * Run: node backend/scripts/build-reassessment-template.js
 */
const fs = require('fs');
const path = require('path');
const {
  Paragraph, Table, TableRow, WidthType,
  NAVY, TEAL, INK, SUB,
  ASSETS, NONE, t, SPACER,
  masthead, banner, eyebrow, section, navyHeaderCell, bodyCell, subHeading, footerRule, buildDoc, Packer,
} = require('./handout-kit');

const OUT_PATH = path.join(ASSETS, 'Reassessment_Template.docx');

// ── Before/after comparison table ────────────────────────────────────────────
// Mirrors the handout's assessment table loop pattern: the {{#comparison_rows}}
// open tag lives in the first cell and the {{/comparison_rows}} close in the
// last, so docxtemplater (paragraphLoop) repeats the whole row per finding.
function comparisonTable() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NONE,
    columnWidths: [2300, 1350, 1350, 1500, 3100],
    rows: [
      new TableRow({ tableHeader: true, children: [
        navyHeaderCell('Test', 24), navyHeaderCell('Baseline', 14), navyHeaderCell('Latest', 14),
        navyHeaderCell('Change', 16), navyHeaderCell('What It Means', 32),
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

const doc = buildDoc([
  // ───────── PAGE 1 — Progress narrative ─────────
  masthead(),
  banner(
    eyebrow('Exercise Physiology  ·  Reassessment Summary'),
    [t('How far you’ve come, ', { bold: true, color: 'FFFFFF', size: 48 }), t('{{patient_first_name}}', { bold: true, color: TEAL, size: 48 }), t('.', { bold: true, color: 'FFFFFF', size: 48 })],
    [t('Baseline ', { color: 'E6EDF2', size: 22 }), t('{{baseline_date}}', { color: 'FFFFFF', bold: true, size: 22 }), t('  →  ', { color: TEAL, bold: true, size: 22 }), t('Reassessed ', { color: 'E6EDF2', size: 22 }), t('{{latest_date}}', { color: 'FFFFFF', bold: true, size: 22 })],
  ),
  SPACER(240),
  section(1, 'Your Progress', 'progress'),
  section(2, 'Where We Go Next', 'next_steps'),

  // ───────── PAGE 2 — Before/after results ─────────
  new Paragraph({ pageBreakBefore: true, children: [] }),
  masthead(),
  banner(
    eyebrow('Exercise Physiology  ·  Results Compared'),
    [t('Your results, ', { bold: true, color: 'FFFFFF', size: 48 }), t('then and now', { bold: true, color: TEAL, size: 48 }), t('.', { bold: true, color: 'FFFFFF', size: 48 })],
    [t('Same tests, measured again so progress is objective', { color: 'E6EDF2', size: 22 })],
  ),
  SPACER(240),
  subHeading('Before & After'),
  comparisonTable(),
  subHeading('What Your Progress Means'),
  new Paragraph({ keepLines: true, children: [t('{{results_summary}}', { color: INK, size: 23 })] }),
  footerRule(),
]);

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`[build-reassessment-template] wrote ${OUT_PATH} (${buf.length} bytes)`);
});
