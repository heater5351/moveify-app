'use strict';

const cliniko = require('../services/cliniko').finance;
const {
  upsertContact,
  upsertInvoice,
  upsertAppointment,
  getWorkerState,
  setWorkerState,
} = require('../services/billing-db');
const { logger } = require('../lib/logger');
const { runNdisRtwsa } = require('./ndis-rtwsa');

const STATE_KEY = 'cliniko_last_sync';

function normaliseLabel(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Walks Cliniko's custom_fields structure (sections → fields) and returns the
// first field value matching a kind. kind='fund' matches labels containing
// "health fund" or "phi fund". kind='membership' matches labels containing
// "membership" but not "medicare".
function extractCustomField(customFields, kind) {
  if (!customFields) return '';
  const sections = Array.isArray(customFields)
    ? customFields
    : Array.isArray(customFields.sections) ? customFields.sections : [];
  for (const section of sections) {
    const fields = section?.fields || [];
    for (const f of fields) {
      const label = normaliseLabel(f.name || f.label || f.token);
      if (kind === 'fund' && (label.includes('health fund') || label.includes('phi fund'))) {
        return String(f.value || '').trim();
      }
      if (kind === 'membership' && label.includes('membership') && !label.includes('medicare')) {
        return String(f.value || '').trim();
      }
    }
  }
  return '';
}

async function syncCliniko(log = logger) {
  const since = await getWorkerState(STATE_KEY);
  const runAt = new Date().toISOString();
  log.info({ since: since || 'full-backfill' }, 'Starting Cliniko sync');

  let counts = { patients: 0, appointments: 0, invoices: 0 };

  // Patients → Contacts
  try {
    const patientsRes = await cliniko.getPatients(since);
    for (const p of patientsRes.patients || []) {
      await upsertContact({
        cliniko_id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        email: p.email,
        phone: p.phone_mobile || p.phone_home || '',
        dob: p.date_of_birth || '',
        condition: '',
        medicare: p.medicare || '',
        medicare_reference: p.medicare_reference_number || '',
        dva_card_number: p.dva_card_number || '',
        phi_fund: extractCustomField(p.custom_fields, 'fund'),
        phi_membership_number: extractCustomField(p.custom_fields, 'membership'),
        updated_at: p.updated_at,
      });
      counts.patients++;
    }
  } catch (err) {
    log.error({ err: err.message }, 'Patients sync failed — continuing');
  }

  // Appointments
  try {
    const apptRes = await cliniko.getAppointments(since);
    for (const a of apptRes.appointments || []) {
      const isAttended = a.patient_arrived === true;
      const derivedStatus = a.did_not_arrive ? 'did_not_arrive' : isAttended ? 'arrived' : 'booked';

      await upsertAppointment({
        cliniko_id: a.id,
        patient_id: a.patient?.links?.self?.split('/').pop() || '',
        practitioner_id: a.practitioner?.links?.self?.split('/').pop() || '',
        status: derivedStatus,
        starts_at: a.starts_at,
        updated_at: a.updated_at,
      });
      counts.appointments++;

      if (!isAttended) continue;

      // Fetch appointment type name (link-only in list response; cached in-memory)
      const typeId = a.appointment_type?.links?.self?.split('/').pop();
      let resolvedTypeName = '';
      if (typeId) {
        const typeData = await cliniko.getAppointmentType(typeId).catch(() => null);
        resolvedTypeName = typeData?.name || '';
      }

      // Detect NDIS/RTWSA by appointment type name (patient_case has no case_type field in API)
      const typeNameUpper = resolvedTypeName.toUpperCase();
      if (typeNameUpper.includes('NDIS') || typeNameUpper.includes('RTWSA')) {
        await runNdisRtwsa({ appointment: a, log }).catch((err) =>
          log.error({ appt_id: a.id, err: err.message }, 'NDIS/RTWSA job failed')
        );
        continue;
      }
    }
  } catch (err) {
    log.error({ err: err.message }, 'Appointments sync failed — continuing');
  }

  // Invoices
  try {
    const invRes = await cliniko.getInvoices(since);
    for (const inv of invRes.invoices || []) {
      await upsertInvoice({
        cliniko_id: inv.id,
        patient_id: inv.patient?.links?.self?.split('/').pop() || '',
        status: inv.status || '',
        total: inv.total || 0,
        type: inv.invoice_type || '',
        created_at: inv.created_at,
        updated_at: inv.updated_at,
      });
      counts.invoices++;
    }
  } catch (err) {
    log.error({ err: err.message }, 'Invoices sync failed — continuing');
  }

  await setWorkerState(STATE_KEY, runAt);
  log.info(counts, 'Cliniko sync complete');
  return counts;
}

module.exports = { syncCliniko };
