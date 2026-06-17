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

describe('NDI / ODI (10 choice sections → %)', () => {
  const ndi = getProm('ndi');
  const odi = getProm('odi');
  it('each has 10 sections of 6 statements', () => {
    for (const p of [ndi, odi]) {
      expect(p.items.length).toBe(10);
      expect(p.items.every(i => i.options.length === 6)).toBe(true);
    }
  });
  it('scores as a percentage of 50', () => {
    expect(scoreProm(ndi, Object.fromEntries(ndi.items.map(i => [i.key, 0]))).score).toBe(0);
    expect(scoreProm(ndi, Object.fromEntries(ndi.items.map(i => [i.key, 5]))).score).toBe(100);
    // 5 sections at 3, 5 at 2 = 25/50 = 50%
    const mixed = Object.fromEntries(ndi.items.map((i, idx) => [i.key, idx < 5 ? 3 : 2]));
    expect(scoreProm(ndi, mixed).score).toBe(50);
    expect(scoreProm(ndi, mixed).band).toBe('Severe disability');
  });
  it('bands ODI at minimal/severe', () => {
    expect(scoreProm(odi, Object.fromEntries(odi.items.map(i => [i.key, 0]))).band).toBe('Minimal disability');
    expect(scoreProm(odi, Object.fromEntries(odi.items.map(i => [i.key, 5]))).band).toBe('Bed-bound or severe');
  });
  it('rejects an invalid section choice', () => {
    expect(validateResponses(ndi, Object.fromEntries(ndi.items.map((i, idx) => [i.key, idx === 0 ? 7 : 0])))).toContain('invalid');
  });
});

describe('UEFI / RMDQ', () => {
  it('UEFI sums to 80 at full function', () => {
    const u = getProm('uefi');
    expect(scoreProm(u, Object.fromEntries(u.items.map(i => [i.key, 4]))).score).toBe(80);
  });
  it('RMDQ counts yes answers (0-24)', () => {
    const r = getProm('rmdq');
    expect(scoreProm(r, Object.fromEntries(r.items.map(i => [i.key, 1]))).score).toBe(24);
    expect(scoreProm(r, Object.fromEntries(r.items.map((i, ix) => [i.key, ix < 5 ? 1 : 0]))).band).toBe('Mild disability');
  });
});

describe('Örebro-SF (reverse items 3,4,8)', () => {
  const e = getProm('orebro');
  it('reverses the function/work items so higher total = higher risk', () => {
    const worst = { e1: 10, e2: 10, e3: 0, e4: 0, e5: 10, e6: 10, e7: 10, e8: 0, e9: 10, e10: 10 };
    expect(scoreProm(e, worst).score).toBe(100);
    const best = { e1: 1, e2: 0, e3: 10, e4: 10, e5: 0, e6: 0, e7: 0, e8: 10, e9: 0, e10: 0 };
    expect(scoreProm(e, best).score).toBe(1);
  });
  it('flags >50 as higher risk', () => {
    const ex = { e1: 5, e2: 6, e3: 3, e4: 4, e5: 5, e6: 4, e7: 7, e8: 8, e9: 6, e10: 5 };
    expect(scoreProm(e, ex).score).toBe(53);
    expect(scoreProm(e, ex).band).toContain('Higher risk');
  });
});
