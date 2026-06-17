/**
 * Loader for the patient-completed outcome-measure (PROM) catalog (Phase 4).
 * Static reference — no patient data. The catalog drives the kiosk questionnaire
 * and the deterministic scoring (services/prom-scoring.js).
 */
const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '../data/prom-catalog.json');

let CATALOG = null;
function loadProms() {
  if (!CATALOG) {
    CATALOG = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    // Resolve a prom-level `itemScale` onto each item that has no input of its own,
    // so items carrying only `text` (LEFS/K10/DASS-21) get a usable numeric scale.
    for (const p of CATALOG.proms) {
      if (p.itemScale && Array.isArray(p.items)) {
        for (const it of p.items) {
          if (!it.scale && !it.options && !it.type) it.scale = p.itemScale;
        }
      }
    }
  }
  return CATALOG;
}

function getProm(key) {
  return loadProms().proms.find(p => p.key === key) || null;
}

module.exports = { loadProms, getProm, _CATALOG_PATH: CATALOG_PATH };
