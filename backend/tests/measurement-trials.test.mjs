import { describe, it, expect } from 'vitest';

const { aggregateTrials } = await import('../services/measurement-trials.js');

describe('measurement-trials — aggregateTrials', () => {
  it('averages trials (mean) rounded to 0.1', () => {
    expect(aggregateTrials([22, 24, 23], 'mean')).toBe(23);
    expect(aggregateTrials([22.5, 23], 'mean')).toBe(22.8);   // 22.75 → 22.8
    expect(aggregateTrials([20, 21, 23], 'mean')).toBe(21.3); // 21.333 → 21.3
  });

  it('takes the best (max) for peak-performance tests', () => {
    expect(aggregateTrials([101, 108, 104], 'max')).toBe(108);
    expect(aggregateTrials([60, 62, 61], 'max')).toBe(62);
  });

  it('defaults to mean when no method is given', () => {
    expect(aggregateTrials([10, 20])).toBe(15);
  });

  it('handles a single trial', () => {
    expect(aggregateTrials([42.5], 'mean')).toBe(42.5);
    expect(aggregateTrials([42.5], 'max')).toBe(42.5);
  });

  it('ignores non-finite values and returns null for none', () => {
    expect(aggregateTrials([22, NaN, 24], 'mean')).toBe(23);
    expect(aggregateTrials([], 'mean')).toBeNull();
    expect(aggregateTrials(null, 'mean')).toBeNull();
    expect(aggregateTrials(['x', 'y'], 'mean')).toBeNull();
  });
});
