'use strict';

// Block-progress sync → Cliniko `appointment_notes`.
//
// For every patient currently on a block tier (T1/T2/T3) Stripe subscription,
// derive how much of their 6-week bundle has been delivered (from attended
// Cliniko sessions, individual + group) and write a one-line `[BLOCK] …`
// progress string into their Cliniko `appointment_notes` so the front desk can
// book correctly without over-/under-servicing.
//
// Authoritative count = delivered sessions (ledger-derived), NOT a Cliniko case
// counter — it self-heals on cancel/reschedule. See the vault's "Cliniko Cases
// Convention v1" + "Worker Handover — Block Tracking & Cases" for rationale.
//
// Reads use the finance (read-only) Cliniko key; the note write uses the admin
// (full-access) key. Stripe is the source of truth for which block + when it
// started (subscription.start_date).

const cliniko = require('../services/cliniko');
const { getSubscriptionByClinikoId, getSubscriptionProductName } = require('../services/stripe');
const { getAll } = require('../db/pool');
const {
  blockTierId,
  blockWindow,
  isTrackable,
  computeProgress,
} = require('../lib/block-bundles');
const { logger } = require('../lib/logger');

const financeC = cliniko.finance;
const adminC = cliniko.admin;

// Resolves an appointment_type link → name, cached per run via the finance
// layer's own in-memory cache.
async function typeName(typeLink) {
  const typeId = typeLink?.links?.self?.split('/').pop();
  if (!typeId) return '';
  const data = await financeC.getAppointmentType(typeId).catch(() => null);
  return data?.name || '';
}

// Builds clinikoId → [{ appointmentTypeName, startsMs }] of attended sessions
// (individual + group) for ONLY the given block patients — a per-patient fetch,
// so we never pull the whole clinic's appointment history. Resolves group
// attendances via the parent group_appointment (its type + start time).
async function fetchAttendedSessions(patients, log) {
  const byPatient = new Map();
  const groupCache = new Map();

  for (const { clinikoId } of patients) {
    const sessions = [];

    const appts = await financeC.getPatientAppointmentsAll(clinikoId).catch((err) => {
      log.warn({ cliniko_id: clinikoId, err: err.message }, 'block-progress: patient appointments fetch failed');
      return [];
    });
    for (const a of appts) {
      if (!a.patient_arrived || a.did_not_arrive || a.cancelled_at) continue;
      sessions.push({
        appointmentTypeName: await typeName(a.appointment_type),
        startsMs: new Date(a.starts_at || 0).getTime(),
      });
    }

    const attendees = await financeC.getPatientAttendeesAll(clinikoId).catch((err) => {
      log.warn({ cliniko_id: clinikoId, err: err.message }, 'block-progress: patient attendees fetch failed');
      return [];
    });
    for (const at of attendees) {
      if (at.cancelled_at || at.archived_at || !at.arrived) continue;
      const groupId = at.group_appointment?.links?.self?.split('/').pop()
        || at.booking?.links?.self?.split('/').pop();
      if (!groupId) continue;
      let group = groupCache.get(groupId);
      if (!group) {
        group = await financeC.getGroupAppointment(groupId).catch(() => null);
        if (group) groupCache.set(groupId, group);
      }
      if (!group) continue;
      sessions.push({
        appointmentTypeName: await typeName(group.appointment_type),
        startsMs: new Date(group.starts_at || 0).getTime(),
      });
    }

    byPatient.set(String(clinikoId), sessions);
  }

  return byPatient;
}

async function syncBlockProgress(log = logger, { dryRun = false } = {}) {
  const nowMs = Date.now();
  const stats = { dryRun, contacts: 0, activeBlocks: 0, updated: 0, unchanged: 0, errors: 0 };

  const t0 = Date.now();

  // 1) Resolve which patients are on a trackable block right now (via Stripe).
  const contacts = await getAll('SELECT cliniko_id, email FROM contacts');
  stats.contacts = contacts.length;
  log.info({ contacts: contacts.length }, 'block-progress: phase1 contacts loaded');

  const active = [];
  for (const c of contacts) {
    try {
      const sub = await getSubscriptionByClinikoId(c.cliniko_id, c.email);
      if (!sub) continue;
      const product = await getSubscriptionProductName(sub).catch(() => null);
      const tierId = product ? blockTierId(product) : null;
      if (!tierId) continue;
      const window = blockWindow(sub.start_date);
      if (!isTrackable(window, nowMs)) continue;
      active.push({ clinikoId: String(c.cliniko_id), tierId, window });
    } catch (err) {
      log.warn({ cliniko_id: c.cliniko_id, err: err.message }, 'block-progress: subscription resolve failed');
    }
  }
  stats.activeBlocks = active.length;
  log.info({ activeBlocks: active.length, stripe_phase_ms: Date.now() - t0 }, 'block-progress: phase1 stripe scan done');
  if (active.length === 0) {
    log.info(stats, 'block-progress: no active block patients');
    return stats;
  }

  // 2) Fetch attended sessions for just the active block patients (per-patient,
  // not a clinic-wide scan).
  const t1 = Date.now();
  const sessionsByPatient = await fetchAttendedSessions(active, log);
  log.info({ fetch_phase_ms: Date.now() - t1 }, 'block-progress: phase2 cliniko fetch done');

  // 3) Per active block patient: compute progress + write the note.
  for (const { clinikoId, tierId, window } of active) {
    try {
      const all = sessionsByPatient.get(clinikoId) || [];
      // 7-day lead-in grace mirrors the poller: for post-casual blocks the
      // design 1:1 is attended just before the subscription start_date, so it
      // would otherwise fall outside the window and read as "design pending".
      const LEAD_IN_MS = 7 * 24 * 60 * 60 * 1000;
      const inWindow = all.filter((s) => s.startsMs >= window.startMs - LEAD_IN_MS && s.startsMs <= window.endMs)
        .map((s) => ({ appointmentTypeName: s.appointmentTypeName }));
      const { line, done, total, complete } = computeProgress({ tierId, sessions: inWindow, window, nowMs });

      if (dryRun) {
        // The [BLOCK] line is a session-count summary, not health data — safe to
        // log so the run can be eyeballed before any real Cliniko write.
        log.info({ cliniko_id: clinikoId, tier: tierId, done, total, complete, line }, 'block-progress DRY-RUN (no write)');
        stats.unchanged++;
        continue;
      }

      const { changed } = await adminC.updateBlockProgressNote(clinikoId, line);
      if (changed) stats.updated++; else stats.unchanged++;
      // PHI-safe: identifiers + counts only, never names or the note text.
      log.info({ cliniko_id: clinikoId, tier: tierId, done, total, complete, changed }, 'block-progress updated');
    } catch (err) {
      stats.errors++;
      log.error({ cliniko_id: clinikoId, err: err.message }, 'block-progress: write failed');
    }
  }

  log.info(stats, 'block-progress sync complete');
  return stats;
}

module.exports = { syncBlockProgress };
