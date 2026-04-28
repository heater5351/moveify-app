/**
 * GP Report DOCX generation via docxtemplater.
 * Fills gp_report_template.docx with patient data — formatting is preserved exactly
 * as designed in Word. No programmatic styling.
 */
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../assets/GP_Report_Template.docx');

function parseOaRows(raw) {
  if (!raw) return [];
  return raw.split('\n')
    .filter(l => l.trim() && l.includes('|'))
    .map(l => {
      const p = l.split('|').map(s => s.trim());
      return { test: p[0] || '', result: p[1] || '', interpretation: p[2] || '' };
    });
}

function parseGoals(text) {
  // Goals text structure: intro sentence, blank line, goal 1, blank line, goal 2, blank line, goal 3
  const parts = (text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  return {
    goals_intro: parts[0] || '',
    goal_1:      parts[1] || '',
    goal_2:      parts[2] || '',
    goal_3:      parts[3] || '',
  };
}

async function generateGPReportDocx(data) {
  console.log('[scribe-docx] generating report — fields present:', Object.keys(data).join(', '));
  console.log('[scribe-docx] section lengths — summary:', (data.executiveSummary || '').length, 'goals:', (data.goals || '').length);

  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  // Pre-process document XML:
  // 1. Strip <w:proofErr> elements that Word inserts between runs and break tag stitching.
  // 2. Normalise {{ tag }} → {{tag}} — Word preserves leading/trailing spaces inside
  //    the braces which docxtemplater does not trim before context lookup.
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

  const oa_rows = parseOaRows(data.objectiveAssessment);

  const context = {
    // Clinician — hardcoded (single clinician)
    clinician_full_name:      'Ryan Heath',
    clinician_qualifications: 'BclinExPhys (Hons)',
    clinician_profession:     'Accredited Exercise Physiologist',
    clinician_phone:          '0435 524 991',
    clinician_email:          'ryan@moveifyhealth.com',
    clinician_abn:            '52 263 141 529',
    // GP / practice
    gp_name:          data.doctorName    || '',
    gp_surname:       data.doctorSurname || '',
    practice_name:    data.practiceName  || '',
    practice_address: [data.address, data.townPostcode].filter(Boolean).join('\n'),
    practice_email:   data.practiceEmail || '',
    report_date:      new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    appointment_date: data.sessionDate   || '',
    assessment_date:  data.sessionDate   || '',
    // Patient
    patient_full_name:  data.patientName || '',
    patient_first_name: (data.patientName || '').split(' ')[0],
    patient_dob:        data.dob         || '',
    patient_pronoun:    data.patientPronoun || 'their',
    // Referral
    referring_gp:  data.referringGP  || '',
    referral_date: data.referralDate || '',
    cdm_sessions:  data.cdmSessions  || '',
    // AI-generated sections
    executive_summary: data.executiveSummary || '',
    oa_rows,
    ...(() => {
      const g = parseGoals(data.goals || '');
      // Provide both underscore (goal_1) and plain (goal1) forms since
      // Word may save variable names either way depending on spell-check
      return { ...g, goal1: g.goal_1, goal2: g.goal_2, goal3: g.goal_3 };
    })(),
    management_plan:   data.recommendations || '',
  };

  console.log('[scribe-docx] oa_rows:', oa_rows.length, '— rendering template');

  try {
    doc.render(context);
    console.log('[scribe-docx] render succeeded');
  } catch (err) {
    console.error('[scribe-docx] docxtemplater render error:', err.message);
    if (err.properties && err.properties.errors) {
      err.properties.errors.forEach(e => console.error('  tag error:', JSON.stringify(e.properties)));
    }
    throw err;
  }

  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  console.log('[scribe-docx] buffer size:', buf.length);
  return buf;
}

module.exports = { generateGPReportDocx };
