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
const { findSubscriptionsCoveringDate, getSubscriptionProductName } = require('../services/stripe');
const { getPpFee } = require('../lib/rates');
const {
  appendAppointmentInvoice,
  appendReconciliationFlag,
  getAppointmentInvoiceByApptId,
  getWorkerState,
  setWorkerState,
} = require('../services/billing-db');
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
  log.info({ count: appointments.length }, 'Fetched individual appointments since cursor');

  // Group attendance lives on /attendees, not /group_appointments. Each attendee
  // is one patient's booking into a group session, with its own `arrived` flag.
  // We convert each ARRIVED attendee into a synthetic appointment record so it
  // flows through the same processAppointment pipeline.
  const attendees = await cliniko.getAttendeesAll(cursor).catch((err) => {
    log.warn({ err: err.message }, 'getAttendeesAll failed — continuing without group attendances');
    return [];
  });
  log.info({ count: attendees.length }, 'Fetched group attendees since cursor');

  const syntheticGroupAppts = [];
  const attendeeStats = { total: attendees.length, arrived: 0, not_arrived: 0, cancelled_or_archived: 0, no_group_link: 0, fetched_group: 0 };
  // Cache parent group_appointment fetches per-run to dedupe.
  const groupApptCache = new Map();
  for (const a of attendees) {
    if (a.cancelled_at || a.archived_at) { attendeeStats.cancelled_or_archived++; continue; }
    if (!a.arrived) { attendeeStats.not_arrived++; continue; }
    attendeeStats.arrived++;
    try {
      // Booking link points at /bookings/{id}; the booking record references
      // the parent group_appointment. To avoid an extra hop, prefer the
      // group_appointment link if Cliniko exposes it directly on the attendee.
      const bookingUrl = a.booking?.links?.self;
      const groupId = a.group_appointment?.links?.self?.split('/').pop()
        || (bookingUrl && bookingUrl.split('/').pop()); // booking_id; we'll fetch booking to resolve group
      if (!groupId) { attendeeStats.no_group_link++; continue; }

      let group = groupApptCache.get(groupId);
      if (!group) {
        group = await cliniko.getGroupAppointment(groupId).catch(() => null);
        if (group) { groupApptCache.set(groupId, group); attendeeStats.fetched_group++; }
      }
      if (!group) continue;

      syntheticGroupAppts.push({
        id: `group-attendee-${a.id}`,
        patient_arrived: true,
        did_not_arrive: false,
        cancelled_at: null,
        patient: a.patient, // { links: { self: '.../patients/X' } }
        appointment_type: group.appointment_type,
        starts_at: group.starts_at,
      });
    } catch (err) {
      log.warn({ attendee_id: a.id, err: err.message }, 'Failed to build synthetic appointment from attendee');
    }
  }

  const allAppts = appointments.concat(syntheticGroupAppts);

  if (allAppts.length === 0) {
    await setWorkerState(CURSOR_KEY, runAt);
    return { processed: 0, invoiced: 0, skipped: 0, flagged: 0 };
  }

  // Per-run cache of Cliniko patient lookups so we hit each ID at most once.
  const patientCache = new Map();

  const stats = { processed: 0, invoiced: 0, skipped: 0, flagged: 0, group_attendees_added: syntheticGroupAppts.length, attendee_stats: attendeeStats };

  for (const appt of allAppts) {
    stats.processed++;
    try {
      const result = await processAppointment({ appt, patientCache, log, stats });
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

async function processAppointment({ appt, patientCache, log, stats }) {
  // Trigger condition: patient marked as arrived, not cancelled, not did-not-arrive.
  // Cliniko has no boolean "Completed" — `patient_arrived === true` is the
  // closest equivalent and matches what `sync-cliniko.js` already keys off.
  if (!appt.patient_arrived || appt.did_not_arrive || appt.cancelled_at) {
    stats.skip_not_attended = (stats.skip_not_attended || 0) + 1;
    // Track what types are getting skipped at this gate, useful for diagnosing
    // why expected attended sessions aren't being processed.
    stats.skip_not_attended_appt_type_ids = stats.skip_not_attended_appt_type_ids || {};
    const typeId = appt.appointment_type?.links?.self?.split('/').pop() || 'unknown';
    stats.skip_not_attended_appt_type_ids[typeId] = (stats.skip_not_attended_appt_type_ids[typeId] || 0) + 1;
    return 'skipped';
  }
  // For appointments that DID make it past the gate, also track whether the
  // patient link exists (group appointments may use patient_bookings instead).
  stats.attended_seen = (stats.attended_seen || 0) + 1;
  if (!appt.patient?.links?.self) {
    stats.attended_no_patient_link = (stats.attended_no_patient_link || 0) + 1;
    stats.attended_no_patient_link_appt_ids = stats.attended_no_patient_link_appt_ids || [];
    stats.attended_no_patient_link_appt_ids.push(String(appt.id));
  }

  const idempKey = `appointment:${appt.id}`;
  if (await check(idempKey)) {
    log.debug({ appt_id: appt.id }, 'Appointment already processed — skipping');
    return 'skipped';
  }

  // Defense-in-depth against duplicate invoicing. The idempotency key is the
  // primary guard, but a manual reprocess (or cleared key) can bypass it — if
  // we then re-invoice an appointment that already has a ledger invoice we
  // create a duplicate (this happened once: a cleared key re-billed an
  // already-paid session). Refuse to raise a second invoice for an appointment
  // that already has one, and re-mark the key so it stops being reconsidered.
  const existingInvoice = await getAppointmentInvoiceByApptId(appt.id).catch(() => null);
  if (existingInvoice && existingInvoice.xero_invoice_number) {
    stats.skip_already_invoiced = (stats.skip_already_invoiced || 0) + 1;
    log.info({ appt_id: appt.id, xero_invoice_number: existingInvoice.xero_invoice_number }, 'Appointment already has a ledger invoice — skipping to avoid duplicate');
    await mark(idempKey);
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
    stats[`skip_funder_${service.funder.toLowerCase()}`] = (stats[`skip_funder_${service.funder.toLowerCase()}`] || 0) + 1;
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

  // Subscription gate: the patient must have been on a paid/trialing Stripe
  // subscription AT THE TIME of the appointment. This catches three failure
  // modes the naive "current sub" check misses:
  //
  //   1. Backdated billing — appointment was BEFORE the patient subscribed.
  //      We do NOT retroactively bill against a sub that didn't exist yet.
  //   2. Cancelled mid-period — patient cancelled after attending. We still
  //      bill the appointment because they were a subscriber when it happened.
  //   3. Failed DD — there may be an active sub but no overpayment credit
  //      yet. We still create the invoice (AUTHORISED, unpaid). When the
  //      next DD lands, Stream A's handler back-allocates the new overpayment
  //      to any outstanding invoices for the contact.
  //
  // findSubscriptionsCoveringDate walks every Stripe sub (any status) for the
  // customer and returns those whose [start_date, ended_at || now] spans the
  // appointment date.
  const apptStartsAtIso = appt.starts_at || new Date().toISOString();
  const covering = await findSubscriptionsCoveringDate(clinikoPatientId, patientEmail, patientName, apptStartsAtIso).catch((err) => {
    log.warn({ appt_id: appt.id, err: err.message }, 'Stripe subscription lookup failed — treating as unsubscribed');
    return [];
  });
  if (covering.length === 0) {
    stats.skip_no_subscription = (stats.skip_no_subscription || 0) + 1;
    stats.skip_no_subscription_cliniko_ids = stats.skip_no_subscription_cliniko_ids || [];
    if (!stats.skip_no_subscription_cliniko_ids.includes(String(clinikoPatientId))) {
      stats.skip_no_subscription_cliniko_ids.push(String(clinikoPatientId));
    }
    // Deliberately DO NOT mark the idempotency key here. An appointment can be
    // attended just before the patient's first DD lands (their subscription /
    // Stripe link doesn't exist at poll time). If we marked it, it would be
    // permanently skipped and the session would never invoice once the link
    // appears — leaving the eventual overpayment credit unallocated. Leaving it
    // unmarked lets a later poll (after the link is written) invoice it, and the
    // flag below makes any that age out of the cursor window discoverable.
    // The flag id is keyed by appt id, so ON CONFLICT DO NOTHING dedupes re-polls.
    await flag(
      'appointment_unresolved_subscription',
      appt.id,
      clinikoPatientId,
      `Arrived appointment ${appt.id} on ${apptStartsAtIso.slice(0, 10)} — no Stripe subscription resolved at poll time. Will retry on later polls; reprocess if the patient later subscribes.`,
      log,
      'Left unmarked for retry — see poller no_subscription handling',
    );
    return 'skipped';
  }
  if (covering.length > 1) {
    log.warn({ appt_id: appt.id, cliniko_patient_id: clinikoPatientId, count: covering.length }, 'Multiple subscriptions cover this appointment date — using first');
  }

  // Entitlement check: only proceed if the appointment's service type is part
  // of the subscription product's covered services. Otherwise this is a casual
  // session that just happened to fall within a subscription window (e.g., a
  // T1 block patient also paying casually for a one-off Initial Assessment).
  const { subscription } = covering[0];
  const productName = await getSubscriptionProductName(subscription).catch(() => null);
  const ppFee = productName ? getPpFee(productName) : null;
  if (!ppFee || !Array.isArray(ppFee.entitlements)) {
    stats.skip_no_entitlements_config = (stats.skip_no_entitlements_config || 0) + 1;
    log.warn({ appt_id: appt.id, product: productName || '(unknown)' }, 'Subscription product has no entitlement config — skipping');
    await mark(idempKey);
    return 'skipped';
  }
  if (!ppFee.entitlements.includes(service.name)) {
    stats.skip_not_entitled = (stats.skip_not_entitled || 0) + 1;
    log.info({ appt_id: appt.id, product: productName, service_name: service.name, service_code: service.code }, 'Service not in subscription entitlements — treating as casual');
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

  // PHI hygiene: service.name and the description can reveal treatment type.
  // Log identifiers + amounts only; service.code is the catalog reference and
  // doesn't disclose treatment specifics.
  log.info(
    {
      appt_id: appt.id,
      cliniko_patient_id: clinikoPatientId,
      service_code: service.code || 'uncoded',
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
