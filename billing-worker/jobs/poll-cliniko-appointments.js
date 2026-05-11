'use strict';

// Cliniko appointment poller → Xero invoice + overpayment allocation.
//
// Every 15 min: fetch appointments updated since the cursor. For each that
// has been marked attended (Cliniko `patient_arrived === true`), look up the
// service price in the catalog, raise a Xero invoice at the casual rate, and
// allocate the contact's available overpayment credit. Any uncovered amount
// becomes an `insufficient_credit` flag — the SOP §4b failed-DD recovery path.
//
// Cursor is stored in WorkerState as `cliniko_appointments_last_polled` and
// only advanced after a successful pass. First run defaults to "now − 24h" so
// we don't drown in backfill.
//
// NDIS / RTWSA / DVA appointments are skipped here; they have their own
// pipelines (`runNdisRtwsa`, Tyro CSV ingest). The service catalog tags those
// services with a `funder` field so we can detect and skip them centrally.

const cliniko = require('../services/cliniko').finance;
const { getSubscriptionByClinikoId } = require('../services/stripe');
const {
  appendAppointmentInvoice,
  appendReconciliationFlag,
  getWorkerState,
  setWorkerState,
} = require('../services/sheets');
const xero = require('../lib/xero');
const { check, mark } = require('../lib/idempotency');
const serviceCatalog = require('../lib/service-catalog');
const { logger } = require('../lib/logger');

const CURSOR_KEY = 'cliniko_appointments_last_polled';
const DEFAULT_BACKFILL_MS = 24 * 60 * 60 * 1000;

async function pollClinikoAppointments(log = logger) {
  const cursor = (await getWorkerState(CURSOR_KEY)) ||
    new Date(Date.now() - DEFAULT_BACKFILL_MS).toISOString();
  const runAt = new Date().toISOString();
  log.info({ since: cursor }, 'Starting Cliniko appointment poll');

  const appointments = await cliniko.getAppointmentsAll(cursor);
  log.info({ count: appointments.length }, 'Fetched appointments since cursor');

  if (appointments.length === 0) {
    await setWorkerState(CURSOR_KEY, runAt);
    return { processed: 0, invoiced: 0, skipped: 0, flagged: 0 };
  }

  // Per-run cache of Cliniko patient lookups so we hit each ID at most once.
  // Patients live in the staging instance and aren't in the prod Contacts tab,
  // so we fetch directly from Cliniko rather than going through the sheet.
  const patientCache = new Map();

  const stats = { processed: 0, invoiced: 0, skipped: 0, flagged: 0 };

  for (const appt of appointments) {
    stats.processed++;
    try {
      const result = await processAppointment({ appt, patientCache, log });
      if (result === 'invoiced') stats.invoiced++;
      else if (result === 'flagged') stats.flagged++;
      else stats.skipped++;
    } catch (err) {
      log.error({ appt_id: appt.id, err: err.message }, 'Appointment processing failed — continuing');
      stats.flagged++;
    }
  }

  await setWorkerState(CURSOR_KEY, runAt);
  log.info(stats, 'Cliniko appointment poll complete');
  return stats;
}

async function processAppointment({ appt, patientCache, log }) {
  // Trigger condition: patient marked as arrived, not cancelled, not did-not-arrive.
  // Cliniko has no boolean "Completed" — `patient_arrived === true` is the
  // closest equivalent and matches what `sync-cliniko.js` already keys off.
  if (!appt.patient_arrived || appt.did_not_arrive || appt.cancelled_at) {
    return 'skipped';
  }

  const idempKey = `appointment:${appt.id}`;
  if (await check(idempKey)) {
    log.debug({ appt_id: appt.id }, 'Appointment already processed — skipping');
    return 'skipped';
  }

  // Resolve appointment type name (list response only links to it)
  const typeId = appt.appointment_type?.links?.self?.split('/').pop();
  if (!typeId) {
    await flag('unknown_service_type', appt.id, '', 'Appointment has no appointment_type link', log);
    await mark(idempKey);
    return 'flagged';
  }
  const typeData = await cliniko.getAppointmentType(typeId).catch(() => null);
  const typeName = typeData?.name || '';

  const service = serviceCatalog.lookup(typeName);
  if (!service) {
    await flag(
      'unknown_service_type',
      appt.id,
      '',
      `No service catalog entry for appointment_type "${typeName}"`,
      log,
    );
    await mark(idempKey);
    return 'flagged';
  }

  // Funder-tagged services are handled by separate pipelines — skip here so
  // we don't duplicate invoices created by `runNdisRtwsa` or the Tyro ingest.
  if (service.funder) {
    log.debug({ appt_id: appt.id, funder: service.funder }, 'Funder-routed service — skipping subscription invoicing');
    await mark(idempKey);
    return 'skipped';
  }

  const clinikoPatientId = appt.patient?.links?.self?.split('/').pop() || '';
  if (!clinikoPatientId) {
    await flag('appointment_patient_missing', appt.id, '', 'Appointment has no patient link', log);
    await mark(idempKey);
    return 'flagged';
  }

  // Fetch patient from Cliniko directly. Contacts sheet is populated from
  // prod Cliniko (sync-cliniko) and would either miss the staging patient or,
  // worse, return a wrong record on an ID collision.
  let patient = patientCache.get(String(clinikoPatientId));
  if (!patient) {
    try {
      patient = await cliniko.getPatient(clinikoPatientId);
      patientCache.set(String(clinikoPatientId), patient);
    } catch (err) {
      await flag(
        'appointment_patient_not_found',
        appt.id,
        clinikoPatientId,
        `Cliniko getPatient failed: ${err.message}`,
        log,
      );
      await mark(idempKey);
      return 'flagged';
    }
  }

  const patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ').trim() ||
    `Cliniko ${clinikoPatientId}`;
  const patientEmail = patient.email || undefined;

  // Subscription gate: only patients with an active/trialing Stripe subscription
  // flow through the credit-consumption path. Casual/non-subscribed patients
  // pay at the desk (Tyro) and are out of scope for this job. Skip cleanly and
  // mark idempotency so we don't re-check every poll — if they subscribe later,
  // future appointments will bill correctly; this past one stays uninvoiced
  // here (already settled via Tyro or manual invoicing).
  const subscription = await getSubscriptionByClinikoId(clinikoPatientId, patientEmail).catch((err) => {
    log.warn({ appt_id: appt.id, err: err.message }, 'Stripe subscription lookup failed — treating as unsubscribed');
    return null;
  });
  if (!subscription) {
    log.debug({ appt_id: appt.id, cliniko_patient_id: clinikoPatientId }, 'No active subscription — skipping appointment');
    await mark(idempKey);
    return 'skipped';
  }

  // Mark BEFORE Xero writes (fail-closed pattern). If a downstream call dies,
  // we surface a flag rather than silently re-creating invoices on next poll.
  await mark(idempKey);

  // Resolve Xero contact (may create on first sight)
  let xeroContactId;
  try {
    xeroContactId = await xero.findOrCreateContact({
      name: patientName,
      email: patientEmail,
      clinikoId: clinikoPatientId,
    });
  } catch (err) {
    await flag('appointment_invoice_failed', appt.id, clinikoPatientId, `Xero contact lookup failed: ${err.message}`, log);
    return 'flagged';
  }

  const apptDate = (appt.starts_at || appt.appointment_start || '').slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const description = service.code
    ? `${service.name} [${service.code}] — ${apptDate}`
    : `${service.name} — ${apptDate}`;

  // Create the casual-rate invoice
  let invoice;
  try {
    invoice = await xero.createInvoice({
      contactId: xeroContactId,
      lineItems: [{
        description,
        quantity: 1,
        unitAmount: service.casualPrice,
        accountCode: service.accountCode,
        taxType: service.taxType,
      }],
      reference: `Appt ${appt.id}`,
      date: apptDate,
      dueDate: apptDate,
      status: 'AUTHORISED',
    });
  } catch (err) {
    await flag('appointment_invoice_failed', appt.id, clinikoPatientId, `Xero createInvoice failed: ${err.message}`, log);
    return 'flagged';
  }

  // Allocate available overpayments oldest-first up to invoice total
  let overpayments;
  try {
    overpayments = await xero.getContactOverpayments(xeroContactId);
  } catch (err) {
    log.error({ appt_id: appt.id, err: err.message }, 'Failed to load contact overpayments');
    overpayments = [];
  }
  overpayments.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let remaining = service.casualPrice;
  let allocated = 0;
  for (const op of overpayments) {
    if (remaining <= 0) break;
    const slice = Math.min(op.remaining, remaining);
    if (slice <= 0) continue;
    try {
      await xero.applyOverpayment({
        overpaymentId: op.overpaymentId,
        invoiceId: invoice.invoiceId,
        amount: round2(slice),
      });
      allocated = round2(allocated + slice);
      remaining = round2(remaining - slice);
    } catch (err) {
      log.warn({ appt_id: appt.id, overpayment_id: op.overpaymentId, err: err.message }, 'Overpayment allocation slice failed — trying next');
    }
  }

  const gap = round2(service.casualPrice - allocated);

  if (gap > 0) {
    await flag(
      'insufficient_credit',
      invoice.invoiceNumber,
      clinikoPatientId,
      `Session invoice ${invoice.invoiceNumber} for $${service.casualPrice.toFixed(2)} only covered $${allocated.toFixed(2)} — gap $${gap.toFixed(2)}`,
      log,
      'Recover via next DD or manual top-up (SOP §4b)',
    );
  }

  // Best-effort ledger append — Xero is the source of truth, don't fail
  // the run on a Sheets quota blip.
  try {
    await appendAppointmentInvoice({
      cliniko_appointment_id: appt.id,
      cliniko_patient_id: clinikoPatientId,
      service_name: service.name,
      appointment_date: apptDate,
      appointment_status: 'arrived',
      casual_price: service.casualPrice,
      xero_invoice_id: invoice.invoiceId,
      xero_invoice_number: invoice.invoiceNumber,
      overpayment_allocated: allocated,
      gap_amount: gap,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn(
      {
        appt_id: appt.id,
        cliniko_patient_id: clinikoPatientId,
        xero_invoice_id: invoice.invoiceId,
        xero_invoice_number: invoice.invoiceNumber,
        allocated,
        gap,
        err: err.message,
      },
      'AppointmentInvoices ledger append failed — Xero records intact, backfill from log',
    );
  }

  log.info(
    {
      appt_id: appt.id,
      cliniko_patient_id: clinikoPatientId,
      service: service.name,
      xero_invoice_number: invoice.invoiceNumber,
      casual_price: service.casualPrice,
      allocated,
      gap,
    },
    'Appointment invoiced',
  );

  return 'invoiced';
}

async function flag(type, entityId, clinikoId, diff, log, notes = '') {
  log.warn({ flag_type: type, entity_id: entityId, cliniko_id: clinikoId, diff, notes }, 'Reconciliation flag raised');
  await appendReconciliationFlag({
    id: `${type}:${entityId}`,
    type,
    entity_id: entityId,
    cliniko_state: clinikoId,
    ledger_state: '',
    diff,
    resolved_at: '',
    resolution: '',
    notes,
    created_at: new Date().toISOString(),
  }).catch((err) => log.warn({ err: err.message, type, entityId }, 'Flag append failed'));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { pollClinikoAppointments };
