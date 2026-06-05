import { describe, it, expect } from 'vitest';
import { pairFindings, parseSubjective, painComparison } from '../services/scribe-reassessment.js';

describe('pairFindings', () => {
  it('grounds matched tests and lists current-only as new findings', () => {
    const prev = 'Grip Strength (Right) | 22 kg | Below the expected range.';
    const curr = [
      'Grip Strength (Right) | 48 kg | Within range.',
      'Single-Leg Stance (Right) | 9 sec | below',
    ].join('\n');
    const out = pairFindings(prev, curr, 62, 'male');
    expect(out.matched).toHaveLength(1);
    expect(out.matched[0].change).toBe('Improved');
    expect(out.newFindings.map(r => r.test)).toContain('Single-Leg Stance (Right)');
  });

  it('states ungrounded new findings neutrally — never "improved" with no baseline', () => {
    const out = pairFindings('', 'UEFI | 54/80 | Self-reported upper extremity function is improved.', 62, 'male');
    const uefi = out.newFindings.find(r => r.test === 'UEFI');
    expect(uefi.interpretation).not.toMatch(/improved/i);
    expect(uefi.interpretation).toMatch(/no baseline value yet/i);
  });

  it('compares pass/fail tandem stance by status, not a meaningless numeric delta', () => {
    const prev = 'Tandem Stance (heel-to-toe) | right foot forward: 30 seconds | held';
    const curr = 'Tandem Stance (heel-to-toe) | Standard: 28 sec | held';
    const out = pairFindings(prev, curr, 68, 'female');
    expect(out.matched[0].interpretation).toMatch(/threshold at both visits/i);
    expect(out.matched[0].interpretation).not.toMatch(/Held steady/);
  });
});

describe('parseSubjective + painComparison', () => {
  const raw = [
    'GOALS',
    '- Return to tennis | progressing | grip improving',
    'PAIN',
    '- Lower back | 6 | 4 | eased',
    '- Knee | 5 | 5 | unchanged',
    '- Shoulder | ns | 3 | new mention',
    'ISSUES',
    '- Stairs | improved',
  ].join('\n');

  it('parses the three sections', () => {
    const s = parseSubjective(raw);
    expect(s.goals).toHaveLength(1);
    expect(s.goals[0].status).toBe('progressing');
    expect(s.pain).toHaveLength(3);
    expect(s.issues[0].issue).toBe('Stairs');
  });

  it('grades numeric pain (lower-better) with a 2-point deadband; drops score-less pain', () => {
    const { rows } = painComparison(parseSubjective(raw).pain);
    const back = rows.find(r => r.test.includes('Lower back'));
    const knee = rows.find(r => r.test.includes('Knee'));
    const shoulder = rows.find(r => r.test.includes('Shoulder'));
    expect(back.change).toBe('Improved');   // 6 → 4 = down 2
    expect(knee.change).toBe('Steady');     // 5 → 5
    expect(shoulder).toBeUndefined();       // ns → 3: no two-point comparison, not a row
  });
});
