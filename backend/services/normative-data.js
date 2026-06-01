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

  // Bilateral: "L 12 / R 18", "left 12, right 18", "12/18"
  const bilat = t.match(/(?:l(?:eft)?\D*)?(\d+(?:\.\d+)?)\D+(?:r(?:ight)?\D*)?(\d+(?:\.\d+)?)/i);
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (/\b(l|left|r|right)\b/i.test(t) && nums.length >= 2) {
    return { left: nums[0], right: nums[1], value: Math.min(nums[0], nums[1]) };
  }
  if (bilat && /\//.test(t) && nums.length === 2 && unit !== 'm_s') {
    // ambiguous slash without L/R labels — treat as single only if one number
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
  const out = { verdict: 'na', label: null, normContext: null, flags: [], caveats, source: def.sourceShort, displayName: def.displayName };

  if (!parsed) return out;

  // Blood pressure — categorise by systolic/diastolic.
  if (def.compound === 'systolic_diastolic') {
    const { systolic, diastolic } = parsed;
    if (systolic == null) return out;
    const cat = (def.categories || []).find(c => systolic <= c.systolicMax && diastolic <= c.diastolicMax)
      || def.categories[def.categories.length - 1];
    out.label = cat ? cat.label : null;
    out.verdict = /hypertension/.test(out.label || '') ? 'flagged' : 'within';
    for (const c of (def.cutoffs || [])) {
      if (c.component === 'systolic' && systolic != null && cmp(c.op, systolic, c.value)) out.flags.push(c.meaning);
    }
    out.normContext = `BP category: ${out.label}`;
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
    out.verdict = /normal/.test(out.label || '') ? 'within' : 'flagged';
  }

  // Sex/value cut-offs (waist, grip EWGSOP2, fall-risk thresholds, etc.).
  for (const c of applicableCutoffs(def, sex)) {
    if (cmp(c.op, v, c.value)) out.flags.push(c.meaning);
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
  screen_not_diagnose: 'Screening only — recommend GP review, not a diagnosis.',
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
  else if (res.verdict === 'within') parts.push('Within the expected range for age/sex.');
  else if (res.verdict === 'below') parts.push('Below the expected range for age/sex.');
  else if (res.verdict === 'above') parts.push('Above the expected range for age/sex.');
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

module.exports = { load, matchTest, parseValue, classify, interpret, buildInterpretation, normalizeSex, _DATA_PATH: DATA_PATH };
