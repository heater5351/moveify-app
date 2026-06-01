'use strict';

// Pure block-bundle progress logic (no IO) — testable in isolation.
//
// A block is a time-boxed 6-week bundle of EP sessions sold as a tier (T1/T2/T3).
// The clinic needs to see, at the Cliniko booking screen, how much of the bundle
// has been delivered so far so they neither over- nor under-service the patient.
// This module turns a tier + a list of delivered sessions into the one-line
// `[BLOCK] …` string the worker writes into the patient's `appointment_notes`.
//
// Bundle compositions (Part-Time Pricing v3 §3):
//   T1 = design + 4 group + reassess
//   T2 = 60-min design + 4× weekly 30-min 1:1 + 30-min reassess
//   T3 = 60-min design + 4× weekly 45-min 1:1 + 30-min reassess
//
// Counting is delivery-based (attended sessions), decoupled from billing — so a
// design session paid casually (post-casual block variants) still counts as
// delivered, and a cancellation simply isn't counted (self-heals).

const serviceCatalog = require('./service-catalog');
const { PP_FEES } = require('./rates');

const BLOCK_MS = 42 * 24 * 60 * 60 * 1000; // 6 weeks
// Keep tracking for a week past the nominal end so the final "complete" / gap
// state lands on the note before we stop touching the patient.
const TRACKING_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const SLOT = { DESIGN: 'design', WEEKLY: 'weekly', GROUP: 'group', REASSESS: 'reassess' };

// Expected count per slot, per tier. `contactSlot` names the recurring weekly
// contact so the next-action phrase can be built generically.
const BLOCK_BUNDLES = {
  t1: { label: 'T1', contactSlot: SLOT.GROUP,  slots: { [SLOT.DESIGN]: 1, [SLOT.GROUP]: 4,  [SLOT.REASSESS]: 1 } },
  t2: { label: 'T2', contactSlot: SLOT.WEEKLY, slots: { [SLOT.DESIGN]: 1, [SLOT.WEEKLY]: 4, [SLOT.REASSESS]: 1 } },
  t3: { label: 'T3', contactSlot: SLOT.WEEKLY, slots: { [SLOT.DESIGN]: 1, [SLOT.WEEKLY]: 4, [SLOT.REASSESS]: 1 } },
};

// Only products billed as a block are eligible. Maps a Stripe product name to a
// tier id, or null if it is not a block product.
function blockTierId(productName) {
  const fee = PP_FEES[productName];
  if (!fee || fee.billing !== 'block') return null;
  const n = String(productName).toLowerCase();
  if (n.includes('t1') || n.includes('tier 1') || n.includes('foundation')) return 't1';
  if (n.includes('t2') || n.includes('tier 2') || n.includes('progress')) return 't2';
  if (n.includes('t3') || n.includes('tier 3') || n.includes('performance')) return 't3';
  return null;
}

// Maps an attended session's Cliniko appointment-type name to a bundle slot, or
// null if the service is not part of any block bundle. Tier-agnostic: any
// "Subsequent" 1:1 counts as the weekly contact regardless of 30/45-min, so a
// mis-booked duration still registers.
function classifySession(appointmentTypeName) {
  const svc = serviceCatalog.lookup(appointmentTypeName);
  const name = svc ? svc.name : '';
  if (!name) return null;
  if (name.startsWith('Program Setup')) return SLOT.DESIGN;
  if (name.startsWith('Exercise Physiology Reassessment')) return SLOT.REASSESS;
  if (name === 'Exercise Physiology Group Consultation') return SLOT.GROUP;
  if (name.startsWith('Subsequent Exercise Physiology Consultation')) return SLOT.WEEKLY;
  return null;
}

// Computes the block window from a Stripe subscription start date (unix seconds).
function blockWindow(subStartUnixSec) {
  const startMs = Number(subStartUnixSec) * 1000;
  return { startMs, endMs: startMs + BLOCK_MS };
}

// True while the patient should still have their note refreshed (within the
// block, plus a grace tail to capture the final state).
function isTrackable(window, nowMs = Date.now()) {
  return nowMs <= window.endMs + TRACKING_GRACE_MS;
}

function fmtDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// 1-based block week, clamped to 1..6.
function blockWeek(window, nowMs = Date.now()) {
  const w = Math.floor((nowMs - window.startMs) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(Math.max(w, 1), 6);
}

// Core computation. `sessions` is an array of { appointmentTypeName } already
// filtered to this patient's delivered (attended) sessions within the window.
// Returns { line, done, total, complete, counts }.
function computeProgress({ tierId, sessions, window, nowMs = Date.now() }) {
  const bundle = BLOCK_BUNDLES[tierId];
  if (!bundle) throw new Error(`Unknown block tier: ${tierId}`);

  const counts = {};
  for (const slot of Object.keys(bundle.slots)) counts[slot] = 0;
  for (const s of sessions) {
    const slot = classifySession(s.appointmentTypeName);
    if (slot && counts[slot] !== undefined) counts[slot]++;
  }

  let done = 0;
  let total = 0;
  const remaining = {};
  for (const [slot, expected] of Object.entries(bundle.slots)) {
    done += Math.min(counts[slot], expected);
    total += expected;
    remaining[slot] = Math.max(expected - counts[slot], 0);
  }
  const totalRemaining = total - done;
  const ends = fmtDate(window.endMs);
  const T = bundle.label;

  if (totalRemaining === 0) {
    return {
      line: `[BLOCK] ${T} complete — further sessions are casual/extra`,
      done, total, complete: true, counts,
    };
  }

  const contactSlot = bundle.contactSlot;
  const contactRemaining = remaining[contactSlot];
  const contactLabel = contactSlot === SLOT.GROUP ? 'group' : 'weekly 1:1';

  let phrase;
  if (remaining[SLOT.DESIGN] > 0) phrase = 'design pending';
  else if (contactRemaining > 0) phrase = `${contactLabel} ${contactRemaining} left`;
  else if (remaining[SLOT.REASSESS] > 0) phrase = 'reassess due';
  else phrase = `${totalRemaining} left`;

  const week = blockWeek(window, nowMs);
  // Under-service guard — flag when the block is nearly up but contacts remain.
  const line = week >= 5
    ? `[BLOCK] ⚠ ${T} week ${week}/6 · ${totalRemaining} undelivered · ${phrase} · ends ${ends}`
    : `[BLOCK] ${T} · ${done}/${total} done · ${phrase} · ends ${ends}`;

  return { line, done, total, complete: false, counts };
}

// Splices a fresh `[BLOCK] …` line into an existing appointment_notes value,
// preserving any manual (non-[BLOCK]) lines. Returns the new note string, or
// null if nothing changed (so the caller can skip the PATCH).
function spliceBlockLine(existingNotes, blockLine) {
  const lines = String(existingNotes || '').split(/\r?\n/);
  const currentBlock = (lines.find((l) => l.trim().startsWith('[BLOCK]')) || '').trim();
  if (currentBlock === blockLine.trim()) return null;
  const manual = lines.filter((l) => !l.trim().startsWith('[BLOCK]'));
  return [blockLine.trim(), ...manual]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  SLOT,
  BLOCK_BUNDLES,
  blockTierId,
  classifySession,
  blockWindow,
  isTrackable,
  blockWeek,
  computeProgress,
  spliceBlockLine,
};
