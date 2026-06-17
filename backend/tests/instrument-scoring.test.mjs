import { describe, it, expect } from 'vitest';

// Deterministic scoring for multi-item instruments (Berg, Mini-BEST). Locks the
// sum, the bilateral worse-side rule, validation, and the catalog↔norm alignment
// of the instrument totals. Worked examples from the official protocols.
const { scoreInstrument, validateDetail } = await import('../services/instrument-scoring.js');
const { assessmentsByKey } = await import('../services/assessment-catalog.js');
const { interpretByKey, buildInterpretation } = await import('../services/normative-data.js');

const berg = assessmentsByKey().get('berg_balance').instrument;
const mini = assessmentsByKey().get('mini_bestest').instrument;

describe('Berg Balance Scale', () => {
  it('has 14 items keyed to a 0-56 total', () => {
    expect(berg.items.length).toBe(14);
    expect(berg.maxScore).toBe(56);
    expect(berg.items.every(i => i.options.length === 5)).toBe(true);
  });

  it('sums item scores (all 4 = 56)', () => {
    const detail = Object.fromEntries(berg.items.map(i => [i.key, 4]));
    expect(scoreInstrument(berg.items, detail).total).toBe(56);
  });

  it('counts a partial test without crashing', () => {
    const detail = { sit_to_stand: 4, standing_unsupported: 3 };
    const r = scoreInstrument(berg.items, detail);
    expect(r.total).toBe(7);
    expect(r.answered).toBe(2);
  });

  it('worked example: total 34 grades as medium fall risk', () => {
    expect(buildInterpretation(interpretByKey('berg_balance', 34, 75, 'female')).toLowerCase()).toContain('medium fall risk');
    expect(buildInterpretation(interpretByKey('berg_balance', 12, 75, 'female')).toLowerCase()).toContain('high fall risk');
  });
});

describe('Mini-BESTest', () => {
  it('has 14 items keyed to a 0-28 total with two bilateral items', () => {
    expect(mini.items.length).toBe(14);
    expect(mini.maxScore).toBe(28);
    expect(mini.items.filter(i => i.bilateral).map(i => i.key)).toEqual(['stand_on_one_leg', 'stepping_lateral']);
  });

  it('uses the worse (lower) side for bilateral items', () => {
    const detail = Object.fromEntries(mini.items.map(i => [i.key, i.bilateral ? { left: 2, right: 0 } : 2]));
    // 12 unilateral items ×2 = 24, plus two bilateral worst-sides (0 + 0) = 24.
    expect(scoreInstrument(mini.items, detail).total).toBe(24);
  });

  it('a bilateral item needs both sides to count as answered', () => {
    const detail = { stand_on_one_leg: { left: 2 } };
    const r = scoreInstrument(mini.items, detail);
    expect(r.total).toBe(2); // min of [2]
    expect(r.answered).toBe(0); // not both sides
  });
});

describe('validateDetail', () => {
  it('rejects an out-of-range score', () => {
    expect(validateDetail(berg.items, { sit_to_stand: 9 })).toContain('invalid');
  });
  it('rejects an unknown item', () => {
    expect(validateDetail(berg.items, { not_a_real_item: 2 })).toContain('unknown');
  });
  it('accepts a valid bilateral answer', () => {
    expect(validateDetail(mini.items, { stand_on_one_leg: { left: 2, right: 1 } })).toBe(null);
  });
});
