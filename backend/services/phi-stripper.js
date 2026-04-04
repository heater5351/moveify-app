// PHI (Protected Health Information) stripping service
// Removes patient-identifying information before sending messages to external AI APIs
// Required for Australian Privacy Act APP 8 compliance

const db = require('../database/db');

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec';

// Regex patterns for common PHI
const PATTERNS = {
  // Australian phone numbers: 04xx xxx xxx, (0x) xxxx xxxx, +61 x xxxx xxxx
  phone: /(?:\+61\s?\d|\(0\d\)\s?\d{4}\s?\d{4}|0[2-478]\s?\d{4}\s?\d{4}|04\d{2}\s?\d{3}\s?\d{3})/g,
  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Dates: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  dobNumeric: /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g,
  // Written dates: "3 March 1990", "3rd March 1990", "March 3, 1990", "March 3rd 1990"
  dobWritten: new RegExp(
    `\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})(?:[,.]?\\s+\\d{4})?|(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:[,.]?\\s+\\d{4})?)\\b`,
    'gi'
  ),
  // Medicare numbers: 10 or 11 digits with optional spaces
  medicare: /\b\d{4}\s?\d{5}\s?\d{1,2}\b/g,
  // Street addresses (basic pattern: number + street name + street type)
  address: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Crescent|Cres|Way|Boulevard|Blvd|Terrace|Tce|Circuit|Cct|Close|Cl|Parade|Pde)\b/gi,
};

/**
 * Strip PHI from a message string
 * @param {string} message - The raw message text
 * @param {string[]} patientNames - Optional list of patient names to also redact
 * @returns {{ cleaned: string, phiDetected: number }} - Cleaned message + count of redactions
 */
function stripPhi(message, patientNames = []) {
  if (!message || typeof message !== 'string') {
    return { cleaned: message || '', phiDetected: 0 };
  }

  let cleaned = message;
  let phiDetected = 0;

  // Strip patient names (longest first to avoid partial matches)
  const sortedNames = [...patientNames]
    .filter(n => n && n.length > 2)
    .sort((a, b) => b.length - a.length);

  for (const name of sortedNames) {
    // Match full name and individual name parts (first/last)
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
    if (nameRegex.test(cleaned)) {
      cleaned = cleaned.replace(nameRegex, '[PATIENT]');
      phiDetected++;
    }

    // Also strip individual name parts (but only if >= 3 chars to avoid false positives)
    const parts = name.split(/\s+/).filter(p => p.length >= 3);
    for (const part of parts) {
      const partEscaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const partRegex = new RegExp(`\\b${partEscaped}\\b`, 'gi');
      if (partRegex.test(cleaned)) {
        cleaned = cleaned.replace(partRegex, '[PATIENT]');
        phiDetected++;
      }
    }
  }

  // Apply regex patterns
  for (const [type, pattern] of Object.entries(PATTERNS)) {
    const placeholder = {
      phone: '[PHONE]',
      email: '[EMAIL]',
      dobNumeric: '[DOB]',
      dobWritten: '[DOB]',
      medicare: '[MEDICARE]',
      address: '[ADDRESS]',
    }[type] || '[REDACTED]';

    const matches = cleaned.match(pattern);
    if (matches) {
      phiDetected += matches.length;
      cleaned = cleaned.replace(pattern, placeholder);
    }
  }

  return { cleaned, phiDetected };
}

/**
 * Load patient names for the current clinician's patients
 * @returns {Promise<string[]>} Array of patient names
 */
async function loadPatientNames() {
  try {
    const result = await db.query(
      "SELECT name FROM users WHERE role = 'patient'"
    );
    return result.rows.map(r => r.name);
  } catch (error) {
    console.error('Failed to load patient names for PHI stripping:', error.message);
    return [];
  }
}

/**
 * Strip PHI from a message, auto-loading patient names from DB
 * @param {string} message - Raw message
 * @returns {Promise<{ cleaned: string, phiDetected: number }>}
 */
async function stripPhiWithLookup(message) {
  const patientNames = await loadPatientNames();
  return stripPhi(message, patientNames);
}

module.exports = { stripPhi, stripPhiWithLookup, loadPatientNames };
