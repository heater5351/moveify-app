/**
 * Patient Handout DOCX generation via docxtemplater.
 * Fills Handout_Template.docx with the AI-generated sections — formatting is
 * preserved exactly as designed in Word. No programmatic styling.
 */
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../assets/Handout_Template.docx');

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

function parseOaRows(raw) {
  if (!raw) return [];
  return raw.split('\n')
    .filter(l => l.trim() && l.includes('|'))
    .map(l => {
      const p = l.split('|').map(s => clean(s));
      return { test: p[0] || '', result: p[1] || '', interpretation: p[2] || '' };
    })
    .filter(r => r.test);
}

async function generateHandoutDocx(data) {
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

  const assessment_rows = parseOaRows(data.clinicalContext);

  doc.render({
    patient_first_name: clean(data.patientFirstName),
    assessment_date:    data.assessmentDate || '',
    whats_going_on:     toBullets(data.whatsGoingOn),
    our_aims:           toBullets(data.ourAims),
    how_we_get_there:   toBullets(data.howWeGetThere),
    what_to_expect:     toBullets(data.whatToExpect),
    assessment_rows,
  });

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generateHandoutDocx };
