import { describe, it, expect } from 'vitest';
import { pairFindings, parseSubjective, painComparison, comparisonToNarrativeInput, regradeComparison } from '../services/scribe-reassessment.js';

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

describe('regradeComparison (re-grade after editing baselines)', () => {
  const rows = (text) => text.split('\n').map(l => l.split('|').map(s => s.trim()));

  it('grades a norm test once a baseline is filled in', () => {
    const out = regradeComparison('30-sec Sit-to-Stand | 7 | 9 reps | New | no baseline yet', 68, 'female');
    const [, , , change, interp] = rows(out)[0];
    expect(change).toBe('Improved');
    expect(interp).toMatch(/up 2 reps/);
    expect(interp).toMatch(/Still below the expected range/);
  });

  it('grades a PROM (LEFS) by point change with its MCID', () => {
    const out = regradeComparison('LEFS | 42 | 54 | New | no baseline yet', 68, 'female');
    const [, , , change, interp] = rows(out)[0];
    expect(change).toBe('Improved');
    expect(interp).toMatch(/up 12 points/);
  });

  it('treats "Could Not Complete" as a zero floor for a timed hold', () => {
    const out = regradeComparison('Single-Leg Stance (Right) | Could Not Complete | 9 sec | New | x', 68, 'female');
    const [, , , change, interp] = rows(out)[0];
    expect(change).toBe('Improved');
    expect(interp).toMatch(/up 9 sec/);
  });

  it('leaves an ungradeable row (no numbers) untouched', () => {
    const line = 'Mystery Test | tight | tight | — | qualitative';
    expect(regradeComparison(line, 68, 'female')).toBe(line);
  });

  it('uses clinician phrasing for the GP audience', () => {
    const line = '30-sec Sit-to-Stand | 7 | 9 reps | New | x';
    const patient = regradeComparison(line, 66, 'female', 'patient');
    const gp = regradeComparison(line, 66, 'female', 'gp');
    expect(patient).toMatch(/expected range for your age and sex/);
    expect(gp).toMatch(/age\/sex reference range/);
    expect(gp).not.toMatch(/your age and sex/);
  });

  it('GP audience says "No significant change" instead of "Held steady"', () => {
    const line = 'Grip Strength (Right) | 29.2 kg | 30.8 kg | Steady | x';
    expect(regradeComparison(line, 66, 'female', 'gp')).toMatch(/No significant change/);
  });
});

describe('comparisonToNarrativeInput (rewrite-from-edited-results)', () => {
  it('turns edited table rows into graded narrative lines', () => {
    const edited = [
      'Grip Strength (Right) | 29 kg | 36 kg | Improved | Improved (up 7 kg).',
      'Single-Leg Stance (Right) | — | 9 sec | New | Below the expected range.',
    ].join('\n');
    const out = comparisonToNarrativeInput(edited);
    expect(out).toMatch(/Grip Strength \(Right\): 29 kg → 36 kg — Improved/);
    // No-baseline row is flagged so the model still won't claim a change on it.
    expect(out).toMatch(/no baseline — do NOT describe as improved or declined/);
  });
});
