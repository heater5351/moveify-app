/**
 * Reassessment Summary DOCX generation via docxtemplater.
 * Fills Reassessment_Template.docx with the comparison rows + progress narrative.
 * Mirrors scribe-handout-docx.js — formatting is preserved exactly as designed in
 * Word, no programmatic styling.
 */
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../assets/Reassessment_Template.docx');

function clean(text) {
  return (text || '')
    .replace(/\*+/g, '')
    .replace(/\[|\]/g, '')
    .replace(/^#+\s*/gm, '')
    .trim();
}

// Split a section's text into bullet points: one per non-empty line, with any
// leading bullet/marker glyph stripped (the template adds the bullet itself).
function toBullets(text) {
  return clean(text)
    .split('\n')
    .map(l => l.replace(/^[-•·*–—]+\s*/, '').trim())
    .filter(Boolean);
}

// Parse the editable comparison block: one row per line,
// "Test | Baseline | Latest | Change | What it means" (pipe-separated).
function parseComparisonRows(raw) {
  if (!raw) return [];
  return raw.split('\n')
    .filter(l => l.trim() && l.includes('|'))
    .map(l => {
      const p = l.split('|').map(s => clean(s));
      return { test: p[0] || '', baseline: p[1] || '', latest: p[2] || '', change: p[3] || '', interpretation: p[4] || '' };
    })
    .filter(r => r.test);
}

async function generateReassessmentDocx(data) {
  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  // Strip Word proofing marks and normalise {{ tag }} → {{tag}} (Word preserves
  // the inner spaces, which docxtemplater does not trim before lookup).
  const docXmlRaw = zip.files['word/document.xml'].asText();
  const docXmlClean = docXmlRaw
    .replace(/<w:proofErr[^>]*\/>/g, '')
    .replace(/\{\{\s+/g, '{{')
    .replace(/\s+\}\}/g, '}}');
  zip.file('word/document.xml', docXmlClean);

  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter() { return ''; },
  });

  const comparison_rows = parseComparisonRows(data.comparison);

  const RESULTS_SUMMARY_FALLBACK =
    'These are the same tests we measured at your baseline, repeated under the same conditions so your progress is shown objectively rather than by feel alone. Where a result has moved into the expected range it is a gain we will keep building on; where it is still developing, it simply shapes what we focus on next. We will keep re-measuring at each reassessment so you can see your progress clearly.';

  doc.render({
    patient_first_name: clean(data.patientFirstName),
    baseline_date:      data.baselineDate || '',
    latest_date:        data.latestDate || '',
    progress:           toBullets(data.progress),
    next_steps:         toBullets(data.nextSteps),
    comparison_rows,
    results_summary:    clean(data.resultsSummary) || RESULTS_SUMMARY_FALLBACK,
  });

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generateReassessmentDocx };
