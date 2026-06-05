/**
 * Normative-data engine for the patient handout.
 *
 * Loads backend/data/normative-data.json (derived from docs/normative-data.md)
 * and classifies a measured assessment value against age/sex-stratified bands or
 * clinical cut-offs. The numeric verdict is computed HERE (deterministic); the
 * LLM only turns the verdict into a sentence. This is what makes the handout
 * interpretation predictable rather than recalled.
 *
 * Nothing in here logs patient values — callers pass age/sex/value in memory only.
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/normative-data.json');

let DATA = null;
function load() {
  if (!DATA) DATA = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  return DATA;
}

const UNIT_LABEL = { m_s: 'm/s', mmol_L: 'mmol/L', mmHg: 'mmHg', bpm: 'bpm' };
function unitLabel(u) { return UNIT_LABEL[u] || u; }

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeSex(sex) {
  const s = norm(sex);
  if (s.startsWith('m')) return 'male';
  if (s.startsWith('f') || s.startsWith('w')) return 'female';
  return null;
}

/**
 * Match a free-text test name to a dataset key via aliases. Tiered scoring:
 * exact match > patient text contains the canonical alias > alias contains the
 * (fragmentary) patient text. A negation guard stops "fasting" matching
 * "non-fasting" and vice versa.
 */
function matchTest(freeText) {
  const data = load();
  const hay = norm(freeText);
  if (!hay) return null;
  const hayNon = /\bnon\b/.test(hay);
  let best = null;
  for (const [key, def] of Object.entries(data.tests)) {
    const aliases = [def.displayName, ...(def.aliases || [])].map(norm).filter(Boolean);
    for (const a of aliases) {
      let score = 0;
      if (hay === a) score = 1000 + a.length;
      else if (hay.includes(a)) score = 500 + a.length;
      else if (a.includes(hay)) score = 100 + hay.length;
      if (score === 0) continue;
      // Negation mismatch (fasting vs non-fasting) → disqualify.
      if (/\bnon\b/.test(a) !== hayNon) score -= 400;
      if (score > 0 && (!best || score > best.score)) best = { key, def, score };
    }
  }
  return best ? { key: best.key, def: best.def } : null;
}

/**
 * Parse a measured value from free text given the expected unit.
 * Returns { value, left, right, systolic, diastolic } as available, or null.
 */
function parseValue(text, unit) {
  if (text == null) return null;
  const t = String(text).trim();

  if (unit === 'mmHg') {
    const m = t.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if (m) return { systolic: +m[1], diastolic: +m[2] };
    return null;
  }

  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);

  // Bilateral with explicit side labels: "L 12 / R 18", "R 29.3 / L 23".
  // Map each value to its OWN label so order doesn't matter — the model often
  // writes the right side first, so positional [0]=left/[1]=right is wrong.
  const lMatch = t.match(/\b(?:l|left)\b[^0-9]*?(\d+(?:\.\d+)?)/i);
  const rMatch = t.match(/\b(?:r|right)\b[^0-9]*?(\d+(?:\.\d+)?)/i);
  if (lMatch && rMatch) {
    const left = +lMatch[1], right = +rMatch[1];
    return { left, right, value: Math.min(left, right) };
  }
  // Two unlabelled numbers with a stray side word — fall back to positional order.
  if (/\b(l|left|r|right)\b/i.test(t) && nums.length >= 2) {
    return { left: nums[0], right: nums[1], value: Math.min(nums[0], nums[1]) };
  }
  if (nums.length >= 1) return { value: nums[0] };
  return null;
}

function pickBand(def, age, sex) {
  if (!def.bands || def.bands.length === 0) return null;
  const s = normalizeSex(sex);
  const inAge = (b) => age != null && age >= b.ageMin && age <= b.ageMax;
  // Prefer exact age+sex, then age+any, then sex-only, then any.
  return (
    def.bands.find(b => inAge(b) && b.sex === s) ||
    def.bands.find(b => inAge(b) && b.sex === 'any') ||
    def.bands.find(b => b.sex === s && age == null) ||
    def.bands.find(b => b.sex === 'any') ||
    null
  );
}

function cmp(op, v, target) {
  switch (op) {
    case '<': return v < target;
    case '<=': return v <= target;
    case '>': return v > target;
    case '>=': return v >= target;
    default: return false;
  }
}

/** Cut-offs that apply to this patient's sex (sex-less cut-offs apply to all). */
function applicableCutoffs(def, sex) {
  const s = normalizeSex(sex);
  return (def.cutoffs || []).filter(c => !c.sex || c.sex === s);
}

/**
 * Classify a measured value. Returns a structured, deterministic verdict the LLM
 * will phrase. verdict ∈ below|within|above|borderline|flagged|na.
 */
function classify(def, parsed, age, sex) {
  const caveats = (def.caveats || []).slice();
  const out = { verdict: 'na', label: null, normContext: null, flags: [], caveats, source: def.sourceShort, displayName: def.displayName, banded: !!(def.bands && def.bands.length) };

  if (!parsed) return out;

  // Blood pressure — categorise by systolic/diastolic.
  if (def.compound === 'systolic_diastolic') {
    const { systolic, diastolic } = parsed;
    if (systolic == null) return out;
    const cat = (def.categories || []).find(c => systolic <= c.systolicMax && diastolic <= c.diastolicMax)
      || def.categories[def.categories.length - 1];
    out.label = cat ? cat.label : null;
    out.verdict = cat && cat.flag ? 'flagged' : 'within';
    for (const c of (def.cutoffs || [])) {
      if (c.component === 'systolic' && systolic != null && cmp(c.op, systolic, c.value)) out.flags.push(c.meaning);
    }
    out.normContext = 'Typical resting reading is below 120/80 mmHg';
    return out;
  }

  const v = parsed.value;
  if (v == null) return out;

  // Pass/fail screen against a single hold-time threshold (e.g. tandem stance).
  // No graded norm exists, so we only state whether the threshold was met.
  if (def.type === 'pass_fail' && def.passThreshold != null) {
    const pass = def.direction === 'lower_better' ? v <= def.passThreshold : v >= def.passThreshold;
    out.passFail = pass ? 'pass' : 'fail';
    out.verdict = pass ? 'within' : 'flagged';
    out.label = pass ? (def.passMeaning || null) : (def.failMeaning || null);
    return out;
  }

  // Threshold/screen with category list (glucose).
  if (def.categories && Array.isArray(def.categories)) {
    const cat = def.categories.find(c => v <= c.max) || def.categories[def.categories.length - 1];
    out.label = cat ? cat.label : null;
    out.verdict = cat && cat.flag ? 'flagged' : 'within';
  }

  // Sex/value cut-offs (waist, grip EWGSOP2, fall-risk thresholds, etc.).
  // A cutoff with `supersededBy` is skipped when the higher band it points to has
  // also fired, so waist reports "well above" only, not "above" + "well above".
  for (const c of applicableCutoffs(def, sex)) {
    if (!cmp(c.op, v, c.value)) continue;
    if (c.supersededBy != null && cmp(c.op, v, c.supersededBy)) continue;
    out.flags.push(c.meaning);
  }

  // Band-based norm comparison.
  const band = pickBand(def, age, sex);
  if (band) {
    out.bandAge = [band.ageMin, band.ageMax];
    const higher = def.direction === 'higher_better';
    const target = def.direction === 'target_range';
    const u = unitLabel(def.unit);
    if (band.low != null && band.high != null) {
      if (target) {
        // Normal window in both directions; outside it is flagged.
        out.verdict = (v >= band.low && v <= band.high) ? 'within' : 'flagged';
      } else if (v < band.low) out.verdict = higher ? 'below' : 'within';
      else if (v > band.high) out.verdict = higher ? 'above' : 'below';
      else out.verdict = 'within';
      out.normContext = `${def.displayName} reference for this age/sex: ${band.low}–${band.high} ${u}`;
    } else if (band.mean != null) {
      const tol = band.sd != null ? band.sd : Math.max(band.mean * 0.1, 1);
      if (Math.abs(v - band.mean) <= tol) out.verdict = 'within';
      else if (v < band.mean) out.verdict = higher ? 'below' : 'within';
      else out.verdict = higher ? 'above' : 'below';
      out.normContext = `${def.displayName} reference mean for this age/sex: ${band.mean} ${u}`;
    }
  } else if (def.standardValue != null) {
    out.normContext = `${def.displayName} standard adult value: ${def.standardValue} ${def.unit} (not age/sex-adjusted)`;
    out.verdict = v >= def.standardValue ? 'within' : 'below';
  }

  // Bilateral asymmetry flag.
  if (parsed.left != null && parsed.right != null) {
    const hi = Math.max(parsed.left, parsed.right);
    const lo = Math.min(parsed.left, parsed.right);
    if (hi > 0 && (hi - lo) / hi >= 0.10) {
      out.flags.push(`side-to-side asymmetry ${Math.round((hi - lo) / hi * 100)}% (L ${parsed.left} / R ${parsed.right})`);
    }
  }

  // Qualitative tests carry no norm verdict — interpret by symmetry/baseline.
  if (def.type === 'qualitative' && out.verdict !== 'flagged') out.verdict = 'na';

  return out;
}

const CAVEAT_TEXT = {
  screen_not_diagnose: 'Screening measure only, not a diagnosis.',
  symmetry_not_norm: 'Compare with the other side and your own baseline.',
  course_length_bias: 'Distance depends on track length — track change on the same course.',
  wide_sd: 'Wide normal range — weight change over time.',
  method_dependent: 'Measurement-method dependent — interpret against your own change.',
};

/**
 * Assemble a concise, factual clinician-facing interpretation string from a
 * classify() result. Deterministic — this is the grounded text that replaces the
 * LLM's recalled interpretation in the assessment table.
 */
function buildInterpretation(res, { includeSource = false } = {}) {
  if (!res) return null;
  const parts = [];
  if (res.passFail) {
    // Pass/fail tests have no age/sex range — state the threshold outcome directly.
    if (res.label) parts.push(`${res.label[0].toUpperCase()}${res.label.slice(1)}.`);
  }
  else if (res.verdict === 'within' || res.verdict === 'below' || res.verdict === 'above') {
    // Banded tests compare to an age/sex norm; screens (BP, glucose, waist) just
    // compare to a normal/recommended range — say so plainly rather than implying
    // an age/sex norm that doesn't exist.
    const range = res.banded ? 'the expected range for your age and sex' : 'the normal range';
    const verb = res.verdict === 'within' ? 'Within' : res.verdict === 'below' ? 'Below' : 'Above';
    parts.push(`${verb} ${range}.`);
  }
  else if (res.verdict === 'flagged' && res.label) parts.push(`${res.label[0].toUpperCase()}${res.label.slice(1)}.`);

  if (res.normContext) parts.push(`${res.normContext}.`.replace(/\.\.$/, '.'));
  for (const f of res.flags || []) parts.push(`${f[0].toUpperCase()}${f.slice(1)}.`);

  // Surface only the caveats that change how the reader should act.
  for (const c of res.caveats || []) {
    if (CAVEAT_TEXT[c] && !parts.some(p => p.includes(CAVEAT_TEXT[c]))) parts.push(CAVEAT_TEXT[c]);
  }
  if (includeSource && res.source) parts.push(`(${res.source})`);
  return parts.join(' ').replace(/\s+/g, ' ').trim() || null;
}

/**
 * One-stop: match a test by name and classify a raw measured string.
 * Returns null if the test isn't in the dataset.
 */
function interpret(testName, rawResult, age, sex) {
  const match = matchTest(testName);
  if (!match) return null;
  const parsed = parseValue(rawResult, match.def.unit);
  const result = classify(match.def, parsed, age, sex);
  return { key: match.key, ...result };
}

// ── Reassessment comparison ──────────────────────────────────────────────────
// Word for the unit in change phrasing ("up 3 reps"). Mirrors scribe-llm's
// unitSuffix but returns a trailing-space-free word for inline prose.
const UNIT_WORD = { reps: 'reps', seconds: 'sec', kg: 'kg', degrees: '°', cm: 'cm', metres: 'm', points: 'points', bpm: 'bpm', mmol_L: 'mmol/L', mmHg: 'mmHg', m_s: 'm/s' };
function unitWord(u) { return UNIT_WORD[u] || ''; }

// Pick the single comparable scalar from a parsed value. Bilateral falls back to
// the weaker side (parseValue already sets `value` to min); BP uses systolic.
function scalarOf(parsed, def) {
  if (!parsed) return null;
  if (def.compound === 'systolic_diastolic') return parsed.systolic != null ? parsed.systolic : null;
  return parsed.value != null ? parsed.value : null;
}

// Rank a verdict by how close it is to "normal" so target-range / screen tests
// (BP, glucose) can be compared without a numeric direction. Higher = better.
const VERDICT_SCORE = { within: 2, below: 1, above: 1, borderline: 1, flagged: 0 };
function verdictScore(v) { return VERDICT_SCORE[v] != null ? VERDICT_SCORE[v] : null; }

// Relative deadband for tests without a known unit floor.
const MAINTAIN_PCT = 0.05;

// Minimum meaningful absolute change per unit — a change smaller than this reads
// as "maintained" rather than noise. Roughly the day-to-day measurement error /
// MDC for each test type, so e.g. a 1.6 kg grip wobble isn't called an
// improvement. Used for higher_better / lower_better tests.
const MIN_ABS_CHANGE = { kg: 3, reps: 2, seconds: 2, degrees: 5, cm: 1.5, m_s: 0.1, metres: 30, points: 2, bpm: 5, mmol_L: 0.4 };

// Minimum movement (in distance-outside-normal) for a target-range test to count
// as a direction change rather than steady.
const TARGET_FLOOR = { mmHg: 5, mmol_L: 0.3, bpm: 5 };

// The ceiling of the "normal" band for a screen/threshold test (first
// non-flagged category). Compound BP returns {sys, dia}; others a single number.
function normalCeiling(def) {
  const cats = def.categories || [];
  const normal = cats.find(c => !c.flag);
  if (def.compound === 'systolic_diastolic') {
    return normal ? { sys: normal.systolicMax, dia: normal.diastolicMax } : null;
  }
  return normal && normal.max != null ? normal.max : null;
}

// How far a reading sits OUTSIDE the normal range (0 = within). Lets target-range
// tests detect improvement that moves toward normal even within the flagged zone
// (e.g. BP 140/80 → 132/75, both elevated but clearly closer to normal).
function outsideNormalDistance(def, parsed) {
  if (!parsed) return null;
  const ceil = normalCeiling(def);
  if (def.compound === 'systolic_diastolic') {
    if (!ceil || parsed.systolic == null) return null;
    return Math.max(0, parsed.systolic - ceil.sys) + Math.max(0, (parsed.diastolic || 0) - ceil.dia);
  }
  if (ceil == null || parsed.value == null) return null;
  return Math.max(0, parsed.value - ceil); // high-is-bad screens (glucose)
}

/**
 * Compare a baseline vs latest measurement of the SAME test. Deterministic — the
 * direction and the verdict transition are computed here; the LLM/phrasing layer
 * only renders them. Returns null if the test isn't in the dataset.
 * No patient values are logged.
 */
function compareValues(testName, prevRaw, currRaw, age, sex) {
  const match = matchTest(testName);
  if (!match) return null;
  const def = match.def;

  const prevParsed = parseValue(prevRaw, def.unit);
  const currParsed = parseValue(currRaw, def.unit);
  const prevClass = classify(def, prevParsed, age, sex);
  const currClass = classify(def, currParsed, age, sex);

  const prevVal = scalarOf(prevParsed, def);
  const currVal = scalarOf(currParsed, def);

  let absChange = null, pctChange = null;
  if (prevVal != null && currVal != null) {
    absChange = Math.round((currVal - prevVal) * 100) / 100;
    if (prevVal !== 0) pctChange = (currVal - prevVal) / Math.abs(prevVal);
  }

  // Direction relative to what "better" means for this test.
  let direction = null;
  if (def.direction === 'higher_better' || def.direction === 'lower_better') {
    if (absChange == null) direction = null;
    else {
      // Unit-aware deadband: real measurement error before a change counts.
      const floor = MIN_ABS_CHANGE[def.unit];
      const maintained = absChange === 0 ||
        (floor != null ? Math.abs(absChange) < floor : (pctChange != null && Math.abs(pctChange) < MAINTAIN_PCT));
      if (maintained) direction = 'maintained';
      else {
        const better = def.direction === 'higher_better' ? absChange > 0 : absChange < 0;
        direction = better ? 'improved' : 'declined';
      }
    }
  } else if (def.direction === 'target_range' || def.compound === 'systolic_diastolic') {
    // Closer to the normal range is better — measure distance-outside-normal so an
    // improvement within the flagged zone still registers. Fall back to the
    // verdict transition when we can't compute a distance.
    const dPrev = outsideNormalDistance(def, prevParsed);
    const dCurr = outsideNormalDistance(def, currParsed);
    if (dPrev != null && dCurr != null) {
      const floor = TARGET_FLOOR[def.unit] != null ? TARGET_FLOOR[def.unit] : 0.001;
      if (Math.abs(dPrev - dCurr) < floor) direction = 'maintained';
      else direction = dCurr < dPrev ? 'improved' : 'declined';
    } else {
      const ps = verdictScore(prevClass.verdict), cs = verdictScore(currClass.verdict);
      if (ps == null || cs == null) direction = null;
      else if (cs > ps) direction = 'improved';
      else if (cs < ps) direction = 'declined';
      else direction = 'maintained';
    }
  } // 'none'/qualitative → direction stays null

  const crossedThreshold =
    prevClass.verdict !== currClass.verdict &&
    prevClass.verdict !== 'na' && currClass.verdict !== 'na';

  return {
    key: match.key,
    displayName: def.displayName,
    def,
    unit: def.unit,
    prev: { raw: prevRaw, value: prevVal, parsed: prevParsed, verdict: prevClass.verdict, label: prevClass.label },
    curr: { raw: currRaw, value: currVal, parsed: currParsed, verdict: currClass.verdict, label: currClass.label },
    absChange,
    pctChange,
    direction,
    prevVerdict: prevClass.verdict,
    currVerdict: currClass.verdict,
    prevLabel: prevClass.label,
    currLabel: currClass.label,
    crossedThreshold,
    currInterpretation: buildInterpretation({ key: match.key, ...currClass }),
  };
}

// Range phrasing: banded norm tests compare to an age/sex range; screens (BP,
// glucose, waist) just compare to a normal/recommended range.
function rangePhrase(verdict, banded) {
  const where = banded ? 'the expected range for your age and sex' : 'the normal range';
  if (verdict === 'within') return `within ${where}`;
  if (verdict === 'below') return `below ${where}`;
  if (verdict === 'above') return `above ${where}`;
  if (verdict === 'flagged') return 'outside the normal range';
  return null;
}

// Reading string for a compound (BP) parsed value, e.g. "132/75".
function readingOf(parsed) {
  if (!parsed || parsed.systolic == null) return null;
  return `${parsed.systolic}/${parsed.diastolic}`;
}

/**
 * Render a compareValues() result into a short, factual change sentence for the
 * reassessment table's "What it means" column. Deterministic. Patient-facing
 * second person, consistent with buildInterpretation().
 */
function buildComparisonInterpretation(res) {
  if (!res) return null;
  const parts = [];
  const u = unitWord(res.unit);
  const uSuffix = u ? (u === '°' ? '°' : ` ${u}`) : '';
  const banded = !!(res.def && res.def.bands && res.def.bands.length);
  const compound = !!(res.def && res.def.compound);
  const moved = res.direction === 'improved' || res.direction === 'declined';

  if (moved) {
    const verb = res.direction === 'improved' ? 'Improved' : 'Declined';
    let line = verb;
    if (compound) {
      // Show the full reading change rather than a systolic-only magnitude.
      const cr = readingOf(res.curr.parsed), pr = readingOf(res.prev.parsed);
      if (cr && pr) {
        const arrow = res.curr.parsed.systolic < res.prev.parsed.systolic ? 'down' : 'up';
        line += ` (${cr} ${u}, ${arrow} from ${pr})`;
      }
    } else if (res.absChange != null) {
      const arrow = res.absChange > 0 ? 'up' : 'down';
      line += ` (${arrow} ${Math.abs(res.absChange)}${uSuffix}`;
      // Percent only for banded norm tests, where it's a meaningful gain measure.
      if (banded && res.pctChange != null && Math.abs(res.pctChange) >= MAINTAIN_PCT) {
        line += `, ${Math.round(Math.abs(res.pctChange) * 100)}%`;
      }
      line += ')';
    }
    parts.push(`${line}.`);
  } else if (res.direction === 'maintained') {
    parts.push('Held steady.');
  } else {
    // No numeric direction (qualitative / ungraded) — state the change neutrally.
    if (res.prev.value != null && res.curr.value != null && res.absChange !== 0) {
      parts.push(`Changed from ${res.prev.value} to ${res.curr.value}${uSuffix}.`);
    } else {
      parts.push('Recorded for comparison.');
    }
  }

  // Range/label transition — ONLY narrate when the change was meaningful enough to
  // count as a direction (suppress on "maintained" so a noise-level value that
  // happens to nudge across a band edge doesn't read as a dramatic shift).
  if (moved) {
    if (compound && res.currLabel) {
      // Use the screen's own label, which conveys "elevated"/"upper end of normal".
      if (res.prevLabel && res.currLabel !== res.prevLabel) {
        parts.push(`Now ${res.currLabel}, from ${res.prevLabel}.`);
      } else {
        parts.push(`Now ${res.currLabel}.`);
      }
    } else if (res.crossedThreshold) {
      const to = rangePhrase(res.currVerdict, banded);
      if (to) parts.push(`Now ${to}, from ${res.prevVerdict} before.`);
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim() || null;
}

module.exports = { load, matchTest, parseValue, classify, interpret, buildInterpretation, compareValues, buildComparisonInterpretation, normalizeSex, _DATA_PATH: DATA_PATH };
