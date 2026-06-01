import { describe, it, expect } from 'vitest';

// Pure-logic tests for the block-progress bundle engine. block-bundles.js only
// pulls in service-catalog + rates (both pure, no IO), so it imports cleanly with
// no mocking. Appointment-type names and product names below are the REAL values
// from service-catalog.js / rates.js — so these tests also lock the integration
// between the engine and those catalogs.
const {
  SLOT,
  blockTierId,
  classifySession,
  blockWindow,
  isTrackable,
  blockWeek,
  computeProgress,
  spliceBlockLine,
} = await import('../lib/block-bundles.js');

// Real Cliniko appointment_type names → slot.
const DESIGN = 'Program Setup Exercise Physiology Consultation - 60 mins (GPCCMP)';
const GROUP = 'Exercise Physiology Group Consultation';
const REASSESS = 'Exercise Physiology Reassessment - 30 mins (GPCCMP)';
const WEEKLY30 = 'Subsequent Exercise Physiology Consultation - 30 mins (GPCCMP)';
const WEEKLY45 = 'Subsequent Exercise Physiology Consultation - 45 mins (Private)';

const DAY = 24 * 60 * 60 * 1000;
const sess = (name, n = 1) => Array.from({ length: n }, () => ({ appointmentTypeName: name }));

// A window starting at a fixed UTC instant; endMs is +6 weeks.
const START = Date.UTC(2026, 0, 1); // 2026-01-01
const WINDOW = { startMs: START, endMs: START + 42 * DAY };
const ENDS = new Date(WINDOW.endMs).toISOString().slice(0, 10); // computed, not hardcoded
const WEEK2 = START + 7 * DAY;   // mid-block, no under-service warning
const WEEK5 = START + 28 * DAY;  // triggers the week>=5 warning

describe('blockTierId', () => {
  it('maps real block product names to tiers', () => {
    expect(blockTierId('T1 Foundation')).toBe('t1');
    expect(blockTierId('T2 Progress')).toBe('t2');
    expect(blockTierId('T3 Performance')).toBe('t3');
    expect(blockTierId('Tier 1 — Foundation Block Post-Casual')).toBe('t1');
    expect(blockTierId('Tier 3 — Performance Block Post-Casual')).toBe('t3');
  });

  it('returns null for non-block products and unknown products', () => {
    expect(blockTierId('Independent')).toBeNull();   // billing: 4-weekly
    expect(blockTierId('Maintain')).toBeNull();
    expect(blockTierId('Not A Real Product')).toBeNull(); // absent from PP_FEES
  });
});

describe('classifySession', () => {
  it('classifies each real appointment-type name to its slot', () => {
    expect(classifySession(DESIGN)).toBe(SLOT.DESIGN);
    expect(classifySession(REASSESS)).toBe(SLOT.REASSESS);
    expect(classifySession(GROUP)).toBe(SLOT.GROUP);
    expect(classifySession(WEEKLY30)).toBe(SLOT.WEEKLY);
    expect(classifySession(WEEKLY45)).toBe(SLOT.WEEKLY); // 30 and 45 min both = weekly contact
  });

  it('is tolerant of casing/whitespace and returns null for unknowns', () => {
    expect(classifySession('  exercise   physiology group consultation ')).toBe(SLOT.GROUP);
    expect(classifySession('Some Random Appointment')).toBeNull();
    expect(classifySession('')).toBeNull();
  });
});

describe('blockWindow / isTrackable / blockWeek', () => {
  it('blockWindow derives start+end from a unix-seconds start', () => {
    const w = blockWindow(1_700_000_000);
    expect(w.startMs).toBe(1_700_000_000 * 1000);
    expect(w.endMs).toBe(w.startMs + 42 * DAY);
  });

  it('isTrackable stays true through the 7-day grace tail, then false', () => {
    expect(isTrackable(WINDOW, WINDOW.startMs)).toBe(true);
    expect(isTrackable(WINDOW, WINDOW.endMs + 6 * DAY)).toBe(true);  // inside grace
    expect(isTrackable(WINDOW, WINDOW.endMs + 8 * DAY)).toBe(false); // past grace
  });

  it('blockWeek is 1-based and clamped to 1..6', () => {
    expect(blockWeek(WINDOW, WINDOW.startMs)).toBe(1);
    expect(blockWeek(WINDOW, WINDOW.startMs + 7 * DAY)).toBe(2);
    expect(blockWeek(WINDOW, WINDOW.startMs - 5 * DAY)).toBe(1);     // before start clamps up
    expect(blockWeek(WINDOW, WINDOW.startMs + 100 * DAY)).toBe(6);   // past end clamps down
  });
});

describe('computeProgress', () => {
  it('throws on an unknown tier', () => {
    expect(() => computeProgress({ tierId: 't9', sessions: [], window: WINDOW, nowMs: WEEK2 }))
      .toThrow(/Unknown block tier/);
  });

  it('T1 complete (design + 4 group + reassess)', () => {
    const sessions = [...sess(DESIGN), ...sess(GROUP, 4), ...sess(REASSESS)];
    const r = computeProgress({ tierId: 't1', sessions, window: WINDOW, nowMs: WEEK2 });
    expect(r).toMatchObject({ done: 6, total: 6, complete: true });
    expect(r.line).toBe('[BLOCK] T1 complete — further sessions are casual/extra');
  });

  it('caps over-delivery: 6 groups still only count as 4', () => {
    const sessions = [...sess(DESIGN), ...sess(GROUP, 6), ...sess(REASSESS)];
    const r = computeProgress({ tierId: 't1', sessions, window: WINDOW, nowMs: WEEK2 });
    expect(r).toMatchObject({ done: 6, total: 6, complete: true });
    expect(r.counts.group).toBe(6); // raw count preserved
  });

  it('design pending takes priority in the phrase', () => {
    const sessions = sess(GROUP, 2); // no design yet
    const r = computeProgress({ tierId: 't1', sessions, window: WINDOW, nowMs: WEEK2 });
    expect(r).toMatchObject({ done: 2, total: 6, complete: false });
    expect(r.line).toBe(`[BLOCK] T1 · 2/6 done · design pending · ends ${ENDS}`);
  });

  it('shows remaining group contacts for T1', () => {
    const sessions = [...sess(DESIGN), ...sess(GROUP, 2)];
    const r = computeProgress({ tierId: 't1', sessions, window: WINDOW, nowMs: WEEK2 });
    expect(r.line).toBe(`[BLOCK] T1 · 3/6 done · group 2 left · ends ${ENDS}`);
  });

  it('shows weekly 1:1 contacts for T2/T3', () => {
    const sessions = [...sess(DESIGN), ...sess(WEEKLY30), ...sess(WEEKLY45)];
    const r = computeProgress({ tierId: 't2', sessions, window: WINDOW, nowMs: WEEK2 });
    expect(r).toMatchObject({ done: 3, total: 6, complete: false });
    expect(r.line).toBe(`[BLOCK] T2 · 3/6 done · weekly 1:1 2 left · ends ${ENDS}`);
  });

  it('reassess due once design + all contacts are delivered', () => {
    const sessions = [...sess(DESIGN), ...sess(GROUP, 4)]; // reassess missing
    const r = computeProgress({ tierId: 't1', sessions, window: WINDOW, nowMs: WEEK2 });
    expect(r.line).toBe(`[BLOCK] T1 · 5/6 done · reassess due · ends ${ENDS}`);
  });

  it('flags an under-service warning from week 5 onward', () => {
    const sessions = [...sess(DESIGN), ...sess(GROUP, 1)]; // 4 contacts still missing
    const r = computeProgress({ tierId: 't1', sessions, window: WINDOW, nowMs: WEEK5 });
    expect(r.complete).toBe(false);
    expect(r.line).toBe(`[BLOCK] ⚠ T1 week 5/6 · 4 undelivered · group 3 left · ends ${ENDS}`);
  });
});

describe('spliceBlockLine', () => {
  it('adds the line to empty notes', () => {
    expect(spliceBlockLine('', '[BLOCK] T1 · 1/6 done')).toBe('[BLOCK] T1 · 1/6 done');
  });

  it('puts the block line first and preserves manual lines', () => {
    expect(spliceBlockLine('Allergic to X', '[BLOCK] new')).toBe('[BLOCK] new\nAllergic to X');
  });

  it('replaces an existing [BLOCK] line, keeping manual notes', () => {
    expect(spliceBlockLine('[BLOCK] old\nmanual note', '[BLOCK] new'))
      .toBe('[BLOCK] new\nmanual note');
  });

  it('returns null when the block line is unchanged (so the caller skips the PATCH)', () => {
    expect(spliceBlockLine('[BLOCK] same\nkeep me', '[BLOCK] same')).toBeNull();
  });

  it('collapses runs of 3+ blank lines', () => {
    expect(spliceBlockLine('[BLOCK] old\n\n\nmanual', '[BLOCK] new'))
      .toBe('[BLOCK] new\n\nmanual');
  });
});
