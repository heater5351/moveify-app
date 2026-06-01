'use strict';

const PDFDocument = require('pdfkit');
const {
  AGREEMENT_VERSION,
  PART_A_TITLE,
  PART_A_PARAGRAPHS,
  tierLabel,
} = require('../lib/agreement-template');

/**
 * Renders the signed service agreement to a PDF Buffer. Captures the exact Part A
 * wording the patient saw (versioned), the program summary, and the e-signature
 * block (typed name + timestamp + IP). PHI-light: only the patient's name and the
 * selected program appear — no clinical/health detail.
 *
 * @returns {Promise<Buffer>}
 */
function renderAgreementPdf({ patientName, tier, path, startDate, signedName, signedAt, signedIp }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).font('Helvetica-Bold').text(PART_A_TITLE);
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica').fillColor('#555')
        .text(`Agreement version: ${AGREEMENT_VERSION}`);
      doc.fillColor('#000');
      doc.moveDown(1);

      // Program summary
      doc.fontSize(12).font('Helvetica-Bold').text('Program');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Client: ${patientName || '—'}`);
      doc.text(`Program: ${tierLabel(tier, path) || `${tier} (${path})`}`);
      if (startDate) doc.text(`Start date: ${startDate}`);
      doc.moveDown(1);

      // Part A body
      doc.fontSize(12).font('Helvetica-Bold').text('Service Agreement (Part A)');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      for (const para of PART_A_PARAGRAPHS) {
        doc.text(para, { align: 'left' });
        doc.moveDown(0.6);
      }
      doc.moveDown(0.6);

      // Signature block
      doc.fontSize(12).font('Helvetica-Bold').text('Electronic Signature');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Signed by: ${signedName || '—'}`);
      doc.text(`Date/time: ${signedAt || '—'}`);
      doc.text(`IP address: ${signedIp || '—'}`);
      doc.moveDown(0.6);
      doc.fontSize(8).fillColor('#777').text(
        'This document records an electronic acceptance. The Direct Debit authorisation (Part B) was captured separately by our payment provider, Stripe.',
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { renderAgreementPdf };
