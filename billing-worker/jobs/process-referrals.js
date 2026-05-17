'use strict';

const {
  ensureGmailLabels,
  listReferralEmails,
  downloadAttachment,
  applyReferralLabel,
} = require('../services/gmail');
const { extractReferralData } = require('../services/bedrock');
const {
  searchPatientByNameDob,
  createPatient,
  updatePatientMissingFields,
  addPatientNote,
  uploadPatientAttachment,
  findOrCreateReferrerContact,
  setPatientReferringDoctor,
} = require('../services/cliniko').admin;
const { upsertReferral, appendActionRequired } = require('../services/billing-db');
const { check: idempotencyCheck, mark: idempotencyMark } = require('../lib/idempotency');

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Recursively walks the MIME part tree to find the first PDF attachment part
function findPdfPart(parts) {
  for (const part of parts || []) {
    if (
      (part.mimeType === 'application/pdf' || part.filename?.toLowerCase().endsWith('.pdf')) &&
      part.body?.attachmentId
    ) {
      return part;
    }
    const nested = findPdfPart(part.parts);
    if (nested) return nested;
  }
  return null;
}

// Insurers, funds, and other senders that issue PDFs that look like referrals
// to Bedrock but never actually are. If any of these appear in the extracted
// referrer fields, treat the document as not a referral.
const NON_REFERRER_KEYWORDS = [
  'guild', 'aami', 'allianz', 'qbe', 'icare', 'comminsure',
  'bupa', 'hcf', 'nib', 'medibank', 'ahm', 'gmhba', 'rt health',
  'australian unity', 'hbf', 'cbhs', 'doctors health fund',
  'health fund', 'insurance', 'insurer', 'indemnity', 'underwriting',
  'splose', 'cliniko', 'xero', 'stripe', 'tyro',
];

/**
 * Post-extraction safety check. Returns null if the data looks like a real GP
 * referral; otherwise returns a short reason string explaining why it was
 * rejected. Reason is structural (no PHI) and is logged + saved to ActionRequired.
 */
function validateReferral(data) {
  const haystack = `${data.referring_practice || ''} ${data.referring_doctor || ''}`.toLowerCase();
  const matched = NON_REFERRER_KEYWORDS.find((kw) => haystack.includes(kw));
  if (matched) return `referrer field contains non-referrer keyword "${matched}"`;
  return null;
}

function buildReferralNote(data) {
  const lines = ['[GPCCMP Referral — auto-imported via Moveify]'];
  if (data.referring_doctor)    lines.push(`Referring GP: ${data.referring_doctor}`);
  if (data.referring_practice)  lines.push(`Practice: ${data.referring_practice}`);
  if (data.provider_number)     lines.push(`Provider No: ${data.provider_number}`);
  if (data.referral_date)       lines.push(`Referral date: ${data.referral_date}`);
  if (data.num_sessions)        lines.push(`Sessions authorised: ${data.num_sessions}`);
  if (data.presenting_condition)lines.push(`Reason: ${data.presenting_condition}`);
  if (data.medicare_number)     lines.push(`Medicare: ${data.medicare_number}`);
  return lines.join('\n');
}

async function flagForReview(messageId, labelIds, type, description, idemKey) {
  if (idemKey) await idempotencyMark(idemKey).catch(() => {});
  await applyReferralLabel(messageId, labelIds.referral_failed, labelIds.referral_pending).catch(() => {});
  await appendActionRequired({
    id: generateId(),
    type,
    cliniko_id: '',
    patient_name: '',
    amount: '',
    description: `${description} (msg: ${messageId})`,
    status: 'pending',
    created_at: new Date().toISOString(),
    done_at: '',
  });
  await upsertReferral({
    gmail_message_id: messageId,
    cliniko_patient_id: '',
    status: 'failed',
    processed_at: new Date().toISOString(),
    email_subject: '',
    attachment_filename: '',
  });
}

async function processReferrals(log) {
  const labelIds = await ensureGmailLabels();
  const emails = await listReferralEmails(labelIds);

  log.info({ count: emails.length }, 'Referral emails to process');

  let processed = 0, skipped = 0, failed = 0;

  for (const email of emails) {
    const messageId = email.id;
    const idemKey = `referral:${messageId}`;

    if (await idempotencyCheck(idemKey)) {
      log.debug({ messageId }, 'Already processed — skipping');
      await applyReferralLabel(messageId, labelIds.referral_done, labelIds.referral_pending).catch(() => {});
      skipped++;
      continue;
    }

    log.info({ messageId }, 'Processing referral');

    try {
      // ── 1. Find PDF attachment ───────────────────────────────────────────
      const pdfPart = findPdfPart([email.payload]);
      if (!pdfPart) {
        log.warn({ messageId }, 'No PDF attachment found');
        await flagForReview(messageId, labelIds, 'referral_no_pdf', 'No PDF attachment in referral email', idemKey);
        failed++;
        continue;
      }

      // ── 2. Download PDF bytes ────────────────────────────────────────────
      const pdfBuffer = await downloadAttachment(messageId, pdfPart.body.attachmentId);

      // ── 3. Extract structured data via Gemini (australia-southeast1) ─────
      const data = await extractReferralData(pdfBuffer);

      // No PHI in logs — only structural booleans. classification_reason is
      // intentionally NOT logged: the model has been observed to include GP
      // names and practice names in it despite prompt instructions.
      log.info({
        messageId,
        isReferral: data.is_referral,
        hasName: !!(data.first_name && data.last_name),
        hasDob: !!data.date_of_birth,
        hasMedicare: !!data.medicare_number,
      }, 'Extraction complete');

      if (!data.is_referral || !data.first_name || !data.last_name) {
        log.info({ messageId, isReferral: data.is_referral }, 'Not a referral — skipping');
        await idempotencyMark(idemKey);
        await applyReferralLabel(messageId, labelIds.referral_done, labelIds.referral_pending);
        skipped++;
        continue;
      }

      // Post-extraction guard against Bedrock false positives (insurance docs,
      // business mail, etc.). Cheaper and more reliable than asking the model
      // to be careful in the prompt.
      const rejectReason = validateReferral(data);
      if (rejectReason) {
        log.warn({ messageId, rejectReason }, 'Rejected by post-extraction validator');
        await flagForReview(messageId, labelIds, 'referral_validator_rejected', `Validator rejected: ${rejectReason}`, idemKey);
        failed++;
        continue;
      }

      // ── 4. Find or create patient in Cliniko ─────────────────────────────
      let patient = await searchPatientByNameDob(data.first_name, data.last_name, data.date_of_birth);
      let matchedExisting = false;

      if (patient) {
        matchedExisting = true;
        log.info({ messageId, clinikoId: patient.id }, 'Matched existing Cliniko patient');
      } else {
        const created = await createPatient(data);
        // Cliniko returns the patient object directly for POST /patients
        patient = created.patient || created;
        log.info({ messageId, clinikoId: patient?.id }, 'Created new Cliniko patient');
      }

      const patientId = patient?.id;
      if (!patientId) throw new Error('No patient ID after find/create in Cliniko');

      // ── 4b. Patch missing fields on existing patient (never overwrite) ───
      if (matchedExisting) {
        try {
          const { filled } = await updatePatientMissingFields(patientId, patient, data);
          if (filled.length > 0) {
            log.info({ messageId, clinikoId: patientId, filled }, 'Filled missing patient fields');
          }
        } catch (err) {
          log.warn({ messageId, err: err.message }, 'Patient field update failed — continuing');
        }
      }

      // ── 5. Upload referral PDF to patient file ───────────────────────────
      try {
        await uploadPatientAttachment(patientId, pdfBuffer, pdfPart.filename || 'referral.pdf');
        log.info({ messageId }, 'Referral PDF attached');
      } catch (err) {
        log.warn({ messageId, err: err.message }, 'PDF attachment failed — continuing');
      }

      // ── 6. Find or create referring doctor contact + attach to patient ────
      if (data.referring_doctor) {
        try {
          const contact = await findOrCreateReferrerContact(data);
          if (contact?.id) {
            await setPatientReferringDoctor(patientId, contact.id);
            log.info({ messageId, clinikoContactId: contact.id }, 'Referring doctor set');
          }
        } catch (err) {
          // Non-fatal — patient is created, referral note still captures the GP details
          log.warn({ messageId, err: err.message }, 'Referring doctor step failed — continuing');
        }
      }

      // ── 7. Add referral note to patient file ─────────────────────────────
      await addPatientNote(patientId, buildReferralNote(data));

      // ── 8. Log to Sheets (no PHI — message ID + Cliniko ID only) ─
      await upsertReferral({
        gmail_message_id:   messageId,
        cliniko_patient_id: String(patientId),
        status:             'processed',
        processed_at:       new Date().toISOString(),
        email_subject:      '',
        attachment_filename: '',
      });

      // ── 9. Mark processed ────────────────────────────────────────────────
      await idempotencyMark(idemKey);
      await applyReferralLabel(messageId, labelIds.referral_done, labelIds.referral_pending);

      processed++;
    } catch (err) {
      log.error({ messageId, err: err.message }, 'Referral processing failed');

      await upsertReferral({
        gmail_message_id:    messageId,
        cliniko_patient_id:  '',
        status:              'failed',
        processed_at:        new Date().toISOString(),
        email_subject:       '',
        attachment_filename: '',
      });
      await applyReferralLabel(messageId, labelIds.referral_failed, labelIds.referral_pending).catch(() => {});
      await appendActionRequired({
        id:           generateId(),
        type:         'referral_failed',
        cliniko_id:   '',
        patient_name: '',
        amount:       '',
        description:  `Referral ${messageId} failed: ${err.message}`,
        status:       'pending',
        created_at:   new Date().toISOString(),
        done_at:      '',
      });

      // Mark idempotency so the failed email doesn't reprocess every cron run.
      // The referral-failed Gmail label + Action Required row keep it visible
      // for manual review.
      await idempotencyMark(idemKey).catch(() => {});

      failed++;
    }
  }

  return { processed, skipped, failed };
}

module.exports = { processReferrals };
