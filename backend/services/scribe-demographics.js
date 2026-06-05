/**
 * Patient age/sex lookup for normative-data grounding, shared by the handout and
 * reassessment routes so both behave identically (incl. the best-effort Cliniko
 * backfill). Returns {} when unknown so generation falls back to age/sex-agnostic
 * norms. Never logs patient values.
 */
const db = require('../database/db');
const cliniko = require('./cliniko');

// Derive age (years) from a DOB. Returns null when unknown/implausible.
function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

async function getPatientDemographics(patientId) {
  if (!patientId) return {};
  try {
    const r = await db.query('SELECT dob, sex, cliniko_patient_id FROM users WHERE id = $1', [patientId]);
    if (r.rows.length === 0) return {};
    let { dob, sex, cliniko_patient_id } = r.rows[0];

    // Auto-backfill from Cliniko when age/sex is missing, so normative grounding
    // works without anyone running a manual sync. Best-effort: any failure leaves
    // existing values untouched and never blocks generation.
    if ((!sex || !dob) && cliniko_patient_id) {
      try {
        const cp = await cliniko.getPatient(cliniko_patient_id);
        const cSex = cp.sex || null;
        const cDob = cp.date_of_birth || null;
        if ((cSex && !sex) || (cDob && !dob)) {
          // COALESCE so we only ever fill blanks, never overwrite real data.
          await db.query(
            'UPDATE users SET sex = COALESCE(sex, $1), dob = COALESCE(dob, $2), cliniko_synced_at = NOW() WHERE id = $3',
            [cSex, cDob, patientId]
          );
          sex = sex || cSex;
          dob = dob || cDob;
        }
      } catch { /* Cliniko unreachable/unlinked — fall back to what we have. */ }
    }

    return { age: ageFromDob(dob), sex: sex || null };
  } catch {
    return {};
  }
}

module.exports = { getPatientDemographics, ageFromDob };
