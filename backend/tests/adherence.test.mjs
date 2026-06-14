import { describe, it, expect } from 'vitest';

// Pure-logic tests for the Dashboard adherence service. These lock the
// active-window resolution (duration enum / keyword start / custom end) and the
// status bucketing that drives the clinician triage view.
const { resolveProgramWindow, computeAdherence } = await import('../services/adherence.js');

const TODAY = new Date(2026, 5, 14); // 2026-06-14 (local midnight)
const DAILY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const prog = (overrides = {}) => ({
  id: 1,
  patient_id: 1,
  frequency: DAILY,
  start_date: new Date(2026, 0, 1), // 2026-01-01, well in the past
  created_at: new Date(2026, 0, 1),
  duration: 'ongoing',
  custom_end_date: null,
  ...overrides,
});

describe('resolveProgramWindow', () => {
  it('ongoing programs are always active once started', () => {
    expect(resolveProgramWindow(prog({ duration: 'ongoing' }), TODAY).isActive).toBe(true);
  });

  it('completed programs are inactive', () => {
    expect(resolveProgramWindow(prog({ duration: 'completed' }), TODAY).isActive).toBe(false);
  });

  it('fixed-duration program is active inside its window', () => {
    const p = prog({ duration: '4weeks', start_date: new Date(2026, 5, 1) }); // 06-01 → 06-29
    expect(resolveProgramWindow(p, TODAY).isActive).toBe(true);
  });

  it('fixed-duration program is inactive after it ends', () => {
    const p = prog({ duration: '4weeks', start_date: new Date(2026, 4, 1) }); // 05-01 → 05-29
    expect(resolveProgramWindow(p, TODAY).isActive).toBe(false);
  });

  it('custom duration uses custom_end_date', () => {
    const future = prog({ duration: 'custom', custom_end_date: new Date(2026, 6, 1) });
    const past = prog({ duration: 'custom', custom_end_date: new Date(2026, 4, 1) });
    expect(resolveProgramWindow(future, TODAY).isActive).toBe(true);
    expect(resolveProgramWindow(past, TODAY).isActive).toBe(false);
  });

  it('falls back to created_at when start_date is a keyword', () => {
    const p = prog({ duration: 'ongoing', start_date: 'today', created_at: new Date(2026, 0, 1) });
    expect(resolveProgramWindow(p, TODAY).isActive).toBe(true);
  });

  it('programs that have not started yet are inactive', () => {
    const p = prog({ duration: 'ongoing', start_date: new Date(2026, 6, 1) }); // 07-01, future
    expect(resolveProgramWindow(p, TODAY).isActive).toBe(false);
  });
});

describe('computeAdherence', () => {
  const base = {
    programs: [prog()],
    exercisesByProgram: { 1: 2 }, // 2 exercises, daily → 14 days * 2 = 28 prescribed
    lastActivityDate: '2026-06-14',
    days: 14,
    today: TODAY,
  };

  it('full completion is on-track', () => {
    const r = computeAdherence({ ...base, completionsInWindow: 28 });
    expect(r.completionRate).toBe(100);
    expect(r.status).toBe('on-track');
  });

  it('half completion is slipping', () => {
    const r = computeAdherence({ ...base, completionsInWindow: 14 });
    expect(r.completionRate).toBe(50);
    expect(r.status).toBe('slipping');
  });

  it('low completion is at-risk', () => {
    const r = computeAdherence({ ...base, completionsInWindow: 7 });
    expect(r.completionRate).toBe(25);
    expect(r.status).toBe('at-risk');
  });

  it('no activity for a week is fallen-off regardless of rate', () => {
    const r = computeAdherence({ ...base, completionsInWindow: 28, lastActivityDate: '2026-06-01' });
    expect(r.status).toBe('fallen-off');
  });

  it('never-active patient is fallen-off', () => {
    const r = computeAdherence({ ...base, completionsInWindow: 0, lastActivityDate: null });
    expect(r.daysSinceLastActivity).toBeNull();
    expect(r.status).toBe('fallen-off');
  });

  it('caps completion rate at 100', () => {
    const r = computeAdherence({ ...base, completionsInWindow: 50 });
    expect(r.completionRate).toBe(100);
  });
});
