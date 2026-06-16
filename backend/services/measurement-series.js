/**
 * Build longitudinal measurement series for a patient's profile trend view.
 * Groups a patient's tap-captured measurements (across all their scribe sessions)
 * by assessment + measure + side into a chronological series, with the latest
 * value grounded against age/sex norms and a deterministic baseline→latest change.
 *
 * Grading/comparison reuse the same normative engine as the handout and the SOAP
 * note, so a trend reads consistently with the note it came from. No patient
 * values are logged.
 */
const { interpretByKey, buildInterpretation, compareValues, buildComparisonInterpretation, load } = require('./normative-data');

/**
 * @param {Array<{session_id, session_date, assessment_key, measure_key, side, value, unit}>} rows
 * @param {number|null} age
 * @param {string|null} sex
 */
function buildSeries(rows, age, sex) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const order = [];
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.assessment_key}::${r.measure_key}::${r.side}`;
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k).push(r);
  }

  const norms = load().tests;
  const series = [];
  for (const k of order) {
    const grp = groups.get(k).slice().sort(
      (a, b) => new Date(a.session_date) - new Date(b.session_date) || a.session_id - b.session_id
    );
    const first = grp[0], last = grp[grp.length - 1];
    const def = norms[first.measure_key] || null;
    const points = grp.map(r => ({ sessionId: r.session_id, date: r.session_date, value: Number(r.value) }));

    const latestRes = interpretByKey(first.measure_key, Number(last.value), age, sex);
    const latestInterpretation = latestRes ? buildInterpretation(latestRes) : null;

    // Baseline → latest change (deterministic, with the engine's unit-aware
    // deadband so noise doesn't read as improvement). Only when ≥2 points.
    let change = null;
    if (grp.length >= 2 && def) {
      const cmp = compareValues(def.displayName, String(first.value), String(last.value), age, sex);
      if (cmp) {
        change = {
          direction: cmp.direction,
          absChange: cmp.absChange,
          text: buildComparisonInterpretation(cmp, { audience: 'gp' }),
        };
      }
    }

    series.push({
      assessmentKey: first.assessment_key,
      measureKey: first.measure_key,
      side: first.side,
      unit: first.unit,
      displayName: def ? def.displayName : first.measure_key,
      points,
      latestValue: Number(last.value),
      latestInterpretation,
      change,
    });
  }
  return series;
}

module.exports = { buildSeries };
