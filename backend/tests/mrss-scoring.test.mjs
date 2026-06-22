import { describe, it, expect } from 'vitest';

const { computeMrss, lsiPoints, loadProtocol } = await import('../services/mrss-scoring.js');

// Build a measurement row the way scribe_session_measurements stores them.
function row(assessment_key, measure_key, side, value) {
  return { assessment_key, measure_key, side, value };
}

// A near-perfect ACL return-to-sport candidate (involved = LEFT, dominant leg).
function strongRows() {
  return [
    // Part A — clinical exam (single-laterality → side 'bilateral')
    row('acl_knee_exam', 'acl_effusion_stroke', 'bilateral', 0), // Absent → 5
    row('acl_knee_exam', 'acl_lachman', 'bilateral', 0),         // Nil → 5
    row('acl_knee_exam', 'acl_pivot_shift', 'bilateral', 0),     // Nil → 5
    row('acl_knee_exam', 'acl_extension_deficit_pronehang', 'bilateral', 1), // 1 cm → 5
    // Flexion deficit from knee ROM (involved left vs right)
    row('knee_rom', 'knee_flexion_rom', 'left', 140),
    row('knee_rom', 'knee_flexion_rom', 'right', 142), // deficit 2° → 5
    // Part C — functional
    row('sebt', 'sebt_anterior', 'left', 60), row('sebt', 'sebt_posteromedial', 'left', 110), row('sebt', 'sebt_posterolateral', 'left', 105),
    row('sebt', 'sebt_anterior', 'right', 62), row('sebt', 'sebt_posteromedial', 'right', 112), row('sebt', 'sebt_posterolateral', 'right', 107),
    row('acl_single_hop', 'acl_single_hop', 'left', 163), row('acl_single_hop', 'acl_single_hop', 'right', 165),
    row('acl_triple_crossover_hop', 'acl_triple_crossover_hop', 'left', 480), row('acl_triple_crossover_hop', 'acl_triple_crossover_hop', 'right', 490),
    row('less_landing', 'less_landing', 'bilateral', 25),
    row('acl_single_leg_squat_fatigue', 'acl_single_leg_squat_fatigue', 'left', 18),
    row('acl_single_leg_squat_fatigue', 'acl_single_leg_squat_fatigue', 'right', 18),
  ];
}

describe('mrss-scoring — LSI → points table', () => {
  it('scores perfect symmetry at the top of each band', () => {
    expect(lsiPoints(100, true, 'ten')).toBe(10);
    expect(lsiPoints(100, true, 'five')).toBe(5);
  });
  it('penalises over-performance on the involved side (LSI well above 100)', () => {
    expect(lsiPoints(145, true, 'ten')).toBe(0);
    expect(lsiPoints(108, true, 'five')).toBe(4); // 105–110 band
  });
  it('uses the non-dominant column when the involved leg is non-dominant', () => {
    expect(lsiPoints(96, false, 'ten')).toBe(10);  // 95–103 → 10 (non-dominant)
    expect(lsiPoints(96, true, 'ten')).toBe(8);    // 90–96 → 8 (dominant)
  });
  it('returns 0 below the lowest band', () => {
    expect(lsiPoints(50, true, 'five')).toBe(0);
    expect(lsiPoints(54, false, 'five')).toBe(0);
  });
});

describe('mrss-scoring — composite /100', () => {
  it('scores a strong candidate near the top and passes', () => {
    const res = computeMrss({ rows: strongRows(), ikdcScore: 96, involvedSide: 'left', involvedIsDominant: true });
    expect(res.partA.points).toBe(25);
    expect(res.partB.points).toBe(24); // 96 × 0.25
    expect(res.partC.points).toBe(50);
    expect(res.total).toBe(99);
    expect(res.scorePass).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.missing).toEqual([]);
  });

  it('grades clinical exam deficits to the right Part A points', () => {
    const rows = [
      row('acl_knee_exam', 'acl_effusion_stroke', 'bilateral', 1), // Present → 0
      row('acl_knee_exam', 'acl_lachman', 'bilateral', 1),         // Mild → 3
      row('acl_knee_exam', 'acl_pivot_shift', 'bilateral', 2),     // Grade II → 1
      row('acl_knee_exam', 'acl_extension_deficit_pronehang', 'bilateral', 4), // 2–5 cm → 3
      row('knee_rom', 'knee_flexion_rom', 'left', 120),
      row('knee_rom', 'knee_flexion_rom', 'right', 145), // deficit 25° → 0
    ];
    const res = computeMrss({ rows, ikdcScore: null, involvedSide: 'left', involvedIsDominant: false });
    const pts = Object.fromEntries(res.partA.components.map(c => [c.key, c.points]));
    expect(pts).toEqual({ effusion: 0, lachman: 3, pivot: 1, flexion: 0, extension: 3 });
    expect(res.partA.points).toBe(7);
  });

  it('flags missing components and IKDC, and does not pass', () => {
    const rows = [row('acl_single_hop', 'acl_single_hop', 'left', 150), row('acl_single_hop', 'acl_single_hop', 'right', 160)];
    const res = computeMrss({ rows, ikdcScore: null, involvedSide: 'left', involvedIsDominant: true });
    expect(res.complete).toBe(false);
    expect(res.missing).toContain('IKDC Subjective (PROM)');
    expect(res.missing).toContain('Effusion (stroke test)');
    expect(res.scorePass).toBe(false);
    // The one captured test (LSI 93.75 → dominant 90–110 → 4) still scores.
    const hop = res.partC.components.find(c => c.key === 'singleHop');
    expect(hop.lsi).toBe(93.8);
    expect(hop.points).toBe(4);
  });

  it('handles a zero/absent uninvolved value without dividing by zero', () => {
    const rows = [
      row('acl_single_hop', 'acl_single_hop', 'left', 150),
      row('acl_single_hop', 'acl_single_hop', 'right', 0),
    ];
    const res = computeMrss({ rows, ikdcScore: 80, involvedSide: 'left', involvedIsDominant: true });
    const hop = res.partC.components.find(c => c.key === 'singleHop');
    expect(hop.points).toBe(0);
    expect(res.missing.some(m => m.startsWith('Single hop'))).toBe(true);
  });

  it('rejects an invalid involved side', () => {
    expect(() => computeMrss({ rows: [], ikdcScore: null, involvedSide: 'both', involvedIsDominant: true }))
      .toThrow();
  });

  it('exposes the protocol config (pass threshold 95)', () => {
    expect(loadProtocol().passThreshold).toBe(95);
  });
});
