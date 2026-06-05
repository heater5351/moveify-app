/**
 * GP Reassessment Report DOCX generation via docxtemplater.
 * Fills GP_Reassessment_Template.docx with the before/after comparison + the
 * GP-facing narrative. Mirrors scribe-reassessment-docx.js; clinician sign-off is
 * static in the template.
 */
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../assets/GP_Reassessment_Template.docx');

function clean(text) {
  return (text || '')
    .replace(/\*+/g, '')
    .replace(/\[|\]/g, '')
    .replace(/^#+\s*/gm, '')
    .trim();
}

// Parse the editable comparison block: "Measure | Baseline | Latest | Change | Clinical interpretation".
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

async function generateGPReassessmentDocx(data) {
  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

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

  const patient = clean(data.patientName) || 'the patient';
  const defaultCoverLetter =
    `Thank you for your ongoing care of ${patient}. Please find enclosed an Exercise Physiology reassessment report following their review` +
    `${data.latestDate ? ` on ${data.latestDate}` : ''}.\n\n` +
    `This report compares ${patient}'s current objective measures against their baseline assessment` +
    `${data.baselineDate ? ` of ${data.baselineDate}` : ''}, and summarises their progress, the clinical interpretation of those changes, and recommendations for the next phase of care.\n\n` +
    `I would be glad to discuss any aspect of this report. Thank you for the opportunity to be involved in ${patient}'s care.`;

  doc.render({
    report_date:       data.reportDate || new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    gp_name:           clean(data.gpName) || '[GP name]',
    practice_name:     clean(data.practiceName),
    practice_address:  clean(data.practiceAddress),
    patient_full_name: clean(data.patientName),
    patient_dob:       clean(data.dob),
    baseline_date:     data.baselineDate || '',
    latest_date:       data.latestDate || '',
    cover_letter:      clean(data.coverLetter) || defaultCoverLetter,
    executive_summary:       clean(data.executiveSummary),
    clinical_interpretation: clean(data.clinicalInterpretation),
    recommendations:         clean(data.recommendations),
    comparison_rows:   parseComparisonRows(data.comparison),
  });

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generateGPReassessmentDocx };
