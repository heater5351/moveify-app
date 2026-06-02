'use strict';

const PDFDocument = require('pdfkit');
const { buildAgreement } = require('../lib/agreement-content');
const { tierLabel } = require('../lib/agreement-template');

// Brand palette (matches the patient handouts / Tailwind tokens).
const NAVY = '#132232';
const TEAL = '#46C1C0';
const INK = '#1A2230';
const SUB = '#56606E';
const RULE = '#E2E8F0';

/**
 * Renders the signed service agreement to a PDF Buffer in the Moveify brand
 * style. Captures the exact, versioned agreement the patient saw — provider
 * header, Part A (clinical services), Part B (DDRSA), and the e-signature block
 * (typed name + timestamp + IP). PHI-light: only the patient's name and the
 * selected program appear — no clinical/health detail.
 *
 * @returns {Promise<Buffer>}
 */
function renderAgreementPdf({ patientName, tier, path, startDate, signedName, signedAt, signedIp }) {
  return new Promise((resolve, reject) => {
    try {
      const agreement = buildAgreement({ tier, path, startDate });
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      const rule = (gap = 8) => {
        const y = doc.y + 2;
        doc.moveTo(left, y).lineTo(left + contentWidth, y).lineWidth(0.5).strokeColor(RULE).stroke();
        doc.moveDown(gap / 12);
      };
      const para = (text, opts = {}) => {
        doc.fontSize(opts.size || 9.5).font(opts.font || 'Helvetica').fillColor(opts.color || INK)
          .text(text, { align: 'left', ...opts });
        doc.moveDown(opts.after != null ? opts.after : 0.5);
      };
      const bullets = (items) => {
        doc.fontSize(9.5).font('Helvetica').fillColor(INK);
        doc.list(items, { bulletRadius: 1.4, textIndent: 12, bulletIndent: 2, lineGap: 2 });
        doc.moveDown(0.4);
      };

      // ── Header / masthead ──
      doc.fontSize(15).font('Helvetica-Bold').fillColor(NAVY).text('Moveify Health Solutions');
      doc.fontSize(8.5).font('Helvetica').fillColor(SUB)
        .text(`${agreement.provider.location}  ·  ${agreement.provider.phone}  ·  ${agreement.provider.contact}`);
      doc.moveDown(0.3);
      rule(10);
      doc.moveDown(0.4);

      // ── Title block ──
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(TEAL).text('SERVICE AGREEMENT', { characterSpacing: 2 });
      doc.moveDown(0.15);
      doc.fontSize(18).font('Helvetica-Bold').fillColor(NAVY).text(agreement.docTitle);
      doc.moveDown(0.1);
      doc.fontSize(8).font('Helvetica').fillColor(SUB).text(`Agreement version: ${agreement.version}`);
      doc.moveDown(0.6);

      // ── Provider + program summary ──
      doc.fontSize(9.5).font('Helvetica').fillColor(INK);
      doc.text(`Provider: ${agreement.provider.name}`);
      doc.text(agreement.provider.accreditation);
      doc.text(`Business: ${agreement.provider.business}`);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Program');
      doc.font('Helvetica').fillColor(INK);
      doc.text(`Client: ${patientName || '—'}`);
      doc.text(`Program: ${agreement.tierLabel || tierLabel(tier, path) || `${tier} (${path})`}`);
      if (agreement.feesSummary) doc.text(`Fees: ${agreement.feesSummary}`);
      if (startDate) doc.text(`Start date: ${startDate}`);
      doc.moveDown(0.5);
      para(agreement.about, { color: SUB, size: 9 });
      doc.moveDown(0.3);

      // ── Parts ──
      const renderSection = (s) => {
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica-Bold').fillColor(NAVY).text(s.heading);
        doc.moveDown(0.2);
        if (s.body) for (const b of s.body) para(b, { size: 9.5 });
        if (s.bullets) bullets(s.bullets);
        if (s.note) para(s.note, { size: 9.5 });
        if (s.subsections) {
          for (const sub of s.subsections) {
            doc.fontSize(9.5).font('Helvetica-Bold').fillColor(INK).text(sub.subheading);
            doc.moveDown(0.15);
            for (const b of sub.body) para(b, { size: 9.5 });
          }
        }
      };

      for (const part of agreement.parts) {
        doc.moveDown(0.4);
        doc.fontSize(13).font('Helvetica-Bold').fillColor(TEAL).text(part.title);
        doc.moveDown(0.1);
        rule(8);
        if (part.intro) { doc.moveDown(0.3); para(part.intro, { color: SUB, size: 9 }); }
        for (const s of part.sections) renderSection(s);
      }

      // ── Signature block ──
      doc.moveDown(0.6);
      rule(8);
      doc.moveDown(0.4);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY).text('Signatures');
      doc.moveDown(0.2);
      para(agreement.signatureNote, { color: SUB, size: 9 });
      doc.fontSize(9.5).font('Helvetica').fillColor(INK);
      doc.text(`Signed by: ${signedName || '—'}`);
      doc.text(`Date/time: ${signedAt || '—'}`);
      doc.text(`IP address: ${signedIp || '—'}`);
      doc.moveDown(0.4);
      doc.fontSize(7.5).fillColor(SUB).text(
        'This document records an electronic acceptance. The Direct Debit authorisation was captured separately by our payment provider, Stripe.',
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { renderAgreementPdf };
