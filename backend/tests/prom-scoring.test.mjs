import { describe, it, expect } from 'vitest';

// Deterministic PROM scoring (Phase 4). Worked examples from the published scoring
// rules. The score is computed server-side and must never drift.
const { scoreProm, validateResponses, summarizeOutcome } = await import('../services/prom-scoring.js');
const { getProm, loadProms } = await import('../services/prom-catalog.js');

const nprs = getProm('nprs');
const psfs = getProm('psfs');

describe('PROM catalog', () => {
  it('seeds only license-noted instruments', () => {
    expect(loadProms().proms.every(p => typeof p.license === 'string')).toBe(true);
  });
});

describe('NPRS (single)', () => {
  it('scores the single item and bands it', () => {
    expect(scoreProm(nprs, { pain: 6 })).toEqual({ score: 6, band: 'Moderate pain', max: 10 });
    expect(scoreProm(nprs, { pain: 0 }).band).toBe('No pain');
    expect(scoreProm(nprs, { pain: 9 }).band).toBe('Severe pain');
  });
  it('rejects out-of-range', () => {
    expect(validateResponses(nprs, { pain: 11 })).toContain('out of range');
  });
  it('summarises for the note', () => {
    expect(summarizeOutcome(nprs, 6, 'Moderate pain')).toBe('Pain (NPRS): 6/10 (Moderate pain)');
  });
});

describe('PSFS (average of clinician-entered activities)', () => {
  it('averages the activity ratings to one decimal', () => {
    const r = scoreProm(psfs, { activities: [{ name: 'Walking', score: 4 }, { name: 'Stairs', score: 7 }, { name: 'Lifting', score: 3 }] });
    expect(r.score).toBe(4.7);
    expect(r.band).toBe('Moderate limitation');
    expect(r.max).toBe(10);
  });
  it('higher score = better function (band shifts up)', () => {
    expect(scoreProm(psfs, { activities: [{ name: 'x', score: 9 }, { name: 'y', score: 10 }] }).band).toBe('Minimal or no limitation');
  });
  it('requires at least one named activity with a valid score', () => {
    expect(validateResponses(psfs, { activities: [] })).toContain('at least one');
    expect(validateResponses(psfs, { activities: [{ name: '', score: 5 }] })).toContain('name');
    expect(validateResponses(psfs, { activities: [{ name: 'Walk', score: 99 }] })).toContain('out of range');
    expect(validateResponses(psfs, { activities: [{ name: 'Walk', score: 5 }] })).toBe(null);
  });
});
