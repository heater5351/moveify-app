/**
 * Melbourne ACL Return-to-Sport Score (MRSS) — deterministic scoring layer.
 *
 * The MRSS is a thin /100 scoring layer ON TOP of standalone catalog measures
 * (clinical-exam toggles, hop tests, SEBT, LESS) plus the IKDC PROM. Nothing here
 * is graded by the LLM — the composite is computed from stored values + the
 * config in data/mrss-protocol.json. Pure + catalog-driven so it is unit-testable.
 *
 * The one input that isn't a stored measurement is the **involved limb** (and
 * whether it is the patient's dominant leg) — supplied at scoring time, because
 * LSI = involved ÷ uninvolved × 100 and the LSI→points table has separate
 * dominant / non-dominant columns. No patient values are logged.
 *
 * Source: Cooper, ACL Rehabilitation Guide 2.0 (MRSS, /100, pass > 95).
 */
const fs = require('fs');
const path = require('path');

const PROTOCOL_PATH = path.join(__dirname, '../data/mrss-protocol.json');

let PROTOCOL = null;
function loadProtocol() {
  if (!PROTOCOL) PROTOCOL = JSON.parse(fs.readFileSync(PROTOCOL_PATH, 'utf8'));
  return PROTOCOL;
}

function round1(n) { return n == null ? null : Math.round(n * 10) / 10; }
function other(side) { return side === 'left' ? 'right' : 'left'; }

// Index measurement rows by assessment::measure::side → numeric value.
function indexRows(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    map.set(`${r.assessment_key}::${r.measure_key}::${r.side}`, v);
  }
  return (assessment, measure, side) => {
    const v = map.get(`${assessment}::${measure}::${side}`);
    return v == null ? null : v;
  };
}

// First band whose threshold field covers the value (bands ordered best→worst).
function bandPoints(bands, value, field) {
  for (const b of bands) if (value <= b[field]) return b.points;
  return 0;
}

/**
 * LSI → points. Bands are listed tightest-first and are nested (each wider band
 * contains the previous), so the first band whose [lo,hi] window contains the LSI
 * gives the right tier. Outside every window → 0. `scale` is 'ten' (SEBT, /10) or
 * 'five' (hops / squats, /5). Over-performance on the involved side (LSI well above
 * 100) falls outside the windows and is penalised, exactly like the printed table.
 */
function lsiPoints(lsi, isDominant, scale) {
  if (lsi == null || !Number.isFinite(lsi)) return 0;
  const table = loadProtocol().lsiToPoints[isDominant ? 'dominant' : 'nonDominant'];
  for (const b of table) if (lsi >= b.lo && lsi <= b.hi) return b[scale];
  return 0;
}

/**
 * @param {Object} input
 * @param {Array}  input.rows               scribe_session_measurements rows
 * @param {number|null} input.ikdcScore     IKDC Subjective 0–100 (from the PROM), or null
 * @param {'left'|'right'} input.involvedSide
 * @param {boolean} input.involvedIsDominant whether the involved leg is the dominant leg
 * @returns {Object} structured /100 breakdown + missing-component list
 */
function computeMrss({ rows, ikdcScore, involvedSide, involvedIsDominant }) {
  if (involvedSide !== 'left' && involvedSide !== 'right') {
    throw new Error("involvedSide must be 'left' or 'right'");
  }
  const protocol = loadProtocol();
  const get = indexRows(rows);
  const inv = involvedSide;
  const unv = other(involvedSide);
  const missing = [];

  // ── Part A — clinical examination /25 ──────────────────────────────────────
  const partAComponents = [];
  let partAPoints = 0;
  for (const c of protocol.partA.components) {
    let points = 0, value = null, extra = {};
    if (c.type === 'deficit') {
      const a = get(c.assessment, c.measure, inv);
      const b = get(c.assessment, c.measure, unv);
      if (a == null || b == null) { missing.push(c.label); }
      else {
        const deficit = Math.max(0, b - a); // involved is the weaker/restricted side
        value = deficit;
        points = bandPoints(c.bands, deficit, 'maxDeficit');
        extra = { involved: a, uninvolved: b, deficit: round1(deficit) };
      }
    } else { // 'grade' or 'value' — a single captured value
      const v = get(c.assessment, c.measure, 'bilateral');
      if (v == null) { missing.push(c.label); }
      else { value = v; points = bandPoints(c.bands, v, 'maxValue'); }
    }
    partAComponents.push({ key: c.key, label: c.label, value, points, max: 5, ...extra });
    partAPoints += points;
  }

  // ── Part B — IKDC Subjective /25 ───────────────────────────────────────────
  const ikdcAvailable = ikdcScore != null && Number.isFinite(Number(ikdcScore));
  if (!ikdcAvailable) missing.push('IKDC Subjective (PROM)');
  const partBPoints = ikdcAvailable
    ? Math.round(Number(ikdcScore) * protocol.partB.multiplier * 100) / 100
    : 0;

  // ── Part C — functional testing /50 ────────────────────────────────────────
  const partCComponents = [];
  let partCPoints = 0;
  for (const c of protocol.partC.components) {
    let points = 0, lsi = null, involved = null, uninvolved = null, value = null;
    if (c.type === 'direct') {
      const v = get(c.assessment, c.measure, 'bilateral');
      if (v == null) missing.push(c.label);
      else { value = v; points = Math.max(0, Math.min(Math.round(v), c.max)); }
    } else if (c.type === 'lsi') {
      involved = get(c.assessment, c.measure, inv);
      uninvolved = get(c.assessment, c.measure, unv);
      if (involved == null || uninvolved == null) missing.push(c.label);
      else if (uninvolved <= 0) missing.push(`${c.label} (invalid uninvolved value)`);
      else { lsi = (involved / uninvolved) * 100; points = lsiPoints(lsi, involvedIsDominant, c.scale); }
    } else if (c.type === 'lsiComposite') {
      const composite = side => {
        const vals = c.measures.map(m => get(c.assessment, m, side));
        return vals.every(v => v != null) ? vals.reduce((x, y) => x + y, 0) : null;
      };
      involved = composite(inv);
      uninvolved = composite(unv);
      if (involved == null || uninvolved == null) missing.push(c.label);
      else if (uninvolved <= 0) missing.push(`${c.label} (invalid uninvolved value)`);
      else { lsi = (involved / uninvolved) * 100; points = lsiPoints(lsi, involvedIsDominant, c.scale); }
    }
    partCComponents.push({
      key: c.key, label: c.label, type: c.type, max: c.max, points,
      value, involved: round1(involved), uninvolved: round1(uninvolved), lsi: round1(lsi),
    });
    partCPoints += points;
  }

  const total = Math.round((partAPoints + partBPoints + partCPoints) * 100) / 100;
  const scorePass = total > protocol.passThreshold;

  return {
    version: protocol.version,
    passThreshold: protocol.passThreshold,
    involvedSide, involvedIsDominant: !!involvedIsDominant,
    partA: { max: protocol.partA.max, points: partAPoints, components: partAComponents },
    partB: { max: protocol.partB.max, points: partBPoints, ikdcRaw: ikdcAvailable ? Number(ikdcScore) : null, available: ikdcAvailable },
    partC: { max: protocol.partC.max, points: partCPoints, components: partCComponents },
    total,
    scorePass,
    missing,
    complete: missing.length === 0,
  };
}

module.exports = { computeMrss, lsiPoints, loadProtocol, _PROTOCOL_PATH: PROTOCOL_PATH };
