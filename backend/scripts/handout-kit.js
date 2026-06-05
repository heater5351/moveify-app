/**
 * Shared brand kit for the Moveify patient handouts.
 *
 * Holds the "Geometric Whitepaper" (V4) brand constants and the reusable docx
 * building blocks (masthead, navy banners, numbered sections, tier cards,
 * casual table, Medicare/PHI offsets). Imported by:
 *   - build-handout-template.js   → assets/Handout_Template.docx (per-patient, runtime-filled)
 *   - build-continuity-handout.js → assets/Continuity_Options.docx (static price sheet)
 *
 * Keep all styling here so both sheets stay visually identical; restyle once.
 *
 * Font: Manrope (install it in LibreOffice for an exact match; otherwise it
 * substitutes a metric-compatible sans).
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ImageRun, ShadingType, VerticalAlign,
} = require('docx');

// ── Brand palette ───────────────────────────────────────────────────────────
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

function pngSize(buf) { return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }; }
const logoBuf = fs.readFileSync(LOGO_PATH);
const { width: lw, height: lh } = pngSize(logoBuf);
const LOGO_H = 50;
const LOGO_W = Math.round((lw / lh) * LOGO_H);

// ── Borders ─────────────────────────────────────────────────────────────────
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NONE = { top: NB, bottom: NB, left: NB, right: NB };
function edge(color, size = 4) { return { style: BorderStyle.SINGLE, size, color }; }

// ── Primitives ──────────────────────────────────────────────────────────────
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
const SPACER = (h = 160) => new Paragraph({ spacing: { after: h }, children: [] });

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

// ── Numbered section: big teal numeral | uppercase title + bulleted body ────
// `loopVar` is the name of an array token (e.g. 'whats_going_on'). docxtemplater
// repeats the bullet paragraph once per item via the {{#..}}/{{/..}} pair.
function section(num, title, loopVar, asideText) {
  const contentChildren = [
    new Paragraph({ spacing: { after: 100 }, children: [t(title.toUpperCase(), { bold: true, color: NAVY, size: 28, allCaps: true, characterSpacing: 16 })] }),
  ];
  if (loopVar) {
    contentChildren.push(new Paragraph({ children: [t(`{{#${loopVar}}}`)] }));
    contentChildren.push(new Paragraph({
      bullet: { level: 0 }, keepLines: true, spacing: { after: 100 },
      children: [t('{{.}}', { color: INK, size: 23 })],
    }));
    contentChildren.push(new Paragraph({ children: [t(`{{/${loopVar}}}`)] }));
  }
  if (asideText) {
    contentChildren.push(new Paragraph({
      spacing: { before: 140 }, keepLines: true,
      border: { top: edge(TEAL, 16) },
      children: [t(asideText, { color: OCEAN, bold: true, size: 21 })],
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

// ── Table cells ─────────────────────────────────────────────────────────────
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

function subHeading(text) {
  return new Paragraph({
    spacing: { before: 240, after: 160 }, keepNext: true,
    children: [t('▬  ', { color: TEAL, bold: true, size: 26 }), t(text.toUpperCase(), { bold: true, color: NAVY, size: 26, allCaps: true, characterSpacing: 16 })],
  });
}

// ── Full-width tier card ─────────────────────────────────────────────────────
// Price/identity on the left, what's included on the right. Generic across the
// block sheet (weekly DD + pay-in-full) and the continuity sheet (4-weekly).
//   hero     — big price string, e.g. '$130'
//   subline  — under the hero, e.g. 'per week · billed every 4 weeks'
//   footRuns — TextRun[] for the bottom rule line (totals / cancel terms)
//   includes — bullet lines
//   opts.showRebate — append the Medicare/PHI aside (default true; drop for tiers without 1:1s)
function tierCard(pill, name, hero, subline, footRuns, includes, { showRebate = true } = {}) {
  const leftChildren = [
    new Paragraph({ spacing: { after: 80 }, border: { bottom: edge(TEAL, 16) }, children: [t(pill.toUpperCase(), { bold: true, color: TEAL, size: 16, allCaps: true, characterSpacing: 24 })] }),
    new Paragraph({ spacing: { before: 120, after: 100 }, children: [t(name, { bold: true, color: NAVY, size: 30 })] }),
    new Paragraph({ children: [t(hero, { bold: true, color: NAVY, size: 56 })] }),
    new Paragraph({ spacing: { after: 100 }, children: [t(subline, { color: SUB, size: 18 })] }),
    new Paragraph({ border: { top: edge(RULE, 4) }, spacing: { before: 80 }, children: footRuns }),
  ];
  const rightChildren = includes.map(line => new Paragraph({
    bullet: { level: 0 }, keepLines: true, spacing: { after: 40 },
    children: [t(line, { color: INK, size: 20 })],
  }));
  if (showRebate) {
    rightChildren.push(new Paragraph({ spacing: { before: 120 }, children: [t('↓ Medicare & private health rebates available', { color: OCEAN, bold: true, size: 18 })] }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NB, bottom: edge(NAVY, 24), left: NB, right: NB, insideHorizontal: NB, insideVertical: NB },
    columnWidths: [3800, 5800],
    rows: [new TableRow({ cantSplit: true, children: [
      new TableCell({
        borders: { top: NB, bottom: NB, left: NB, right: edge(RULE, 4) },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 260, bottom: 280, left: 0, right: 360 },
        children: leftChildren,
      }),
      new TableCell({
        borders: NONE,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 240, bottom: 260, left: 360, right: 0 },
        children: rightChildren,
      }),
    ] })],
  });
}

// ── Medicare CDM + Private Health offsets (two columns) ──────────────────────
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
        t('If you have a Chronic Disease Management plan from your GP, you are eligible for up to 5 Medicare-rebated allied health sessions per calendar year. Each eligible 1:1 session earns a rebate of ', { color: INK, size: 22 }),
        t('$61.80', { color: NAVY, bold: true, size: 22 }), t('.', { color: INK, size: 22 }),
      ], true),
      offsetCell('Private Health', [
        t('If you hold extras cover, you may be able to claim a rebate on Exercise Physiology sessions. You cannot claim both Medicare and PHI on the same session.', { color: INK, size: 22 }),
      ], false),
    ] })],
  });
}

// ── Footer rule line (practice name · ABN · address) ─────────────────────────
function footerRule() {
  return new Paragraph({
    spacing: { before: 280 }, alignment: AlignmentType.CENTER, border: { top: edge(RULE, 4) },
    children: [t('Moveify Health Solutions', { color: SOFT, size: 15 }), t('  ·  ', { color: TEAL, bold: true, size: 15 }), t('ABN 52 263 141 529', { color: SOFT, size: 15 }), t('  ·  ', { color: TEAL, bold: true, size: 15 }), t('4 George St, Williamstown SA 5351', { color: SOFT, size: 15 })],
  });
}

function buildDoc(children) {
  return new Document({
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [{
      properties: { page: { margin: { top: 480, bottom: 480, left: 620, right: 620 } } },
      children,
    }],
  });
}

module.exports = {
  // docx re-exports so callers don't need their own require
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ImageRun, ShadingType, VerticalAlign,
  // palette
  NAVY, TEAL, OCEAN, INK, SUB, SOFT, RULE, FONT,
  // logo
  logoBuf, LOGO_W, LOGO_H, ASSETS,
  // borders + primitives
  NB, NONE, edge, t, shadeCell, fullWidthTable, SPACER,
  // building blocks
  masthead, banner, eyebrow, section, navyHeaderCell, bodyCell, subHeading,
  tierCard, offsets, footerRule, buildDoc,
};
