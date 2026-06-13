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
 * header, the agreement parts, and the e-signature block (drawn signature +
 * typed name + timestamp + IP). PHI-light: only the patient's name and the
 * selected program appear — no clinical/health detail.
 *
 * For private (block/post-casual/continuity) agreements, pass tier/path and the
 * builder produces the Part A + Part B (DDRSA) document. For NDIS agreements,
 * pass a pre-built `agreement` object (from buildNdisAgreement) — it has no Part B
 * and the Stripe Direct-Debit footnote is omitted. `signedCapacity` records who
 * signed when a representative/nominee signs on the participant's behalf.
 *
 * @returns {Promise<Buffer>}
 */
function renderAgreementPdf({ patientName, tier, path, startDate, signedName, signedAt, signedIp, signature, agreement: prebuilt, signedCapacity, draft }) {
  return new Promise((resolve, reject) => {
    try {
      const agreement = prebuilt || buildAgreement({ tier, path, startDate });
      const isNdis = agreement && agreement.kind === 'ndis';
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
      if (draft) {
        doc.moveDown(0.15);
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#B45309')
          .text('PREVIEW — UNSIGNED COPY. Sign electronically via your secure link, or print and sign by hand below.');
      }
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

      // Drawn signature mark, rendered into a bordered box. Best-effort — a
      // malformed image must not break the whole PDF (the typed name + audit
      // trail below still stand as the record).
      if (signature && /^data:image\/png;base64,/.test(signature)) {
        try {
          const png = Buffer.from(signature.split(',')[1], 'base64');
          const boxW = 220, boxH = 70;
          const boxY = doc.y + 2;
          doc.rect(left, boxY, boxW, boxH).lineWidth(0.5).strokeColor(RULE).stroke();
          doc.image(png, left + 6, boxY + 6, { fit: [boxW - 12, boxH - 12] });
          doc.y = boxY + boxH + 6;
        } catch (imgErr) {
          doc.fontSize(7.5).fillColor(SUB).text(`(signature image could not be rendered: ${imgErr.message})`);
        }
      }

      if (draft) {
        // Unsigned preview: blank hand-sign lines so a printed copy can be wet-signed.
        const lineW = 240;
        const signLine = (label) => {
          const y = doc.y + 16;
          doc.moveTo(left, y).lineTo(left + lineW, y).lineWidth(0.5).strokeColor(RULE).stroke();
          doc.fontSize(8).font('Helvetica').fillColor(SUB).text(label, left, y + 3);
          doc.moveDown(1.4);
        };
        doc.moveDown(0.6);
        signLine('Signature');
        signLine('Name (printed)');
        signLine('Date');
        doc.moveDown(0.2);
        doc.fontSize(7.5).fillColor(SUB).text(
          'This is an unsigned preview for review. Signing electronically via the secure link is preferred and records a timestamp and audit trail; a hand-signed copy is also accepted.',
        );
      } else {
        doc.fontSize(9.5).font('Helvetica').fillColor(INK);
        doc.text(`Signed by: ${signedName || '—'}`);
        if (signedCapacity) doc.text(`Signing capacity: ${signedCapacity}`);
        doc.text(`Date/time: ${signedAt || '—'}`);
        doc.text(`IP address: ${signedIp || '—'}`);
        doc.moveDown(0.4);
        doc.fontSize(7.5).fillColor(SUB).text(
          isNdis
            ? 'This document records an electronic acceptance, including the signatory’s drawn signature, typed name, timestamp and IP address. Supports are claimed against the participant’s NDIS plan; there is no Direct Debit mandate.'
            : 'This document records an electronic acceptance, including the signatory’s drawn signature and explicit Direct Debit authorisation. The bank-level Direct Debit mandate (BECS/card) was captured separately by our payment provider, Stripe.',
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { renderAgreementPdf };
