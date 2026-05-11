'use strict';

const cliniko = require('../services/cliniko');
const { sendEmail } = require('../services/gmail');
const { check, mark } = require('../lib/idempotency');
const { logger } = require('../lib/logger');

// NDIS rate: $166.99/hr, RTWSA EP102: $186.30 ex GST
const RATES = {
  ndis: { amount: 166.99, description: 'Exercise Physiology — NDIS', gst: false },
  rtwsa: { amount: 186.30, description: 'Exercise Physiology — RTWSA EP102 (ex GST)', gst: false },
};

async function runNdisRtwsa({ appointment, log = logger }) {
  const apptId = appointment.id;
  const idempotencyKey = `ndis-rtwsa:appt:${apptId}`;

  if (await check(idempotencyKey)) {
    log.info({ appt_id: apptId }, 'NDIS/RTWSA invoice already created — skipping');
    return;
  }

  const caseType = (appointment.patient_case?.case_type || '').toLowerCase();
  const rate = RATES[caseType];
  if (!rate) {
    log.warn({ appt_id: apptId, case_type: caseType }, 'Unknown case type — skipping');
    return;
  }

  const patientId = appointment.patient?.links?.self?.split('/').pop();
  if (!patientId) {
    log.error({ appt_id: apptId }, 'No patient ID on appointment');
    return;
  }

  // Create Cliniko invoice
  const invoice = await cliniko.createInvoice(patientId, [
    {
      description: rate.description,
      unit_price: rate.amount,
      quantity: 1,
      is_taxed: rate.gst,
    },
  ]);

  log.info({ appt_id: apptId, invoice_id: invoice.id }, 'Created NDIS/RTWSA invoice');

  // Email invoice to plan manager / insurer
  // Recipient sourced from Cliniko patient case record — never from request body
  const recipientEmail = appointment.patient_case?.contact_email;
  if (recipientEmail) {
    await sendEmail({
      to: recipientEmail,
      subject: `Invoice — ${rate.description}`,
      body: [
        `Please find enclosed an invoice for exercise physiology services.`,
        ``,
        `Invoice ID: ${invoice.id}`,
        `Date: ${new Date().toLocaleDateString('en-AU')}`,
        `Amount: $${rate.amount.toFixed(2)}${rate.gst ? ' (inc GST)' : ' (ex GST)'}`,
        `Description: ${rate.description}`,
        ``,
        `Payment is due within 30 days.`,
        ``,
        `Moveify Health`,
      ].join('\n'),
    });
  } else {
    log.warn({ appt_id: apptId }, 'No plan manager email on case record — invoice not emailed');
  }

  await mark(idempotencyKey);
}

module.exports = { runNdisRtwsa };
