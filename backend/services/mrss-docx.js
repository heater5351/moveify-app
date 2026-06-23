/**
 * MRSS score-sheet DOCX, generated programmatically with the `docx` library (no
 * Word template needed). Renders the deterministic /100 breakdown from
 * mrss-scoring.computeMrss() into a printable clearance sheet. Ephemeral — nothing
 * stored. No patient values are logged.
 */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} = require('docx');
const { findMeasure } = require('./assessment-catalog');
const { loadProtocol } = require('./mrss-scoring');

const TEAL = '46C1C0';
const NAVY = '132232';
const GREY = '6B7280';

function fmt(n) { return n == null ? '—' : (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)); }

// Map a Part A grade value back to its catalog option label (Nil / Mild / …).
function gradeLabel(assessmentKey, measureKey, value) {
  const found = findMeasure(assessmentKey, measureKey);
  if (!found || !found.measure.options) return fmt(value);
  const opt = found.measure.options.find(o => o.value === value);
  return opt ? opt.label : fmt(value);
}

function cell(text, { bold = false, align = AlignmentType.LEFT, color, width } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text: String(text), bold, color, size: 20 })] })],
  });
}

function headerRow(labels) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l, i) => new TableCell({
      shading: { fill: NAVY },
      children: [new Paragraph({ alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, children: [new TextRun({ text: l, bold: true, color: 'FFFFFF', size: 20 })] })],
    })),
  });
}

function table(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: 'D1D5DB' },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'D1D5DB' },
      left: { style: BorderStyle.SINGLE, size: 2, color: 'D1D5DB' },
      right: { style: BorderStyle.SINGLE, size: 2, color: 'D1D5DB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    },
    rows,
  });
}

function sectionHeading(text, points, max) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [
      new TextRun({ text, bold: true, color: NAVY, size: 24 }),
      new TextRun({ text: `   ${fmt(points)} / ${max}`, bold: true, color: TEAL, size: 24 }),
    ],
  });
}

function check(done) { return done ? '☑' : '☐'; }

async function generateMrssDocx(data) {
  const r = data.result;
  const protocol = loadProtocol();
  const partAByKey = Object.fromEntries(protocol.partA.components.map(c => [c.key, c]));

  const children = [];

  // Title
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Melbourne ACL Return-to-Sport Score (MRSS)', color: NAVY })] }));
  children.push(new Paragraph({ children: [
    new TextRun({ text: `${data.patientName}`, bold: true, size: 22 }),
    new TextRun({ text: data.assessmentDate ? `   ·   ${data.assessmentDate}` : '', color: GREY, size: 22 }),
  ] }));
  children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({
    text: `Involved limb: ${r.involvedSide === 'left' ? 'Left' : 'Right'} (${r.involvedIsDominant ? 'dominant' : 'non-dominant'} leg)`,
    color: GREY, size: 20,
  })] }));

  // Total + verdict
  const passLabel = r.scorePass ? 'Score gate met (> 95)' : 'Below the 95 gate';
  children.push(new Paragraph({ spacing: { after: 40 }, children: [
    new TextRun({ text: `TOTAL  ${fmt(r.total)} / 100`, bold: true, size: 36, color: r.scorePass ? '15803D' : 'B91C1C' }),
  ] }));
  children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: passLabel, bold: true, color: r.scorePass ? '15803D' : 'B91C1C', size: 22 })] }));

  if (!r.complete) {
    children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({
      text: `⚠ Incomplete — not yet captured: ${r.missing.join('; ')}. The total below counts only the recorded tests.`,
      italics: true, color: 'B45309', size: 20,
    })] }));
  }

  // Part A
  children.push(sectionHeading('Part A — Clinical examination', r.partA.points, r.partA.max));
  {
    const rows = [headerRow(['Test', 'Finding', 'Points'])];
    for (const c of r.partA.components) {
      let finding;
      if (c.key === 'flexion') finding = c.value == null ? '—' : `${fmt(c.deficit)}° deficit (involved ${fmt(c.involved)}° / other ${fmt(c.uninvolved)}°)`;
      else if (c.key === 'extension') finding = c.value == null ? '—' : `${fmt(c.value)} cm deficit`;
      else { const pc = partAByKey[c.key]; finding = c.value == null ? '—' : gradeLabel(pc.assessment, pc.measure, c.value); }
      rows.push(new TableRow({ children: [
        cell(c.label, { width: 45 }),
        cell(finding, { align: AlignmentType.CENTER, width: 40, color: c.value == null ? 'B45309' : undefined }),
        cell(`${c.points} / 5`, { align: AlignmentType.CENTER, bold: true, width: 15 }),
      ] }));
    }
    children.push(table(rows));
  }

  // Part B
  children.push(sectionHeading('Part B — IKDC Subjective', r.partB.points, r.partB.max));
  children.push(new Paragraph({ children: [new TextRun({
    text: r.partB.available ? `IKDC raw ${fmt(r.partB.ikdcRaw)} / 100 × 0.25 = ${fmt(r.partB.points)}` : 'Not captured — hand the IKDC form to the patient via the kiosk.',
    color: r.partB.available ? undefined : 'B45309', size: 20,
  })] }));

  // Part C
  children.push(sectionHeading('Part C — Functional testing', r.partC.points, r.partC.max));
  {
    const rows = [headerRow(['Test', 'Involved', 'Uninvolved', 'LSI %', 'Points'])];
    for (const c of r.partC.components) {
      const isLsi = c.type === 'lsi' || c.type === 'lsiComposite';
      rows.push(new TableRow({ children: [
        cell(c.label, { width: 40 }),
        cell(c.type === 'direct' ? (c.value == null ? '—' : `${fmt(c.value)} / ${c.max}`) : fmt(c.involved), { align: AlignmentType.CENTER, width: 16 }),
        cell(c.type === 'direct' ? '—' : fmt(c.uninvolved), { align: AlignmentType.CENTER, width: 16 }),
        cell(isLsi ? (c.lsi == null ? '—' : `${fmt(c.lsi)}%`) : '—', { align: AlignmentType.CENTER, width: 14 }),
        cell(`${c.points} / ${c.max}`, { align: AlignmentType.CENTER, bold: true, width: 14 }),
      ] }));
    }
    children.push(table(rows));
  }

  // Clinical-attestation criteria (not part of the /100, required for clearance)
  children.push(new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: 'Clearance criteria (clinician attested)', bold: true, color: NAVY, size: 24 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: `${check(data.confidentEager)}  Athlete is comfortable, confident and eager to return to sport`, size: 20 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: `${check(data.preventionPlan)}  ACL injury-prevention program discussed, implemented and ongoing`, size: 20 })] }));

  const cleared = r.scorePass && data.confidentEager && data.preventionPlan;
  children.push(new Paragraph({ spacing: { before: 160, after: 80 }, children: [new TextRun({
    text: cleared ? 'All three criteria met — cleared to return to sport.' : 'Not all criteria met — not yet cleared.',
    bold: true, color: cleared ? '15803D' : 'B91C1C', size: 22,
  })] }));

  children.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({
    text: 'MRSS pass = total > 95 AND confidence AND an ongoing injury-prevention plan. A clinical decision aid — not a substitute for clinical judgement. Minimum ~9 months post-op before clearance. Source: Cooper, ACL Rehabilitation Guide 2.0.',
    italics: true, color: GREY, size: 16,
  })] }));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

module.exports = { generateMrssDocx };
