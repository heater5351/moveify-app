import { describe, it, expect } from 'vitest';
import { consolidateClinicalContext } from '../services/scribe-llm.js';

const rows = (s) => s.split('\n').map(l => l.split('|').map(x => x.trim()));

describe('consolidateClinicalContext — bilateral split', () => {
  it('splits a combined grip row into per-side rows with correct L/R', () => {
    const out = consolidateClinicalContext('Grip Strength | R 29.3 kg / L 23.0 kg | reduced', 73, 'female');
    const r = rows(out);
    expect(r.length).toBe(2);
    expect(r[0][0]).toBe('Grip Strength (Right)');
    expect(r[0][1]).toBe('29.3 kg');
    expect(r[1][0]).toBe('Grip Strength (Left)');
    expect(r[1][1]).toBe('23 kg');
  });

  it('attributes the asymmetry note to the weaker side only', () => {
    const out = consolidateClinicalContext('Grip Strength | R 29.3 kg / L 23.0 kg | reduced', 73, 'female');
    const r = rows(out);
    expect(r[0][2]).not.toMatch(/weaker/);          // right (stronger)
    expect(r[1][2]).toMatch(/22% weaker than the right side/); // left (weaker)
  });

  it('falls back to a neutral baseline (not the model claim) when sex is missing', () => {
    const out = consolidateClinicalContext('Grip Strength | R 29.3 kg / L 23.0 kg | reduced hand strength', 73, null);
    const r = rows(out);
    // Known norm test that can't be graded without sex → neutral baseline, never the
    // model's recalled qualitative claim ("reduced hand strength").
    expect(r[0][2]).toBe('Recorded as a baseline; we track your change at reassessment.');
    expect(r[0][2]).not.toMatch(/reduced/);
  });

  it('groups two per-side single-leg rows into split rows', () => {
    const raw = [
      'Single Leg Stance (Shoes Off) | R 17 sec | balance',
      'Single Leg Stance (Shoes Off) | L 9 sec | balance',
    ].join('\n');
    const out = consolidateClinicalContext(raw, 73, 'female');
    const r = rows(out);
    expect(r.length).toBe(2);
    expect(r.map(x => x[0])).toEqual(['Single-Leg Stance (Right)', 'Single-Leg Stance (Left)']);
    expect(r[1][2]).toMatch(/typical for healthy adults over 50/); // L 9s trips the <10s cutoff (non-alarming wording)
  });
});

describe('consolidateClinicalContext — pass/fail condensation', () => {
  const tandem = [
    'Tandem Stance (Shoes On, Right Foot Forward) | 25 sec | x',
    'Tandem Stance (Shoes On, Left Foot Forward) | 30 sec | x',
    'Tandem Stance (Shoes Off, Right Foot Forward) | 31 sec | x',
    'Tandem Stance (Eyes Closed) | 7 sec | x',
  ].join('\n');

  it('condenses all tandem conditions into one row', () => {
    const out = consolidateClinicalContext(tandem, 73, 'female');
    const r = rows(out);
    expect(r.length).toBe(1);
    expect(r[0][0]).toBe('Tandem Stance (heel-to-toe)');
    expect(r[0][1]).toMatch(/Eyes Closed: 7 sec/);
  });

  it('joins conditions with the " // " line-break sentinel for in-cell stacking', () => {
    const out = consolidateClinicalContext(tandem, 73, 'female');
    const r = rows(out);
    // four conditions → three separators
    expect((r[0][1].match(/ \/\/ /g) || []).length).toBe(3);
    expect(r[0][1]).not.toMatch(/;/); // no cramped semicolon list in the result cell
  });

  it('names the failed condition and flags fall risk', () => {
    const out = consolidateClinicalContext(tandem, 73, 'female');
    expect(out).toMatch(/Eyes Closed held under 10 seconds/);
    expect(out).toMatch(/increased fall risk/);
  });

  it('gives a reassuring single line when every condition passes', () => {
    const raw = [
      'Tandem Stance (Shoes On) | 25 sec | x',
      'Tandem Stance (Shoes Off) | 31 sec | x',
    ].join('\n');
    const out = consolidateClinicalContext(raw, 73, 'female');
    expect(rows(out).length).toBe(1);
    expect(out).toMatch(/every tested condition/);
    expect(out).not.toMatch(/increased fall risk/);
  });
});

describe('consolidateClinicalContext — single-measure rows unchanged', () => {
  it('keeps a non-sided test as one grounded row', () => {
    const out = consolidateClinicalContext('30 Second Sit to Stand | 9 reps | x', 73, 'female');
    expect(rows(out).length).toBe(1);
    expect(out).toMatch(/Below the expected range/);
  });
});
