// Pure helpers that map a patient's report-recipient contact (from the shared
// contacts directory) and/or an uploaded previous report into the GP letter's
// recipient block. No DB/IO here so the precedence rules stay unit-testable.

// Map a directory contact row to the letter's recipient fields. Returns null
// when there is no contact (so the caller can fall back cleanly).
function contactToLetterMeta(contact) {
  if (!contact) return null;
  return {
    gpName: contact.name || '',
    practiceName: contact.organisation || '',
    practiceAddress: contact.address || '',
    practiceEmail: contact.email || '',
  };
}

// Merge the directory base with fields parsed from an uploaded previous report.
// Per-field, a non-empty value from the uploaded report wins over the directory
// base (the clinician explicitly supplied that report). Patient name/DOB only
// ever come from the uploaded report.
function mergeLetterMeta(base, overlay) {
  const b = base || {};
  const o = overlay || {};
  const pick = (k) => (o[k] && String(o[k]).trim() ? o[k] : (b[k] || ''));
  return {
    gpName: pick('gpName'),
    practiceName: pick('practiceName'),
    practiceAddress: pick('practiceAddress'),
    practiceEmail: pick('practiceEmail'),
    patientName: o.patientName || '',
    dob: o.dob || '',
  };
}

module.exports = { contactToLetterMeta, mergeLetterMeta };
