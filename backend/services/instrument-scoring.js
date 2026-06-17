/**
 * Deterministic scoring for multi-item clinical instruments (Berg Balance Scale,
 * Mini-BESTest). The total is computed HERE on the server — never trusted from the
 * client — by summing the per-item scores the clinician selected. Bilateral items
 * (Mini-BEST stand-on-one-leg, lateral stepping) use the WORSE (lower) side per the
 * official scoring rules. Pure + catalog-driven so it's unit-testable and adding an
 * instrument is data, not code. This is the same engine the Phase 4 PROM kiosk will
 * reuse. No patient values are logged.
 */

/**
 * @param {Array} items  catalog instrument items: { key, bilateral?, options:[{value}] }
 * @param {Object} detail  { [itemKey]: number }  or  { [itemKey]: {left,right} } for bilateral
 * @returns {{ total:number, byItem:Object, answered:number, totalItems:number }}
 */
function scoreInstrument(items, detail) {
  let total = 0;
  let answered = 0;
  const byItem = {};
  const d = detail || {};

  for (const it of items) {
    const a = d[it.key];
    if (it.bilateral) {
      const vals = ['left', 'right']
        .map(s => (a && typeof a[s] === 'number' ? a[s] : null))
        .filter(v => v != null);
      if (vals.length > 0) {
        const score = Math.min(...vals);
        total += score;
        byItem[it.key] = { left: a.left ?? null, right: a.right ?? null, score };
        // Count answered only when both sides are in (a side-to-side test needs both).
        if (vals.length === 2) answered += 1;
      }
    } else if (typeof a === 'number') {
      total += a;
      byItem[it.key] = a;
      answered += 1;
    }
  }

  return { total, byItem, answered, totalItems: items.length };
}

/**
 * Validate a submitted detail object against the catalog item definitions.
 * Returns null if valid, or an error string. Ensures every score is one of the
 * item's allowed option values (and both sides for bilateral items).
 */
function validateDetail(items, detail) {
  if (!detail || typeof detail !== 'object') return 'detail required';
  const byKey = new Map(items.map(it => [it.key, it]));
  for (const [key, a] of Object.entries(detail)) {
    const it = byKey.get(key);
    if (!it) return `unknown item ${key}`;
    const opts = it.options.map(o => o.value);
    if (it.bilateral) {
      if (a == null || typeof a !== 'object') return `item ${key} needs left/right`;
      for (const s of ['left', 'right']) {
        if (a[s] != null && !opts.includes(a[s])) return `item ${key} ${s} invalid`;
      }
    } else if (!opts.includes(a)) {
      return `item ${key} invalid`;
    }
  }
  return null;
}

module.exports = { scoreInstrument, validateDetail };
