/**
 * Extract plain text from an uploaded clinical document (PDF / DOCX / TXT) so it
 * can be fed to the reassessment AI as additional baseline context. In-memory
 * only — the buffer is never written to disk and the extracted text is never
 * logged (it is PHI). DOCX uses pizzip (already a dependency); PDF uses pdf-parse.
 */
const PizZip = require('pizzip');
const { PDFParse } = require('pdf-parse');

// DOCX → text: read word/document.xml, turn paragraph/tab tags into whitespace,
// strip the rest, decode the basic XML entities.
function extractDocxText(buffer) {
  const zip = new PizZip(buffer);
  const f = zip.files['word/document.xml'];
  if (!f) throw new Error('Not a valid .docx file');
  return f.asText()
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const res = await parser.getText();
    return (res.text || '')
      .replace(/^\s*--\s*\d+\s*of\s*\d+\s*--\s*$/gm, '') // strip pdf-parse page markers
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } finally {
    if (typeof parser.destroy === 'function') await parser.destroy();
  }
}

/**
 * Dispatch on filename/mimetype, with a best-effort fallback. Returns extracted
 * text (possibly ''). Throws only on an unreadable file.
 */
async function extractText(buffer, filename = '', mimetype = '') {
  const name = filename.toLowerCase();
  const isPdf = name.endsWith('.pdf') || mimetype === 'application/pdf';
  const isDocx = name.endsWith('.docx') || mimetype.includes('wordprocessingml');
  const isTxt = name.endsWith('.txt') || mimetype.startsWith('text/');

  if (isPdf) return extractPdfText(buffer);
  if (isDocx) return extractDocxText(buffer);
  if (isTxt) return buffer.toString('utf8').trim();

  // Unknown type — sniff: zip (PK\x03\x04) → docx, %PDF → pdf, else utf8.
  const head = buffer.slice(0, 5).toString('latin1');
  if (head.startsWith('PK')) return extractDocxText(buffer);
  if (head.startsWith('%PDF')) return extractPdfText(buffer);
  return buffer.toString('utf8').trim();
}

module.exports = { extractText, extractDocxText, extractPdfText };
