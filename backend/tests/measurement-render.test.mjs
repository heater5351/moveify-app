import { describe, it, expect } from 'vitest';

// Phase 3 — structured in-session measurements. These lock the deterministic
// rendering: exact values + grounded verdicts, side-to-side asymmetry, graceful
// degradation without demographics, and the catalog↔normative-data alignment that
// makes grading work at all. The Bedrock call is exercised on staging.
const { renderMeasurements, renderMeasurementsForHandout } = await import('../services/measurement-render.js');
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
    const rows = [{ assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'left', value: '30', value2: null, unit: 'kg' }];
    const lines = renderMeasurements(rows, null, null);
    expect(lines[0]).toContain('30 kg');
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

  it('groups a ROM-table joint into one line with movements + L/R + asymmetry', () => {
    const rows = [
      { assessment_key: 'hip_rom', measure_key: 'hip_flexion_rom', side: 'left', value: '110', unit: 'degrees' },
      { assessment_key: 'hip_rom', measure_key: 'hip_flexion_rom', side: 'right', value: '115', unit: 'degrees' },
      { assessment_key: 'hip_rom', measure_key: 'hip_internal_rotation_rom', side: 'left', value: '30', unit: 'degrees' },
      { assessment_key: 'hip_rom', measure_key: 'hip_internal_rotation_rom', side: 'right', value: '40', unit: 'degrees' },
    ];
    const lines = renderMeasurements(rows, 68, 'male');
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe('Hip ROM — Flexion L110/R115°; Internal Rotation L30/R40° (25% lower on left)');
  });

  it('renders a single-laterality ROM movement without L/R', () => {
    const rows = [{ assessment_key: 'spine_rom', measure_key: 'lumbar_flexion_rom', side: 'bilateral', value: '60', unit: 'degrees' }];
    expect(renderMeasurements(rows, 68, 'male')[0]).toBe('Spine ROM — Flexion 60°');
  });
});

describe('renderMeasurementsForHandout', () => {
  // Every handout row must be a 3-column "Test | Result | Interpretation" pipe row —
  // the contract the handout table + docx parseOaRows depend on.
  const isThreeCol = (line) => line.split('|').length === 3;

  it('returns [] for no rows', () => {
    expect(renderMeasurementsForHandout([], 68, 'male')).toEqual([]);
    expect(renderMeasurementsForHandout(null, 68, 'male')).toEqual([]);
  });

  it('splits a graded bilateral test into one grounded row per side, asymmetry on weaker', () => {
    const rows = [
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'left', value: '22', unit: 'kg' },
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'right', value: '30', unit: 'kg' },
    ];
    const lines = renderMeasurementsForHandout(rows, 68, 'male');
    expect(lines.every(isThreeCol)).toBe(true);
    expect(lines[0]).toContain('Grip Strength (Right) | 30 kg |');
    expect(lines[0]).toContain('Below the expected range');
    expect(lines[1]).toContain('Grip Strength (Left) | 22 kg |');
    expect(lines[1]).toContain('27% weaker than the right side');
  });

  it('degrades a bilateral test to one combined baseline row when age/sex unknown', () => {
    const rows = [
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'left', value: '22', unit: 'kg' },
      { assessment_key: 'grip_strength', measure_key: 'grip_strength', side: 'right', value: '30', unit: 'kg' },
    ];
    const lines = renderMeasurementsForHandout(rows, null, null);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Grip Strength | L 22 / R 30 kg |');
    expect(lines[0]).not.toContain('expected range');
    expect(lines[0]).toContain('baseline');
  });

  it('renders a single-sided assessment with no side tag', () => {
    const rows = [{ assessment_key: 'thirty_second_sit_to_stand', measure_key: 'thirty_second_sit_to_stand', side: 'bilateral', value: '9', unit: 'reps' }];
    const lines = renderMeasurementsForHandout(rows, 68, 'male');
    expect(lines[0]).toContain('30-Second Sit-to-Stand | 9 reps |');
    expect(lines[0]).not.toContain('(Left)');
  });

  it('renders a compound (blood pressure) row with grounded screen verdict', () => {
    const rows = [{ assessment_key: 'blood_pressure', measure_key: 'blood_pressure', side: 'bilateral', value: '145', value2: '92', unit: 'mmHg' }];
    const lines = renderMeasurementsForHandout(rows, 60, 'male');
    expect(isThreeCol(lines[0])).toBe(true);
    expect(lines[0]).toContain('Blood Pressure | 145/92 mmHg |');
    expect(lines[0].toLowerCase()).toContain('elevated');
  });

  it('renders an instrument total as score/max', () => {
    const rows = [{ assessment_key: 'berg_balance', measure_key: 'berg_balance', side: 'bilateral', value: '48', unit: 'points' }];
    expect(renderMeasurementsForHandout(rows, 78, 'female')[0]).toContain('Berg Balance Scale | 48/56 |');
  });

  it('omits toggle (pass/fail) special tests — objective table is numeric/graded only', () => {
    const rows = [
      { assessment_key: 'latissimus_dorsi_length', measure_key: 'latissimus_dorsi_length', side: 'left', value: '1', value2: null, unit: 'none' },
      { assessment_key: 'serratus_anterior_assessment', measure_key: 'serratus_anterior_assessment', side: 'right', value: '1', value2: null, unit: 'none' },
    ];
    expect(renderMeasurementsForHandout(rows, 60, 'male')).toEqual([]);
  });

  it('renders ROM table movements as combined L/R rows with a baseline + asymmetry note', () => {
    const rows = [
      { assessment_key: 'hip_rom', measure_key: 'hip_flexion_rom', side: 'left', value: '110', unit: 'degrees' },
      { assessment_key: 'hip_rom', measure_key: 'hip_flexion_rom', side: 'right', value: '115', unit: 'degrees' },
      { assessment_key: 'hip_rom', measure_key: 'hip_internal_rotation_rom', side: 'left', value: '30', unit: 'degrees' },
      { assessment_key: 'hip_rom', measure_key: 'hip_internal_rotation_rom', side: 'right', value: '40', unit: 'degrees' },
    ];
    const lines = renderMeasurementsForHandout(rows, 68, 'male');
    expect(lines.every(isThreeCol)).toBe(true);
    expect(lines[0]).toContain('Hip Flexion | L 110 / R 115° |');
    expect(lines[1]).toContain('Hip Internal Rotation | L 30 / R 40° |');
    expect(lines[1]).toContain('25% less on the left side');
  });

  it('renders a single-laterality ROM movement without L/R', () => {
    const rows = [{ assessment_key: 'spine_rom', measure_key: 'lumbar_flexion_rom', side: 'bilateral', value: '60', unit: 'degrees' }];
    expect(renderMeasurementsForHandout(rows, 68, 'male')[0]).toContain('Spine Flexion | 60° |');
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
