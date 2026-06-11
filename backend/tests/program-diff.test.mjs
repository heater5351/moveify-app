import { describe, it, expect } from 'vitest';

// Pure-logic tests for the program-revision diff renderer (Phase 2 of the
// scribe context upgrades). The diff lines are injected verbatim into the SOAP
// prompt's PRESCRIPTION CHANGES block, so we lock exact wording/values here.
const { renderProgramDiff } = await import('../services/program-diff.js');

const ex = (id, name, overrides = {}) => ({
  id,
  name,
  sets: 3,
  reps: 8,
  weight: 0,
  duration: null,
  rest: null,
  holdTime: '',
  isWarmup: false,
  order: 0,
  ...overrides,
});

const snapshot = (exercises, overrides = {}) => ({
  name: 'Knee Rehab',
  startDate: '2026-06-01',
  frequency: '["Mon","Wed"]',
  duration: '4weeks',
  customEndDate: null,
  exercises,
  ...overrides,
});

describe('renderProgramDiff', () => {
  it('renders program creation (before = null) as new program + added lines', () => {
    const lines = renderProgramDiff(null, snapshot([ex(1, 'Squat with Barbell', { weight: 20 })]));
    expect(lines[0]).toBe('New program assigned: "Knee Rehab" (1 exercise)');
    expect(lines[1]).toBe('Added: Squat with Barbell (3×8 @ 20 kg)');
  });

  it('returns [] for identical snapshots', () => {
    const s = snapshot([ex(1, 'Squat with Barbell')]);
    expect(renderProgramDiff(s, s)).toEqual([]);
  });

  it('renders prescription changes, additions, and removals matched by row id', () => {
    const before = snapshot([
      ex(1, 'Squat with Barbell', { sets: 3, reps: 8, weight: 20 }),
      ex(2, 'Step Up with Bodyweight'),
    ]);
    const after = snapshot([
      ex(1, 'Squat with Barbell', { sets: 4, reps: 6, weight: 25 }),
      ex(3, 'Calf Raise with Dumbbells', { sets: 3, reps: 12, weight: 10 }),
    ]);
    const lines = renderProgramDiff(before, after);
    expect(lines).toContain('Squat with Barbell: 3×8 → 4×6; weight 20 → 25 kg');
    expect(lines).toContain('Added: Calf Raise with Dumbbells (3×12 @ 10 kg)');
    expect(lines).toContain('Removed: Step Up with Bodyweight');
  });

  it('renders program-level metadata changes (name, frequency, duration)', () => {
    const before = snapshot([ex(1, 'Squat with Barbell')]);
    const after = snapshot([ex(1, 'Squat with Barbell')], {
      name: 'Knee Rehab Block 2',
      frequency: '["Mon","Wed","Fri"]',
      duration: '6weeks',
    });
    const lines = renderProgramDiff(before, after);
    expect(lines).toContain('Program renamed: "Knee Rehab" → "Knee Rehab Block 2"');
    expect(lines).toContain('Frequency: Mon/Wed → Mon/Wed/Fri');
    expect(lines).toContain('Duration: 4weeks → 6weeks');
  });

  it('does not flag exercises whose prescription is unchanged', () => {
    const before = snapshot([ex(1, 'Squat with Barbell'), ex(2, 'Glute Bridge with Bodyweight')]);
    const after = snapshot([ex(1, 'Squat with Barbell'), ex(2, 'Glute Bridge with Bodyweight', { sets: 4 })]);
    const lines = renderProgramDiff(before, after);
    expect(lines).toEqual(['Glute Bridge with Bodyweight: 3×8 → 4×8']);
  });

  it('handles duration/rest/hold changes and renames', () => {
    const before = snapshot([ex(1, 'Plank', { duration: 30, rest: 60, holdTime: '' })]);
    const after = snapshot([ex(1, 'Front Plank', { duration: 45, rest: 90, holdTime: '' })]);
    const lines = renderProgramDiff(before, after);
    expect(lines).toEqual(['Front Plank: renamed from "Plank"; duration 30 → 45 sec; rest 60 → 90 sec']);
  });
});
