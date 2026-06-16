/**
 * Loader for the in-session assessment catalog (Phase 3 of the scribe context
 * upgrades). The catalog drives the tap-capture panel AND the deterministic
 * grading at note generation — every measure key is expected to match a test key
 * in normative-data.json so normative-data.interpretByKey() can grade it.
 *
 * Nothing here touches patient data — it is a static reference file.
 */
const fs = require('fs');
const path = require('path');
const { load: loadNorms } = require('./normative-data');

const CATALOG_PATH = path.join(__dirname, '../data/assessment-catalog.json');

let CATALOG = null;
function loadCatalog() {
  if (!CATALOG) CATALOG = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return CATALOG;
}

/** Flat map of assessment_key → assessment definition. */
function assessmentsByKey() {
  const map = new Map();
  for (const a of loadCatalog().assessments) map.set(a.key, a);
  return map;
}

/**
 * Look up the measure definition for an assessment_key + measure_key pair.
 * Returns { assessment, measure } or null — used to validate an incoming save
 * (unit, allowed laterality, numeric bounds) against the catalog.
 */
function findMeasure(assessmentKey, measureKey) {
  const a = assessmentsByKey().get(assessmentKey);
  if (!a) return null;
  const measure = a.measures.find(m => m.key === measureKey);
  return measure ? { assessment: a, measure } : null;
}

/**
 * Validate that every catalog measure key resolves to a normative-data test.
 * Returns the list of measure keys with no matching norm (empty = all aligned).
 * Used by the catalog test to fail loudly if the two files drift apart.
 */
function unalignedMeasureKeys() {
  const norms = loadNorms().tests;
  const missing = [];
  for (const a of loadCatalog().assessments) {
    for (const m of a.measures) {
      if (!norms[m.key]) missing.push(m.key);
    }
  }
  return missing;
}

module.exports = { loadCatalog, assessmentsByKey, findMeasure, unalignedMeasureKeys, _CATALOG_PATH: CATALOG_PATH };
