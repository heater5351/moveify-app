/**
 * Deterministic PROM scoring (Phase 4). The score is computed HERE on the server —
 * never trusted from the client and never LLM-derived — because a miscalculated
 * outcome score in a clinical record is a credibility problem. Pure + catalog-driven
 * so it's unit-testable against the published scoring rules. No patient values logged.
 *
 * Scoring shapes: single | average | sum | percentage (see prom-catalog.json _meta).
 */

function round1(n) { return Math.round(n * 10) / 10; }

/** Pick the interpretation band whose ceiling the score falls within. */
function bandFor(bands, score) {
  if (!Array.isArray(bands) || score == null) return null;
  const b = bands.find(x => score <= x.max) || bands[bands.length - 1];
  return b ? b.label : null;
}

/**
 * @param {Object} prom  catalog entry
 * @param {Object} responses  { [itemKey]: number }  or  { activities: [{name, score}] }
 * @returns {{ score:number|null, band:string|null, max:number|null }}
 */
function scoreProm(prom, responses) {
  const r = responses || {};
  let score = null, max = null;

  if (prom.scoring === 'single') {
    const it = prom.items[0];
    const v = Number(r[it.key]);
    score = Number.isFinite(v) ? v : null;
    max = it.scale.max;
  } else if (prom.scoring === 'average') {
    const acts = Array.isArray(r.activities) ? r.activities : [];
    const vals = acts.map(a => Number(a && a.score)).filter(Number.isFinite);
    score = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    max = prom.activities.scale.max;
  } else if (prom.scoring === 'sum') {
    const vals = prom.items.map(it => Number(r[it.key])).filter(Number.isFinite);
    score = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    max = prom.items.length * prom.items[0].scale.max;
  } else if (prom.scoring === 'percentage') {
    const vals = prom.items.map(it => Number(r[it.key])).filter(Number.isFinite);
    const denom = prom.items.length * prom.items[0].scale.max;
    score = vals.length && denom ? Math.round((vals.reduce((a, b) => a + b, 0) / denom) * 100) : null;
    max = 100;
  }

  return { score, band: bandFor(prom.bands, score), max };
}

/**
 * Validate a submitted responses object against the PROM. Returns null if valid or
 * an error string. Ensures values sit within the item/activity scale.
 */
function validateResponses(prom, responses) {
  if (!responses || typeof responses !== 'object') return 'responses required';
  if (prom.scoring === 'average') {
    const acts = Array.isArray(responses.activities) ? responses.activities : null;
    if (!acts || acts.length < (prom.activities.min || 1)) return 'at least one activity required';
    if (acts.length > (prom.activities.max || 99)) return 'too many activities';
    const { min, max } = prom.activities.scale;
    for (const a of acts) {
      if (!a || typeof a.name !== 'string' || !a.name.trim()) return 'each activity needs a name';
      const v = Number(a.score);
      if (!Number.isFinite(v) || v < min || v > max) return 'activity score out of range';
    }
    return null;
  }
  // single / sum / percentage — fixed items
  for (const it of prom.items) {
    const v = Number(responses[it.key]);
    if (!Number.isFinite(v)) return `item ${it.key} required`;
    if (v < it.scale.min || v > it.scale.max) return `item ${it.key} out of range`;
  }
  return null;
}

/** One-line summary for the SOAP note prompt: "Pain (NPRS): 6/10 (Moderate pain)". */
function summarizeOutcome(prom, score, band) {
  if (score == null) return null;
  const max = prom.scoring === 'percentage' ? 100
    : prom.scoring === 'average' ? prom.activities.scale.max
    : prom.scoring === 'sum' ? prom.items.length * prom.items[0].scale.max
    : prom.items[0].scale.max;
  const name = prom.shortName || prom.name;
  return `${name}: ${score}/${max}${band ? ` (${band})` : ''}`;
}

module.exports = { scoreProm, validateResponses, summarizeOutcome, bandFor };
