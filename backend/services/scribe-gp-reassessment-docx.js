/**
 * GP Reassessment Report DOCX generation via docxtemplater.
 * Fills GP_Reassessment_Template.docx with the before/after comparison + the
 * GP-facing narrative. The cover-letter prose and the clinician sign-off
 * (Ryan Heath's name / qualifications / phone / email) are now baked directly
 * into the template, so only the variable recipient/patient/result fields below
 * are token-driven.
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

// First given name, for the template's cover-letter line ("…following <first>'s reassessment").
function firstName(full) {
  return (clean(full).split(/\s+/)[0] || '');
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

  doc.render({
    report_date:       data.reportDate || new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    gp_name:           clean(data.gpName) || '[GP name]',
    practice_name:     clean(data.practiceName),
    practice_address:  clean(data.practiceAddress),
    practice_email:    clean(data.practiceEmail),
    patient_full_name: clean(data.patientName),
    patient_first_name: firstName(data.patientName),
    patient_dob:       clean(data.dob),
    // Cover-letter date ("…reassessment on the …"); defaults to the reassessment date.
    appointment_date:  data.appointmentDate || data.latestDate || '',
    initial_assessment_date: data.baselineDate || '',
    reassessment_date:       data.latestDate || '',
    executive_summary:       clean(data.executiveSummary),
    clinical_interpretation: clean(data.clinicalInterpretation),
    recommendations:         clean(data.recommendations),
    comparison_rows:   parseComparisonRows(data.comparison),
  });

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generateGPReassessmentDocx };
