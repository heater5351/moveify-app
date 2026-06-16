import { describe, it, expect } from 'vitest';

// Phase 3 — structured in-session measurements. These lock the deterministic
// rendering: exact values + grounded verdicts, side-to-side asymmetry, graceful
// degradation without demographics, and the catalog↔normative-data alignment that
// makes grading work at all. The Bedrock call is exercised on staging.
const { renderMeasurements } = await import('../services/measurement-render.js');
const { unalignedMeasureKeys, loadCatalog } = await import('../services/assessment-catalog.js');
const { buildSoapUserMessage } = await import('../services/scribe-llm.js');

describe('assessment catalog alignment', () => {
  it('every measure key maps to a normative-data test', () => {
    expect(unalignedMeasureKeys()).toEqual([]);
  });

  it('bilateral assessments declare their measures', () => {
    const hip = loadCatalog().assessments.find(a => a.key === 'hip_rom');
    expect(hip.laterality).toBe('bilateral');
    expect(hip.measures.map(m => m.key)).toContain('hip_flexion_rom');
  });
});

describe('renderMeasurements', () => {
  it('returns [] for no rows', () => {
    expect(renderMeasurements([], 68, 'male')).toEqual([]);
    expect(renderMeasurements(null, 68, 'male')).toEqual([]);
  });

  it('renders exact value + grounded verdict per side', () => {
    const rows = [
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'left', value: '22', unit: 'kg' },
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'right', value: '30', unit: 'kg' },
    ];
    const lines = renderMeasurements(rows, 68, 'male');
    expect(lines[0]).toContain('(Left): 22 kg');
    expect(lines[0]).toContain('Below the expected range');
    expect(lines[1]).toContain('(Right): 30 kg');
  });

  it('flags side-to-side asymmetry >=10% with the weaker side', () => {
    const rows = [
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'left', value: '22', unit: 'kg' },
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'right', value: '30', unit: 'kg' },
    ];
    const asym = renderMeasurements(rows, 68, 'male').find(l => l.includes('side-to-side'));
    expect(asym).toContain('27%');
    expect(asym).toContain('lower on the left side');
  });

  it('does not flag asymmetry under 10%', () => {
    const rows = [
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'left', value: '29', unit: 'kg' },
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'right', value: '30', unit: 'kg' },
    ];
    expect(renderMeasurements(rows, 68, 'male').some(l => l.includes('side-to-side'))).toBe(false);
  });

  it('degrades to value-only when age/sex unknown (no fabricated norm)', () => {
    const rows = [{ assessment_key: 'hip_rom', measure_key: 'hip_flexion_rom', side: 'left', value: '95', unit: 'degrees' }];
    const lines = renderMeasurements(rows, null, null);
    expect(lines[0]).toContain('95°');
    expect(lines[0]).not.toContain('expected range');
  });

  it('renders a single-sided assessment without a side tag', () => {
    const rows = [{ assessment_key: 'thirty_second_sit_to_stand', measure_key: 'thirty_second_sit_to_stand', side: 'bilateral', value: '9', unit: 'reps' }];
    const lines = renderMeasurements(rows, 68, 'male');
    expect(lines[0]).toContain('9 reps');
    expect(lines[0]).not.toContain('(Left)');
    expect(lines[0]).not.toContain('(Right)');
  });

  it('renders a compound (blood pressure) value with grounded verdict', () => {
    const rows = [{ assessment_key: 'blood_pressure', measure_key: 'blood_pressure', side: 'bilateral', value: '145', value2: '92', unit: 'mmHg' }];
    const lines = renderMeasurements(rows, 60, 'male');
    expect(lines[0]).toContain('145/92 mmHg');
    expect(lines[0].toLowerCase()).toContain('elevated');
  });

  it('renders a toggle (pass/fail) measure as its label, with side', () => {
    const rows = [{ assessment_key: 'latissimus_dorsi_length', measure_key: 'latissimus_dorsi_length', side: 'left', value: '1', value2: null, unit: 'none' }];
    const lines = renderMeasurements(rows, 60, 'male');
    expect(lines[0]).toContain('(Left)');
    expect(lines[0]).toContain('Positive');
    // No fabricated numeric verdict for a pass/fail observation.
    expect(lines[0]).not.toContain('range');
  });

  it('does not flag asymmetry for non-numeric (toggle) bilateral results', () => {
    const rows = [
      { assessment_key: 'latissimus_dorsi_length', measure_key: 'latissimus_dorsi_length', side: 'left', value: '1', value2: null, unit: 'none' },
      { assessment_key: 'latissimus_dorsi_length', measure_key: 'latissimus_dorsi_length', side: 'right', value: '0', value2: null, unit: 'none' },
    ];
    expect(renderMeasurements(rows, 60, 'male').some(l => l.includes('side-to-side'))).toBe(false);
  });
});

describe('buildSoapUserMessage — measurements block', () => {
  const TRANSCRIPT = 'Clinician: Range looks limited today.';

  it('includes a delimited, exact measurements block', () => {
    const msg = buildSoapUserMessage({
      transcript: TRANSCRIPT,
      measurements: ['Hip Flexion ROM (Left): 95° — Below the expected range.'],
    });
    expect(msg).toContain('=== OBJECTIVE MEASUREMENTS — EXACT ===');
    expect(msg).toContain('=== END OBJECTIVE MEASUREMENTS ===');
    expect(msg).toContain('- Hip Flexion ROM (Left): 95°');
    expect(msg).toContain('never invent normative numbers');
    expect(msg.indexOf('END OBJECTIVE MEASUREMENTS')).toBeLessThan(msg.indexOf(TRANSCRIPT));
  });

  it('omits the block for an empty measurements array', () => {
    const msg = buildSoapUserMessage({ transcript: TRANSCRIPT, measurements: [] });
    expect(msg).not.toContain('OBJECTIVE MEASUREMENTS');
  });
});
