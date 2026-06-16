/**
 * Render tap-captured in-session measurements into grounded prompt lines for SOAP
 * generation (Phase 3 of the scribe context upgrades). Each value is graded
 * deterministically against age/sex norms via normative-data.interpretByKey — the
 * model never derives the verdict, only phrases it. Mirrors the handout's grounding
 * so a tapped number and a spoken one read the same way.
 *
 * Handles three measure kinds: numeric (one value), compound (e.g. blood pressure
 * sys/dia via value2), and toggle (pass/fail observations rendered as their label).
 * Returns an array of strings, the same shape the SOAP prompt-assembly layer already
 * consumes for program diffs. No patient values are logged.
 */
const { interpretByKey, buildInterpretation } = require('./normative-data');
const { findMeasure } = require('./assessment-catalog');

const UNIT_SUFFIX = {
  degrees: '°', kg: ' kg', seconds: ' sec', reps: ' reps', cm: ' cm',
  m_s: ' m/s', mmHg: ' mmHg', bpm: ' bpm', metres: ' m', points: ' points',
};
function unitSuffix(u) { return UNIT_SUFFIX[u] != null ? UNIT_SUFFIX[u] : (u ? ` ${u}` : ''); }

function fmt(v) { return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); }

/**
 * @param {Array<{assessment_key, measure_key, side, value, value2, unit}>} rows
 * @param {number|null} age
 * @param {string|null} sex
 * @returns {string[]} grounded lines (empty if no rows)
 */
function renderMeasurements(rows, age, sex) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Group by measure (assessment + measure key), preserving first-seen order.
  const order = [];
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.assessment_key}::${r.measure_key}`;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(r);
  }

  const lines = [];
  for (const key of order) {
    const grp = groups.get(key);
    const measureKey = grp[0].measure_key;
    const cat = findMeasure(grp[0].assessment_key, measureKey);
    const mode = cat ? (cat.measure.input || 'keypad') : 'keypad';
    const suffix = unitSuffix(grp[0].unit);
    let left = null, right = null;

    for (const r of grp) {
      const value = Number(r.value);
      if (!Number.isFinite(value)) continue;
      const sideLabel = r.side === 'left' ? ' (Left)' : r.side === 'right' ? ' (Right)' : '';

      if (mode === 'toggle') {
        const opt = (cat.measure.options || []).find(o => o.value === value);
        const label = opt ? opt.label : String(value);
        lines.push(`${cat.assessment.displayName}${sideLabel}: ${label}`);
        continue;
      }

      if (mode === 'compound' && r.value2 != null) {
        const raw = `${fmt(value)}/${fmt(Number(r.value2))}`;
        const res = interpretByKey(measureKey, raw, age, sex);
        const display = (res && res.displayName) || (cat ? cat.assessment.displayName : measureKey);
        const grounded = res && buildInterpretation(res);
        lines.push(`${display}${sideLabel}: ${raw}${suffix}${grounded ? ` — ${grounded}` : ''}`);
        continue;
      }

      // Numeric.
      if (r.side === 'left') left = value;
      else if (r.side === 'right') right = value;
      const res = interpretByKey(measureKey, value, age, sex);
      const display = (res && res.displayName) || (cat ? `${cat.assessment.displayName} ${cat.measure.label}` : measureKey);
      const grounded = res && buildInterpretation(res);
      lines.push(`${display}${sideLabel}: ${fmt(value)}${suffix}${grounded ? ` — ${grounded}` : ''}`);
    }

    // Side-to-side asymmetry (>=10%) — numeric bilateral tests only.
    if (mode !== 'toggle' && mode !== 'compound' && left != null && right != null) {
      const hi = Math.max(left, right), lo = Math.min(left, right);
      if (hi > 0 && (hi - lo) / hi >= 0.10) {
        const pct = Math.round((hi - lo) / hi * 100);
        const weaker = right < left ? 'right' : 'left';
        const res = interpretByKey(measureKey, hi, age, sex);
        const display = (res && res.displayName) || measureKey;
        lines.push(`${display}: ${pct}% side-to-side difference (L ${fmt(left)} / R ${fmt(right)}), lower on the ${weaker} side.`);
      }
    }
  }
  return lines;
}

module.exports = { renderMeasurements };
