const {
  Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, ImageRun,
  AlignmentType, VerticalAlign, BorderStyle, ShadingType, WidthType, HeightRule,
} = require('docx');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '../assets/gp-report-logo.png');

// Colours (matching Python script)
const NAVY   = '132232';
const TEAL   = '46C1C0';
const WHITE  = 'FFFFFF';
const DKGREY = '3A4452';
const GREY   = '9CA3AF';

// 1 cm = 567 twips
const cm = n => Math.round(n * 567);
const pt = n => n * 20;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
const LIGHT_BORDERS = (color = 'C5E5E5') => ({
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color },
  insideVertical:   { style: BorderStyle.SINGLE, size: 4, color },
});

const shd = fill => ({ type: ShadingType.CLEAR, fill, color: fill });

function run(text, { bold, italic, size = 11, color = DKGREY } = {}) {
  return new TextRun({ text, bold, italics: italic, size: size * 2, color, font: 'Calibri' });
}

function para(runs, { align, indent, after = 6, line } = {}) {
  return new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    alignment: align || AlignmentType.LEFT,
    indent: indent !== undefined ? { left: cm(indent) } : undefined,
    spacing: { before: 0, after: pt(after), ...(line ? { line: pt(line) } : {}) },
  });
}

function blank(after = 8) {
  return para(run(''), { after });
}

function bodyPara(text, opts = {}) {
  return para(run(text, { color: DKGREY, size: 12, ...opts }), { indent: 2, after: 6, line: 17 });
}

function cell(children, { bg, width, vAlign, mt = 120, mb = 120, ml = 200, mr = 200, borders } = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    shading: bg ? shd(bg) : undefined,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    verticalAlign: vAlign || VerticalAlign.CENTER,
    margins: { top: mt, bottom: mb, left: ml, right: mr },
    borders: borders || NO_BORDERS,
  });
}

function fullTable(rows, { borders } = {}) {
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: borders || NO_BORDERS,
  });
}

// Navy banner with centred white title — matches section_band() in Python
function sectionBanner(title) {
  return fullTable([
    new TableRow({ children: [cell(
      para(run(title.toUpperCase(), { bold: true, color: WHITE, size: 11 }), { align: AlignmentType.CENTER, after: 0 }),
      { bg: NAVY, mt: 180, mb: 180, ml: cm(2), mr: cm(2) },
    )] }),
  ]);
}

// Page header (logo left | navy title right) + teal accent strip
function pageHeader(logoBuffer) {
  return [
    fullTable([
      new TableRow({ children: [
        cell(
          new Paragraph({ children: [new ImageRun({ data: logoBuffer, transformation: { width: 250, height: 141 }, type: 'png' })], spacing: { before: 0, after: 0 } }),
          { bg: WHITE, width: cm(13.5), mt: 200, mb: 120, ml: cm(2), mr: 200 },
        ),
        cell(
          [
            para(run('INITIAL CONSULTATION REPORT', { bold: true, color: WHITE, size: 11 }), { align: AlignmentType.RIGHT, after: 5 }),
            para(run('Exercise Physiology  ·  Allied Health', { color: TEAL, size: 9 }), { align: AlignmentType.RIGHT, after: 0 }),
          ],
          { bg: NAVY, width: cm(7.5), mt: 200, mb: 120, ml: 300, mr: cm(1.5) },
        ),
      ] }),
    ]),
    // Teal accent strip
    fullTable([
      new TableRow({
        children: [cell(para(run(''), { after: 0 }), { bg: TEAL, mt: 55, mb: 55 })],
        height: { value: 80, rule: HeightRule.EXACT },
      }),
    ]),
  ];
}

// Footer table (navy bg, teal/grey text)
function footerTable() {
  return fullTable([
    new TableRow({ children: [cell(
      [
        para(run('Moveify Health Solutions  ·  Exercise Physiology  ·  Allied Health', { color: TEAL, size: 9 }), { align: AlignmentType.CENTER, after: 3 }),
        para(run('Ryan Heath  |  AEP  |  0435 524 991  |  ryan@moveifyhealth.com  |  ABN: 52 263 141 529', { color: GREY, size: 9 }), { align: AlignmentType.CENTER, after: 0 }),
      ],
      { bg: NAVY, mt: 160, mb: 160, ml: cm(2), mr: cm(2) },
    )] }),
  ]);
}

function parseObjectiveRows(raw) {
  if (!raw) return [];
  return raw.split('\n')
    .filter(l => l.trim() && l.includes('|'))
    .map(l => { const p = l.split('|').map(s => s.trim()); return { test: p[0] || '', result: p[1] || '', interpretation: p[2] || '' }; });
}

async function generateGPReportDocx(data) {
  const {
    // Cover letter
    doctorName = '[Doctor Name]', doctorSurname = '[Surname]',
    practiceName = '[Practice Name]', address = '[Address]', townPostcode = '[Town Postcode]',
    sessionDate = '[Date]',
    // Patient details
    patientName = '[Patient Name]', referringGP = '', dob = '', medicareNo = '', referralDate = '',
    // AI sections
    executiveSummary = '', objectiveAssessment = '', goals = '', recommendations = '',
  } = data;

  const logoBuffer = fs.readFileSync(LOGO_PATH);
  const objRows = parseObjectiveRows(objectiveAssessment);

  const PAGE_MARGINS = { top: 0, bottom: cm(1.8), left: 0, right: 0 };

  // ── COVER LETTER ────────────────────────────────────────────────────────────
  const coverChildren = [
    ...pageHeader(logoBuffer),
    blank(14),

    // GP address
    para([run(`Dr ${doctorName}`, { bold: true, color: NAVY, size: 12 })], { indent: 2, after: 2 }),
    para(run(practiceName, { size: 12 }), { indent: 2, after: 2 }),
    para(run(address, { size: 12 }), { indent: 2, after: 2 }),
    para(run(townPostcode, { size: 12 }), { indent: 2, after: 2 }),
    blank(10),
    para(run(`Dear Dr ${doctorSurname},`, { bold: true, color: NAVY, size: 12 }), { indent: 2, after: 10 }),

    bodyPara(
      `Thank you sincerely for referring ${patientName} to Moveify Health Solutions for Exercise Physiology services under the MBS GP Chronic Condition Management Plan. Please find below the report and recommendations following their Initial Consultation on ${sessionDate}.`
    ),
    bodyPara('Should you have any questions or queries, please do not hesitate to contact me on 0435 524 991 or ryan@moveifyhealth.com'),
    blank(10),

    para(run('Yours sincerely,', { size: 12 }), { indent: 2, after: 38 }),

    para(run('Ryan Heath', { bold: true, color: NAVY, size: 12 }), { indent: 2, after: 2 }),
    para(run('Accredited Exercise Physiologist', { bold: true, color: NAVY, size: 12 }), { indent: 2, after: 2 }),
    para(run('BclinExPhys (Hons)', { size: 12 }), { indent: 2, after: 16 }),

    footerTable(),
  ];

  // ── CLINICAL REPORT ─────────────────────────────────────────────────────────

  // Patient details table — 2 col, 5 rows (matching PDF template)
  const detailRows = [
    ['Patient Name', patientName],
    ['Referring GP',  referringGP],
    ['Date of Birth', dob],
    ['Medicare No',   medicareNo],
    ['Referral Date', referralDate],
  ];
  const patientDetailsTable = fullTable(
    detailRows.map(([label, value]) => new TableRow({ children: [
      cell(para(run(label, { bold: true, color: NAVY, size: 11 }), { after: 0 }), { bg: 'D0EEEE', width: cm(7), mt: 150, mb: 150, ml: 220, mr: 200 }),
      cell(para(run(value, { size: 11 }), { after: 0 }), { bg: WHITE, mt: 150, mb: 150, ml: 220, mr: 200 }),
    ] })),
    { borders: LIGHT_BORDERS('B0BEC5') },
  );

  // Objective assessment table
  const OA_WIDTHS = [cm(5.4), cm(3.0), cm(12.0)];
  const oaHeaderRow = new TableRow({ children: [
    cell(para(run('Test',           { bold: true, color: WHITE, size: 11 }), { after: 0 }), { bg: '1C2E3D', width: OA_WIDTHS[0], mt: 160, mb: 160, ml: 220, mr: 220 }),
    cell(para(run('Result',         { bold: true, color: WHITE, size: 11 }), { after: 0 }), { bg: '1C2E3D', width: OA_WIDTHS[1], mt: 160, mb: 160, ml: 220, mr: 220 }),
    cell(para(run('Interpretation', { bold: true, color: WHITE, size: 11 }), { after: 0 }), { bg: '1C2E3D', width: OA_WIDTHS[2], mt: 160, mb: 160, ml: 220, mr: 220 }),
  ] });
  const oaDataRows = objRows.map((row, i) => {
    const bg = i % 2 === 0 ? 'FFFFFF' : 'F2FBFB';
    return new TableRow({ children: [
      cell(para(run(row.test,           { bold: true, color: NAVY,   size: 11 }), { after: 0 }), { bg, width: OA_WIDTHS[0], mt: 140, mb: 140, ml: 220, mr: 220 }),
      cell(para(run(row.result,         { color: DKGREY, size: 11 }), { after: 0 }),             { bg, width: OA_WIDTHS[1], mt: 140, mb: 140, ml: 220, mr: 220 }),
      cell(para(run(row.interpretation, { italic: true, color: GREY, size: 11 }), { after: 0 }), { bg, width: OA_WIDTHS[2], mt: 140, mb: 140, ml: 220, mr: 220 }),
    ] });
  });
  const objectiveTable = fullTable([oaHeaderRow, ...oaDataRows], { borders: LIGHT_BORDERS() });

  // Multi-line text to paragraphs
  const textParas = text => (text || '[No content]').split('\n').filter(l => l.trim()).map(l => bodyPara(l));

  const reportChildren = [
    ...pageHeader(logoBuffer),
    blank(10),

    sectionBanner('Patient Details'),
    blank(4),
    patientDetailsTable,
    blank(12),

    sectionBanner('Executive Summary'),
    blank(5),
    ...textParas(executiveSummary),
    blank(10),

    sectionBanner('Objective Assessment'),
    blank(4),
    ...(objRows.length > 0 ? [objectiveTable] : textParas(objectiveAssessment)),
    blank(12),

    sectionBanner('Goals'),
    blank(5),
    ...textParas(goals),
    blank(12),

    sectionBanner('Recommendations'),
    blank(5),
    ...textParas(recommendations),
    blank(20),

    footerTable(),
  ];

  const doc = new Document({
    sections: [
      { properties: { page: { margin: PAGE_MARGINS } }, children: coverChildren },
      { properties: { page: { margin: PAGE_MARGINS } }, children: reportChildren },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateGPReportDocx };
