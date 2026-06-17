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
  if (!CATALOG) CATALOG = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return CATALOG;
}

function getProm(key) {
  return loadProms().proms.find(p => p.key === key) || null;
}

module.exports = { loadProms, getProm, _CATALOG_PATH: CATALOG_PATH };
