/**
 * One-off generator for backend/assets/Handout_Template.docx.
 *
 * Produces a working docxtemplater template (placeholders embedded as literal
 * text) so the handout DOCX pipeline functions end-to-end immediately. The
 * layout here is intentionally plain — it is meant to be restyled in Word by
 * the clinician without any code change, exactly like GP_Report_Template.docx.
 *
 * Run: node backend/scripts/build-handout-template.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ImageRun, HeadingLevel, PageBreak, ShadingType,
} = require('docx');

const NAVY = '132232';
const TEAL = '46C1C0';
const LABEL = 'D0EEEE';
const GREY = '64748B';

const ASSETS = path.join(__dirname, '../assets');
const LOGO_PATH = path.join(ASSETS, 'gp-report-logo.png');
const OUT_PATH = path.join(ASSETS, 'Handout_Template.docx');

// Read PNG intrinsic dimensions (IHDR width/height live at bytes 16–24) so the
// logo keeps its aspect ratio.
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const logoBuf = fs.readFileSync(LOGO_PATH);
const { width: lw, height: lh } = pngSize(logoBuf);
const LOGO_H = 96; // px (~25mm)
const LOGO_W = Math.round((lw / lh) * LOGO_H);

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'B0BEC5' };
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function txt(text, opts = {}) {
  return new TextRun({ text, font: 'Calibri', ...opts });
}
function para(runs, opts = {}) {
  return new Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { after: 120 }, ...opts });
}
function sectionHeading(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 160, after: 100 },
    keepNext: true,
    pageBreakBefore: opts.pageBreakBefore || false,
    children: [txt(text, { bold: true, color: TEAL, size: 22, allCaps: true })],
  });
}
function subHeading(text) {
  return new Paragraph({
    spacing: { before: 120, after: 60 },
    keepNext: true,
    children: [txt(text, { bold: true, color: TEAL, size: 18, allCaps: true })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({ spacing: { after: 100 }, keepLines: true, children: [txt(text, { color: NAVY, size: 19, ...opts })] });
}

// ---- Header: logo + title -------------------------------------------------
const header = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: NO_BORDERS,
  rows: [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 45, type: WidthType.PERCENTAGE },
          borders: NO_BORDERS,
          children: [new Paragraph({ children: [new ImageRun({ data: logoBuf, transformation: { width: LOGO_W, height: LOGO_H } })] })],
        }),
        new TableCell({
          width: { size: 55, type: WidthType.PERCENTAGE },
          borders: NO_BORDERS,
          verticalAlign: 'center',
          children: [
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt('Exercise Physiology Assessment Summary', { bold: true, color: NAVY, size: 21 })] }),
            new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40 }, children: [txt('{{patient_first_name}} · {{assessment_date}}', { color: GREY, size: 18 })] }),
          ],
        }),
      ],
    }),
  ],
});

// ---- Assessment results table (docxtemplater row loop) --------------------
function headerCell(text) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: TEAL, color: 'auto' },
    borders: CELL_BORDERS,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ children: [txt(text, { bold: true, color: 'FFFFFF', size: 18 })] })],
  });
}
function loopCell(content, opts = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ children: [txt(content, { color: NAVY, size: 18, ...opts })] })],
  });
}

const oaTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ tableHeader: true, children: [headerCell('Test'), headerCell('Result'), headerCell('Interpretation')] }),
    // Single loop row — open tag in first cell, close tag in last cell.
    new TableRow({
      children: [
        loopCell('{{#oa_rows}}{{test}}', { bold: true }),
        loopCell('{{result}}'),
        loopCell('{{interpretation}}{{/oa_rows}}'),
      ],
    }),
  ],
});

// ---- Pricing tiers (static) ----------------------------------------------
const tiers = [
  ['Tier 1 — Foundation · $525 ($87.50/week)', '60-min program design + 6 group sessions + 30-min reassessment + phone check-in. Medicare offset: up to $123.60 back · net cost from $401.40. Pay in full: $498.75 (5% discount). Best for: stable presentations, general deconditioning, independent patients.'],
  ['Tier 2 — Progress · $695 ($115.83/week)', '60-min program design + 5 × 30-min weekly 1:1s + 30-min reassessment. Medicare offset: up to $309 back · net cost from $386. Pay in full: $660.25 (5% discount). Best for: MSK and chronic disease, patients needing regular clinical oversight.'],
  ['Tier 3 — Performance · $875 ($145.83/week)', '60-min program design + 5 × 45-min weekly 1:1s + 30-min reassessment. Medicare offset: up to $309 back · net cost from $566. Pay in full: $831.25 (5% discount). Best for: complex neuro, cardiac, post-surgical, multi-morbidity.'],
];
const tierParas = [];
for (const [name, detail] of tiers) {
  // keepNext keeps the tier name with its detail; keepLines keeps each block
  // intact — together they stop a tier splitting across a page boundary.
  tierParas.push(new Paragraph({ spacing: { before: 100, after: 30 }, keepNext: true, keepLines: true, children: [txt(name, { bold: true, color: NAVY, size: 19 })] }));
  tierParas.push(body(detail));
}

// ---- Casual options table (static) ---------------------------------------
const casual = [
  ['1:1 Consultation (60 min)', '$170', 'Full program design or complex consultation'],
  ['1:1 Consultation (45 min)', '$130', 'Standard clinical session'],
  ['1:1 Consultation (30 min)', '$85', 'Follow-up or program adjustment'],
  ['Group Session (45-60 min)', '$30', 'Supervised floor session with your program'],
  ['Phone Check-in (10 min)', '$50', 'Brief clinical check-in'],
];
const casualTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ tableHeader: true, children: [headerCell('Service'), headerCell('Fee'), headerCell('Details')] }),
    ...casual.map(([s, f, d]) => new TableRow({ children: [loopCell(s, { bold: true }), loopCell(f, { bold: true, color: TEAL }), loopCell(d, { color: GREY })] })),
  ],
});

const doc = new Document({
  styles: { default: { document: { run: { font: 'Calibri' } } } },
  sections: [{
    properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
    children: [
      header,
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: TEAL } }, spacing: { after: 160 } }),

      sectionHeading('1  What We Found'),
      para([txt('{{what_we_found}}', { color: NAVY, size: 19 })]),
      subHeading('Assessment Results'),
      oaTable,

      sectionHeading("2  What We'll Focus On"),
      para([txt('{{what_we_focus}}', { color: NAVY, size: 19 })]),

      sectionHeading('Section 3 — Your Options', { pageBreakBefore: true }),
      subHeading('Treatment Blocks — 6 Weeks'),
      body('Payment: weekly direct debit over 6 weeks, or pay in full with 5% discount. Includes: unlimited gym access + Moveify app.'),
      ...tierParas,
      subHeading('Not Ready to Commit? Casual Options'),
      body("If you'd prefer to try a session or two before committing to a block, that's completely fine."),
      casualTable,
      body('Note: if you decide to commit to a treatment block within 7 days of your casual sessions, the fees paid are credited toward your block price.', { color: GREY, size: 16 }),

      sectionHeading('Section 4 — Medicare and Health Fund Offsets'),
      subHeading('Medicare CDM Rebates'),
      body('If you have a Chronic Disease Management (CDM) plan from your GP, you are eligible for up to 5 Medicare-rebated allied health sessions per calendar year. Each eligible 1:1 session earns a rebate of $61.80.'),
      subHeading('Private Health Insurance'),
      body('If you hold extras cover, you may be able to claim a rebate on Exercise Physiology sessions. You cannot claim both Medicare and PHI on the same session.'),

      sectionHeading('Section 5 — Next Steps'),
      body('• Choose your program above and let Ryan know today'),
      body("• If you'd like to take this home and think it over, that's completely fine"),
      body('• Questions? Call or email: ryan@moveifyhealth.com'),

      new Paragraph({
        spacing: { before: 200 },
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB' } },
        children: [txt('Moveify Health Solutions · ryan@moveifyhealth.com · 0435 524 991 · ABN 52 263 141 529 · 4 George St, Williamstown SA', { color: '9CA3AF', size: 15 })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`[build-handout-template] wrote ${OUT_PATH} (${buf.length} bytes), logo ${LOGO_W}x${LOGO_H}px`);
});
