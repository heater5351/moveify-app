/**
 * Deterministic PROM scoring (Phase 4). The score is computed HERE on the server —
 * never trusted from the client and never LLM-derived. Pure + catalog-driven so it's
 * unit-testable against the published scoring rules. No patient values logged.
 *
 * Item model (each catalog item carries exactly one input):
 *   scale:  { min,max,minLabel,maxLabel }   numeric slider/row
 *   options:[ {value,label} ]               choice statements (ODI/NDI sections)
 *   type:   'yesno'                          1 (yes) / 0 (no)  (Roland-Morris)
 * plus optional `reverse` (reverse-scored) and `subscale` (group key).
 *
 * Scoring shapes: single | average | sum | percentage | subscales.
 */

function round1(n) { return Math.round(n * 10) / 10; }
function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

function itemRange(item) {
  if (item.scale) return { min: item.scale.min, max: item.scale.max };
  if (item.options) { const v = item.options.map(o => o.value); return { min: Math.min(...v), max: Math.max(...v) }; }
  if (item.type === 'yesno') return { min: 0, max: 1 };
  return { min: 0, max: 0 };
}
function reversed(item, v) {
  if (!item.reverse) return v;
  const { min, max } = itemRange(item);
  return max + min - v;
}
function bandFor(bands, score) {
  if (!Array.isArray(bands) || score == null) return null;
  const b = bands.find(x => score <= x.max) || bands[bands.length - 1];
  return b ? b.label : null;
}

/** Maximum possible primary score, for the "x/max" display. */
function promMax(prom) {
  if (prom.scoring === 'percentage') return 100;
  if (prom.scoring === 'average' && prom.activities) return prom.activities.scale.max;
  if (prom.scoring === 'average' || prom.scoring === 'single') return itemRange(prom.items[0]).max;
  if (prom.scoring === 'sum') return (prom.items || []).reduce((a, it) => a + itemRange(it).max, 0);
  return null;
}

/**
 * @returns {{ score:number|null, band:string|null, max:number|null, subscales:Array|null }}
 */
function scoreProm(prom, responses) {
  const r = responses || {};

  // PSFS-style: average of clinician-entered activity ratings.
  if (prom.scoring === 'average' && prom.activities) {
    const vals = (Array.isArray(r.activities) ? r.activities : []).map(a => Number(a && a.score)).filter(Number.isFinite);
    const score = vals.length ? round1(mean(vals)) : null;
    return { score, band: bandFor(prom.bands, score), max: prom.activities.scale.max, subscales: null };
  }

  const items = prom.items || [];
  const val = it => { const v = Number(r[it.key]); return Number.isFinite(v) ? reversed(it, v) : null; };

  if (prom.scoring === 'single') {
    const v = val(items[0]);
    return { score: v, band: bandFor(prom.bands, v), max: itemRange(items[0]).max, subscales: null };
  }
  if (prom.scoring === 'average') {
    const vs = items.map(val).filter(v => v != null);
    const score = vs.length ? round1(mean(vs)) : null;
    return { score, band: bandFor(prom.bands, score), max: itemRange(items[0]).max, subscales: null };
  }
  if (prom.scoring === 'subscales') {
    const subs = (prom.subscales || []).map(sub => {
      const vs = items.filter(it => it.subscale === sub.key).map(val).filter(v => v != null);
      let s = vs.length ? vs.reduce((a, b) => a + b, 0) : null;
      if (s != null && sub.multiplier) s = s * sub.multiplier;
      return { key: sub.key, name: sub.name, score: s, band: bandFor(sub.bands, s), max: sub.maxScore != null ? sub.maxScore : null };
    });
    return { score: null, band: null, max: null, subscales: subs };
  }

  // sum / percentage
  const vs = items.map(val).filter(v => v != null);
  const total = vs.length ? vs.reduce((a, b) => a + b, 0) : null;
  const maxPoss = items.reduce((acc, it) => acc + itemRange(it).max, 0);
  if (prom.scoring === 'percentage') {
    const score = total != null && maxPoss ? Math.round((total / maxPoss) * 100) : null;
    return { score, band: bandFor(prom.bands, score), max: 100, subscales: null };
  }
  return { score: total, band: bandFor(prom.bands, total), max: maxPoss, subscales: null };
}

function validateResponses(prom, responses) {
  if (!responses || typeof responses !== 'object') return 'responses required';
  if (prom.scoring === 'average' && prom.activities) {
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
  for (const it of prom.items) {
    const v = Number(responses[it.key]);
    if (!Number.isFinite(v)) return `item ${it.key} required`;
    if (it.options) {
      if (!it.options.some(o => o.value === v)) return `item ${it.key} invalid`;
    } else {
      const { min, max } = itemRange(it);
      if (v < min || v > max) return `item ${it.key} out of range`;
    }
  }
  return null;
}

/**
 * Note-prompt line(s) for a stored outcome: one line normally, or one per subscale
 * for multi-subscale instruments (DASS-21, PROMIS-10). `detail` is the parsed
 * subscales array (or null). Returns string[].
 */
function outcomeLines(prom, score, band, detail) {
  const name = prom.shortName || prom.name;
  if (Array.isArray(detail) && detail.length) {
    return detail.filter(s => s.score != null).map(s =>
      `${name} — ${s.name}: ${s.score}${s.max ? `/${s.max}` : ''}${s.band ? ` (${s.band})` : ''}`);
  }
  if (score == null) return [];
  const max = promMax(prom);
  return [`${name}: ${score}${max ? `/${max}` : ''}${band ? ` (${band})` : ''}`];
}

module.exports = { scoreProm, validateResponses, outcomeLines, bandFor, promMax, itemRange };
