import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { extractText, extractDocxText } from '../services/document-extract.js';

function makeDocx(paragraphs) {
  const body = paragraphs.map(p => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  const zip = new PizZip();
  zip.file('word/document.xml', `<w:document><w:body>${body}</w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

describe('document-extract', () => {
  it('extracts paragraph text from a DOCX (one line per paragraph)', () => {
    const buf = makeDocx(['Baseline grip 22 kg', 'Single-leg stance 3 sec']);
    const text = extractDocxText(buf);
    expect(text).toMatch(/Baseline grip 22 kg/);
    expect(text).toMatch(/Single-leg stance 3 sec/);
    expect(text.split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('decodes XML entities in DOCX text', () => {
    expect(extractDocxText(makeDocx(['ROM &lt; 90&#176; &amp; tight']))).toMatch(/ROM < 90/);
  });

  it('dispatches DOCX by mimetype', async () => {
    const buf = makeDocx(['Hello report']);
    const text = await extractText(buf, 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(text).toMatch(/Hello report/);
  });

  it('reads plain text', async () => {
    expect(await extractText(Buffer.from('grip 22kg', 'utf8'), 'x.txt', 'text/plain')).toBe('grip 22kg');
  });

  it('sniffs a DOCX (zip) when the type is unknown', async () => {
    const buf = makeDocx(['Sniffed baseline']);
    expect(await extractText(buf, 'unknown', '')).toMatch(/Sniffed baseline/);
  });
});
