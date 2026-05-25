/**
 * One-off generator for backend/assets/Handout_Template.docx.
 *
 * Replicates the "Geometric Whitepaper" (V4) patient-handout design as closely
 * as docx allows: full-width navy banners (shaded cells), big teal section
 * numerals, a 3-column tier grid, and navy table headers. The diagonal corner
 * accent and some finesse from the HTML design can't survive in docx, but the
 * layout and colour blocking carry over. Restyle in LibreOffice without code.
 *
 * Font: Manrope (install it in LibreOffice for an exact match; otherwise it
 * substitutes a metric-compatible sans).
 *
 * Run: node backend/scripts/build-handout-template.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ImageRun, ShadingType, VerticalAlign,
} = require('docx');

const NAVY = '132232';
const TEAL = '46C1C0';
const OCEAN = '045E62';
const INK = '1A2230';
const SUB = '56606E';
const SOFT = '94A3B8';
const RULE = 'E2E8F0';
const FONT = 'Manrope';

const ASSETS = path.join(__dirname, '../assets');
const LOGO_PATH = path.join(ASSETS, 'gp-report-logo.png');
const OUT_PATH = path.join(ASSETS, 'Handout_Template.docx');

function pngSize(buf) { return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }; }
const logoBuf = fs.readFileSync(LOGO_PATH);
const { width: lw, height: lh } = pngSize(logoBuf);
const LOGO_H = 50;
const LOGO_W = Math.round((lw / lh) * LOGO_H);

const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NONE = { top: NB, bottom: NB, left: NB, right: NB };
function edge(color, size = 4) { return { style: BorderStyle.SINGLE, size, color }; }

function t(text, opts = {}) { return new TextRun({ text, font: FONT, ...opts }); }
function shadeCell(fill, children, opts = {}) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    borders: NONE,
    margins: { top: 220, bottom: 200, left: 360, right: 360 },
    children, ...opts,
  });
}
function fullWidthTable(rows) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NONE, rows });
}

// ── Masthead: logo (left) + practice meta (right), bottom rule ──────────────
function masthead() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NB, left: NB, right: NB, bottom: edge(RULE, 4), insideHorizontal: NB, insideVertical: NB },
    rows: [new TableRow({ children: [
      new TableCell({
        borders: NONE, verticalAlign: VerticalAlign.CENTER, margins: { top: 120, bottom: 160, left: 0, right: 0 },
        children: [new Paragraph({ children: [new ImageRun({ data: logoBuf, transformation: { width: LOGO_W, height: LOGO_H } })] })],
      }),
      new TableCell({
        borders: NONE, verticalAlign: VerticalAlign.CENTER, margins: { top: 120, bottom: 160, left: 0, right: 0 },
        children: [
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('Moveify Health Solutions', { bold: true, color: NAVY, size: 17 })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 20 }, children: [
            t('4 George St, Williamstown SA 5351', { color: SUB, size: 17 }),
            t('  ·  ', { color: TEAL, bold: true, size: 17 }),
            t('0435 524 991', { color: SUB, size: 17 }),
            t('  ·  ', { color: TEAL, bold: true, size: 17 }),
            t('ryan@moveifyhealth.com', { color: SUB, size: 17 }),
          ] }),
        ],
      }),
    ] })],
  });
}

// ── Navy banner: eyebrow + big title + sub, with a teal accent bar on right ──
function banner(eyebrowRuns, titleRuns, subRuns) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NONE,
    columnWidths: [8600, 1000],
    rows: [new TableRow({ children: [
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: NAVY }, borders: NONE,
        margins: { top: 360, bottom: 340, left: 360, right: 200 },
        children: [
          new Paragraph({ spacing: { after: 120 }, children: eyebrowRuns }),
          new Paragraph({ spacing: { after: 120 }, children: titleRuns }),
          new Paragraph({ children: subRuns }),
        ],
      }),
      new TableCell({ shading: { type: ShadingType.CLEAR, color: 'auto', fill: TEAL }, borders: NONE, children: [new Paragraph({ children: [] })] }),
    ] })],
  });
}

function eyebrow(text) {
  return [t(text.toUpperCase(), { color: TEAL, bold: true, size: 17, allCaps: true, characterSpacing: 40 })];
}

// ── Numbered section: big teal numeral | uppercase title + body ─────────────
function section(num, title, bodyToken, asideText) {
  const contentChildren = [
    new Paragraph({ spacing: { after: 80 }, children: [t(title.toUpperCase(), { bold: true, color: NAVY, size: 26, allCaps: true, characterSpacing: 16 })] }),
  ];
  if (bodyToken) {
    contentChildren.push(new Paragraph({ keepLines: true, children: [t(bodyToken, { color: INK, size: 21 })] }));
  }
  if (asideText) {
    contentChildren.push(new Paragraph({
      spacing: { before: 120 }, keepLines: true,
      border: { top: edge(TEAL, 16) },
      children: [t(asideText, { color: OCEAN, bold: true, size: 20 })],
    }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NONE,
    columnWidths: [1100, 8500],
    rows: [new TableRow({ cantSplit: true, children: [
      new TableCell({ borders: NONE, margins: { top: 80, bottom: 240, left: 0, right: 200 }, children: [
        new Paragraph({ children: [t(String(num), { bold: true, color: TEAL, size: 64 })] }),
      ] }),
      new TableCell({ borders: NONE, margins: { top: 80, bottom: 240, left: 0, right: 0 }, children: contentChildren }),
    ] })],
  });
}

// ── Tables (assessment results / casual options) ────────────────────────────
function navyHeaderCell(text, widthPct) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: NAVY },
    borders: { top: NB, left: NB, right: NB, bottom: NB },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ children: [t(text.toUpperCase(), { bold: true, color: 'FFFFFF', size: 17, allCaps: true, characterSpacing: 24 })] })],
  });
}
function bodyCell(runsOrText, opts = {}) {
  const runs = typeof runsOrText === 'string' ? [t(runsOrText, { color: INK, size: 20, ...opts })] : runsOrText;
  return new TableCell({
    borders: { top: NB, left: NB, right: NB, bottom: edge(RULE, 4) },
    margins: { top: 140, bottom: 140, left: 200, right: 200 },
    children: [new Paragraph({ children: runs })],
  });
}

function assessmentTable() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NONE,
    columnWidths: [3100, 2100, 4400],
    rows: [
      new TableRow({ tableHeader: true, children: [navyHeaderCell('Test', 32), navyHeaderCell('Result', 22), navyHeaderCell('Interpretation')] }),
      new TableRow({ children: [
        bodyCell([t('{{#assessment_rows}}{{test}}', { color: NAVY, bold: true, size: 20 })]),
        bodyCell([t('{{result}}', { color: NAVY, bold: true, size: 20 })]),
        bodyCell([t('{{interpretation}}{{/assessment_rows}}', { color: SUB, size: 20 })]),
      ] }),
    ],
  });
}

// ── Page 2: teal tier band + 3-column tier grid ─────────────────────────────
function tierBand() {
  return fullWidthTable([new TableRow({ children: [
    shadeCell(TEAL, [new Paragraph({ children: [t('Choose Your Tier', { bold: true, color: NAVY, size: 30 })] })]),
  ] })]);
}

function tierCell(pill, name, price, per, includes, isFirst, isLast) {
  return new TableCell({
    borders: { top: NB, bottom: edge(NAVY, 24), left: NB, right: isLast ? NB : edge(RULE, 4) },
    margins: { top: 240, bottom: 280, left: isFirst ? 0 : 200, right: isLast ? 0 : 200 },
    children: [
      new Paragraph({ spacing: { after: 80 }, border: { bottom: edge(TEAL, 16) }, children: [t(pill.toUpperCase(), { bold: true, color: TEAL, size: 15, allCaps: true, characterSpacing: 24 })] }),
      new Paragraph({ spacing: { before: 120, after: 120 }, children: [t(name, { bold: true, color: NAVY, size: 26 })] }),
      new Paragraph({ children: [t(price, { bold: true, color: NAVY, size: 48 })] }),
      new Paragraph({ spacing: { after: 120 }, children: [t(per, { color: SUB, size: 18 })] }),
      new Paragraph({ keepLines: true, spacing: { after: 120 }, children: [t(includes, { color: INK, size: 19 })] }),
      new Paragraph({ border: { top: edge(RULE, 4) }, spacing: { before: 80 }, children: [t('↓ Medicare & private health rebates available', { color: OCEAN, bold: true, size: 16 })] }),
    ],
  });
}

function tierGrid() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NONE,
    columnWidths: [3200, 3200, 3200],
    rows: [new TableRow({ cantSplit: true, children: [
      tierCell('Tier 1', 'Foundation', '$510', '$85 / week over 6 weeks', '60-min program design, 4 group sessions, and a 30-min reassessment.', true, false),
      tierCell('Tier 2', 'Progress', '$680', '$113.33 / week over 6 weeks', '60-min program design, 4 × 30-min weekly 1:1 sessions, and a 30-min reassessment.', false, false),
      tierCell('Tier 3', 'Performance', '$860', '$143.33 / week over 6 weeks', '60-min program design, 4 × 45-min weekly 1:1 sessions, and a 30-min reassessment.', false, true),
    ] })],
  });
}

function subHeading(text) {
  return new Paragraph({
    spacing: { before: 240, after: 160 }, keepNext: true,
    children: [t('▬  ', { color: TEAL, bold: true, size: 26 }), t(text.toUpperCase(), { bold: true, color: NAVY, size: 26, allCaps: true, characterSpacing: 16 })],
  });
}

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
        bodyCell([t(s, { color: INK, size: 20 })]),
        bodyCell([t(f, { color: NAVY, bold: true, size: 20 })]),
        bodyCell([t(d, { color: SUB, size: 20 })]),
      ] })),
    ],
  });
}

function offsets() {
  function offsetCell(name, runs, isFirst) {
    return new TableCell({
      borders: NONE, margins: { top: 0, bottom: 0, left: isFirst ? 0 : 200, right: isFirst ? 200 : 0 },
      children: [
        new Paragraph({ border: { bottom: edge(TEAL, 16) }, spacing: { after: 120 }, children: [t(name.toUpperCase(), { bold: true, color: NAVY, size: 20, allCaps: true, characterSpacing: 12 })] }),
        new Paragraph({ keepLines: true, children: runs }),
      ],
    });
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: NONE, columnWidths: [4800, 4800],
    rows: [new TableRow({ children: [
      offsetCell('Medicare CDM', [
        t('If you have a Chronic Disease Management plan from your GP, you are eligible for up to 5 Medicare-rebated allied health sessions per calendar year. Each eligible 1:1 session earns a rebate of ', { color: INK, size: 20 }),
        t('$61.80', { color: NAVY, bold: true, size: 20 }), t('.', { color: INK, size: 20 }),
      ], true),
      offsetCell('Private Health', [
        t('If you hold extras cover, you may be able to claim a rebate on Exercise Physiology sessions. You cannot claim both Medicare and PHI on the same session.', { color: INK, size: 20 }),
      ], false),
    ] })],
  });
}

const SPACER = (h = 160) => new Paragraph({ spacing: { after: h }, children: [] });

const doc = new Document({
  styles: { default: { document: { run: { font: FONT } } } },
  sections: [{
    properties: { page: { margin: { top: 480, bottom: 480, left: 620, right: 620 } } },
    children: [
      // ───────── PAGE 1 ─────────
      masthead(),
      banner(
        eyebrow('Exercise Physiology  ·  Assessment Summary'),
        [t('A plan for ', { bold: true, color: 'FFFFFF', size: 52 }), t('{{patient_first_name}}', { bold: true, color: TEAL, size: 52 }), t('.', { bold: true, color: 'FFFFFF', size: 52 })],
        [t('Prepared ', { color: 'E6EDF2', size: 22 }), t('{{assessment_date}}', { color: 'FFFFFF', bold: true, size: 22 })],
      ),
      SPACER(240),
      section(1, "What's Going On", '{{whats_going_on}}'),
      section(2, "What We're Aiming For", '{{our_aims}}'),
      section(3, "How We'll Get There", '{{how_we_get_there}}', '↘ 1:1 support is flexible. See Your Options.'),
      section(4, 'What You Can Expect', '{{what_to_expect}}'),
      section(5, 'Your Assessment Results', null),
      assessmentTable(),

      // ───────── PAGE 2 ─────────
      new Paragraph({ pageBreakBefore: true, children: [] }),
      masthead(),
      banner(
        eyebrow('Treatment Options  ·  Page 2 of 2'),
        [t('Your ', { bold: true, color: 'FFFFFF', size: 52 }), t('treatment', { bold: true, color: TEAL, size: 52 }), t(' options.', { bold: true, color: 'FFFFFF', size: 52 })],
        [t('6-week blocks', { color: 'E6EDF2', size: 22 }), t('  ·  ', { color: TEAL, bold: true, size: 22 }), t('Three tiers of 1:1 support', { color: 'FFFFFF', bold: true, size: 22 })],
      ),
      SPACER(240),
      new Paragraph({ keepLines: true, spacing: { after: 240 }, children: [
        t('How it works. ', { bold: true, color: NAVY, size: 21 }),
        t('Payment is weekly direct debit over 6 weeks, or pay in full with a 5% discount. Every tier includes unlimited gym access and the Moveify app. The clinical program is the same across all three — the tiers differ in how much 1:1 support and supervision you receive.', { color: INK, size: 21 }),
      ] }),
      tierBand(),
      SPACER(160),
      tierGrid(),
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
      new Paragraph({
        spacing: { before: 280 }, alignment: AlignmentType.CENTER, border: { top: edge(RULE, 4) },
        children: [t('Moveify Health Solutions', { color: SOFT, size: 15 }), t('  ·  ', { color: TEAL, bold: true, size: 15 }), t('ABN 52 263 141 529', { color: SOFT, size: 15 }), t('  ·  ', { color: TEAL, bold: true, size: 15 }), t('4 George St, Williamstown SA 5351', { color: SOFT, size: 15 })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`[build-handout-template] wrote ${OUT_PATH} (${buf.length} bytes), logo ${LOGO_W}x${LOGO_H}px`);
});
