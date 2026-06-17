import { describe, it, expect } from 'vitest';

// Deterministic PROM scoring (Phase 4). Worked examples from the published scoring
// rules. Scores are computed server-side and must never drift.
const { scoreProm, validateResponses, outcomeLines } = await import('../services/prom-scoring.js');
const { getProm, loadProms } = await import('../services/prom-catalog.js');

const nprs = getProm('nprs');
const psfs = getProm('psfs');
const lefs = getProm('lefs');
const k10 = getProm('k10');
const dass = getProm('dass21');

describe('PROM catalog', () => {
  it('seeds only license-noted instruments', () => {
    expect(loadProms().proms.every(p => typeof p.license === 'string')).toBe(true);
  });
  it('resolves a prom-level itemScale onto bare items', () => {
    expect(lefs.items[0].scale).toEqual({ min: 0, max: 4, minLabel: 'Extreme difficulty or unable', maxLabel: 'No difficulty' });
  });
});

describe('NPRS (3-item composite)', () => {
  it('averages current/average/worst', () => {
    const r = scoreProm(nprs, { now: 6, avg: 5, worst: 8 });
    expect(r.score).toBe(6.3);
    expect(r.band).toBe('Severe pain');
  });
  it('rejects out-of-range', () => {
    expect(validateResponses(nprs, { now: 6, avg: 5, worst: 11 })).toContain('out of range');
  });
});

describe('PSFS (average of activities)', () => {
  it('averages the activity ratings', () => {
    expect(scoreProm(psfs, { activities: [{ name: 'Walk', score: 4 }, { name: 'Stairs', score: 7 }, { name: 'Lift', score: 3 }] }).score).toBe(4.7);
  });
});

describe('LEFS (sum /80, higher better)', () => {
  it('sums to 80 at full function', () => {
    expect(scoreProm(lefs, Object.fromEntries(lefs.items.map(i => [i.key, 4]))).score).toBe(80);
  });
  it('bands a mid score', () => {
    const r = scoreProm(lefs, Object.fromEntries(lefs.items.map(i => [i.key, 2])));
    expect(r.score).toBe(40);
    expect(r.band).toBe('Moderate limitation');
  });
});

describe('K10 (sum 10-50)', () => {
  it('floors at 10 (well) and bands higher distress', () => {
    expect(scoreProm(k10, Object.fromEntries(k10.items.map(i => [i.key, 1]))).band).toBe('Likely to be well');
    expect(scoreProm(k10, Object.fromEntries(k10.items.map(i => [i.key, 3]))).band).toBe('Severe distress');
  });
});

describe('DASS-21 (subscales × 2)', () => {
  it('scores each subscale ×2 and bands separately', () => {
    const r = scoreProm(dass, Object.fromEntries(dass.items.map(i => [i.key, 2])));
    expect(r.score).toBeNull();
    const d = r.subscales.find(s => s.key === 'd');
    expect(d.score).toBe(28); // 7 items × 2 × ×2
    expect(d.band).toBe('Extremely severe');
    expect(r.subscales.find(s => s.key === 's').band).toBe('Severe');
  });
  it('emits one note line per subscale', () => {
    const r = scoreProm(dass, Object.fromEntries(dass.items.map(i => [i.key, 1])));
    const lines = outcomeLines(dass, r.score, r.band, r.subscales);
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('DASS-21 — Depression');
  });
  it('rejects a missing item', () => {
    expect(validateResponses(dass, { q1: 2 })).toContain('required');
  });
});
