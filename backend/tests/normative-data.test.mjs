import { describe, it, expect } from 'vitest';
import { matchTest, parseValue, classify, interpret, buildInterpretation } from '../services/normative-data.js';

describe('matchTest', () => {
  it('matches by alias', () => {
    expect(matchTest('TUG').key).toBe('timed_up_and_go');
    expect(matchTest('grip strength').key).toBe('grip_strength');
    expect(matchTest('5xSTS').key).toBe('five_times_sit_to_stand');
    expect(matchTest('6 minute walk test').key).toBe('six_minute_walk');
  });

  it('matches embedded names', () => {
    expect(matchTest('Resting blood pressure (seated)').key).toBe('blood_pressure');
    expect(matchTest('Fasting BGL').key).toBe('blood_glucose_fasting');
  });

  it('returns null for unknown tests', () => {
    expect(matchTest('star excursion balance')).toBeNull();
    expect(matchTest('')).toBeNull();
  });
});

describe('parseValue', () => {
  it('parses BP', () => {
    expect(parseValue('148/92', 'mmHg')).toEqual({ systolic: 148, diastolic: 92 });
  });
  it('parses single numeric values with units', () => {
    expect(parseValue('16 s', 'seconds').value).toBe(16);
    expect(parseValue('5.2 mmol/L', 'mmol_L').value).toBe(5.2);
    expect(parseValue('1.02 m/s', 'm_s').value).toBe(1.02);
  });
  it('parses bilateral and takes the weaker side as value', () => {
    const p = parseValue('L 12 / R 18', 'reps');
    expect(p.left).toBe(12);
    expect(p.right).toBe(18);
    expect(p.value).toBe(12);
  });
});

describe('classify — norm-referenced', () => {
  it('grip strength below age/sex p25 → below', () => {
    const r = interpret('grip strength', '22 kg', 62, 'male'); // 60-64 M p25=44.3
    expect(r.verdict).toBe('below');
    expect(r.flags.join(' ')).toMatch(/sarcopenia/); // <27 male cutoff
  });
  it('grip strength within range', () => {
    const r = interpret('grip strength', '48 kg', 62, 'male');
    expect(r.verdict).toBe('within');
    expect(r.flags.length).toBe(0);
  });
  it('30CST within IQR', () => {
    const r = interpret('30 second sit to stand', '15', 62, 'female'); // 12-17
    expect(r.verdict).toBe('within');
  });
});

describe('classify — lower-is-better', () => {
  it('5xSTS slower than mean → below (worse)', () => {
    const r = interpret('5x sit to stand', '16 s', 65, 'any'); // mean 11.4
    expect(r.verdict).toBe('below');
    expect(r.flags.join(' ')).toMatch(/recurrent falls/); // >15
  });
  it('TUG faster than mean → within', () => {
    const r = interpret('TUG', '8 s', 65, 'any'); // mean 9.2 for 70s, 8.1 for 60s
    expect(['within']).toContain(r.verdict);
  });
});

describe('classify — pass/fail (tandem stance)', () => {
  it('matches tandem stance variants by alias', () => {
    expect(matchTest('Tandem Stance Balance Right Foot Forward (shoes on)').key).toBe('tandem_stance');
    expect(matchTest('Full tandem stance').key).toBe('tandem_stance');
  });
  it('hold >= 10 s passes the threshold (no age/sex range)', () => {
    const r = interpret('tandem stance', '25 sec', 68, 'male');
    expect(r.passFail).toBe('pass');
    const txt = buildInterpretation(r);
    expect(txt).toMatch(/at least 10 seconds/);
    expect(txt).not.toMatch(/expected range for age\/sex/);
  });
  it('hold < 10 s fails and is flagged as increased fall risk', () => {
    const r = interpret('tandem stance', '6 seconds', 72, 'female');
    expect(r.passFail).toBe('fail');
    const txt = buildInterpretation(r);
    expect(txt).toMatch(/increased fall risk/);
  });
});

describe('classify — screen (never diagnoses)', () => {
  it('BP grade 1 is flagged with screen caveat', () => {
    const r = interpret('blood pressure', '148/92', 55, 'male');
    expect(r.verdict).toBe('flagged');
    expect(r.label).toMatch(/grade 1/);
    expect(r.caveats).toContain('screen_not_diagnose');
  });
  it('fasting glucose in diabetes range is flagged, not diagnosed', () => {
    const r = interpret('fasting glucose', '7.4 mmol/L', 60, 'female');
    expect(r.verdict).toBe('flagged');
    expect(r.caveats).toContain('screen_not_diagnose');
  });
});

describe('classify — qualitative & fallback', () => {
  it('lat length is qualitative (no norm verdict)', () => {
    const r = interpret('lat length', 'tight', 50, 'male');
    expect(r.verdict).toBe('na');
    expect(r.caveats).toContain('symmetry_not_norm');
  });
  it('falls back gracefully when age/sex missing', () => {
    const r = interpret('grip strength', '30 kg', null, null);
    expect(r).not.toBeNull();
    expect(['na', 'below', 'within', 'above', 'flagged']).toContain(r.verdict);
  });
  it('flags bilateral asymmetry on calf raise', () => {
    const r = interpret('calf raise', 'L 12 / R 20', 40, 'male');
    expect(r.flags.join(' ')).toMatch(/asymmetry/);
  });
});

describe('buildInterpretation', () => {
  it('produces grounded text for a flagged screen with referral language', () => {
    const txt = buildInterpretation(interpret('blood pressure', '148/92', 55, 'male'));
    expect(txt).toMatch(/grade 1/i);
    expect(txt).toMatch(/GP review/);
  });
  it('produces grounded text with reference range for grip', () => {
    const txt = buildInterpretation(interpret('grip strength', '22 kg', 62, 'male'));
    expect(txt).toMatch(/Below the expected range/);
    expect(txt).toMatch(/sarcopenia/);
    expect(txt).not.toMatch(/Tromso|Svinoy/); // citation omitted by default (patient-facing)
  });
  it('includes the citation when asked (audit/clinician view)', () => {
    const txt = buildInterpretation(interpret('grip strength', '22 kg', 62, 'male'), { includeSource: true });
    expect(txt).toMatch(/Tromso|Svinoy|EWGSOP2/);
  });
  it('qualitative test → symmetry guidance', () => {
    const txt = buildInterpretation(interpret('lat length', 'tight', 50, 'male'));
    expect(txt).toMatch(/other side|baseline/);
  });
});
