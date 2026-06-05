import { describe, it, expect } from 'vitest';
import { matchTest, parseValue, classify, interpret, buildInterpretation, compareValues, buildComparisonInterpretation } from '../services/normative-data.js';

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
  it('elevated BP is flagged with comparative (non-diagnostic) label + screen caveat', () => {
    const r = interpret('blood pressure', '148/92', 55, 'male');
    expect(r.verdict).toBe('flagged');
    expect(r.label).toMatch(/elevated/i);
    expect(r.label).not.toMatch(/hypertension/i); // comparative, never a diagnosis
    expect(r.caveats).toContain('screen_not_diagnose');
  });
  it('high fasting glucose is flagged comparatively, not diagnosed', () => {
    const r = interpret('fasting glucose', '7.4 mmol/L', 60, 'female');
    expect(r.verdict).toBe('flagged');
    expect(r.label).toMatch(/above the normal range/i);
    expect(r.label).not.toMatch(/diabetes/i);
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
  it('produces grounded text for a flagged screen without recommending referral', () => {
    const txt = buildInterpretation(interpret('blood pressure', '148/92', 55, 'male'));
    expect(txt).toMatch(/elevated/i);
    expect(txt).toMatch(/below 120\/80/); // states the comparison, not a diagnosis
    expect(txt).toMatch(/Screening measure only/);
    expect(txt).not.toMatch(/GP|refer|hypertension/i); // referral + diagnosis are the clinician's call
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

describe('compareValues — direction', () => {
  it('higher-is-better gain → improved, crossing below → within', () => {
    const r = compareValues('grip strength', '22 kg', '48 kg', 62, 'male');
    expect(r.direction).toBe('improved');
    expect(r.absChange).toBe(26);
    expect(r.prevVerdict).toBe('below');
    expect(r.currVerdict).toBe('within');
    expect(r.crossedThreshold).toBe(true);
  });
  it('lower-is-better drop → improved (timed test)', () => {
    const r = compareValues('5x sit to stand', '16 s', '11 s', 65, 'any');
    expect(r.direction).toBe('improved');
    expect(r.absChange).toBe(-5);
  });
  it('higher-is-better but slower TUG → declined', () => {
    const r = compareValues('TUG', '8 s', '12 s', 65, 'any');
    expect(r.direction).toBe('declined');
  });
  it('sub-deadband change → maintained', () => {
    const r = compareValues('grip strength', '45 kg', '46 kg', 62, 'male');
    expect(r.direction).toBe('maintained');
  });
  it('target-range BP improving by verdict transition → improved', () => {
    const r = compareValues('blood pressure', '148/92', '118/78', 55, 'male');
    expect(r.direction).toBe('improved');
    expect(r.prevVerdict).toBe('flagged');
    expect(r.currVerdict).toBe('within');
  });
  it('bilateral calf raise compares the weaker side', () => {
    const r = compareValues('calf raise', 'L 8 / R 10', 'L 14 / R 15', 40, 'male');
    expect(r.prev.value).toBe(8);
    expect(r.curr.value).toBe(14);
    expect(r.direction).toBe('improved');
  });
  it('returns null for a test outside the dataset', () => {
    expect(compareValues('star excursion balance', '5', '7', 40, 'male')).toBeNull();
  });
});

describe('buildComparisonInterpretation', () => {
  it('states magnitude + verdict transition for a banded gain', () => {
    const txt = buildComparisonInterpretation(compareValues('grip strength', '22 kg', '48 kg', 62, 'male'));
    expect(txt).toMatch(/Improved \(up 26 kg/);
    expect(txt).toMatch(/within the expected range for your age and sex/);
  });
  it('shows the full BP reading + label transition, never "age and sex"', () => {
    const txt = buildComparisonInterpretation(compareValues('blood pressure', '148/92', '118/78', 55, 'male'));
    expect(txt).toMatch(/Improved \(118\/78/); // full reading, not a systolic-only magnitude
    expect(txt).toMatch(/within the normal range/);
    expect(txt).not.toMatch(/age and sex/);
  });
  it('reads "Held steady" when maintained', () => {
    const txt = buildComparisonInterpretation(compareValues('grip strength', '45 kg', '46 kg', 62, 'male'));
    expect(txt).toMatch(/Held steady/);
  });
});

// Regression cases from the first real reassessment trial (2026-06-05).
describe('compareValues — trial-bug fixes', () => {
  it('noise-level grip change is NOT called an improvement or a band crossing', () => {
    // 29.2 → 30.8 kg = +1.6 kg, under the 3 kg grip deadband; previously over-claimed
    // "Improved … now above the expected range, from within before".
    const r = compareValues('Grip Strength (Right)', '29.2 kg', '30.8 kg', 68, 'female');
    expect(r.direction).toBe('maintained');
    const txt = buildComparisonInterpretation(r);
    expect(txt).toMatch(/Held steady/);
    expect(txt).not.toMatch(/above the expected range/);
  });
  it('BP improving WITHIN the flagged zone reads as improved with the numbers shown', () => {
    // 140/80 → 132/75: both still elevated, but clearly closer to normal.
    const r = compareValues('Blood Pressure', '140/80', '132/75', 68, 'female');
    expect(r.direction).toBe('improved');
    const txt = buildComparisonInterpretation(r);
    expect(txt).toMatch(/132\/75/);
    expect(txt).not.toMatch(/good/i);
  });
  it('matches the "30-sec" sit-to-stand abbreviation', () => {
    expect(matchTest('30-sec Sit-to-Stand').key).toBe('thirty_second_sit_to_stand');
  });
  it('single-leg low-hold wording is non-alarming (no "mortality")', () => {
    const txt = buildInterpretation(interpret('single leg stance', '9 sec', 68, 'female'));
    expect(txt).not.toMatch(/mortality/i);
  });
});
