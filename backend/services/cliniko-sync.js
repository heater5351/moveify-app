// Shared Cliniko → Moveify patient-demographics sync logic.
//
// Single source of truth for mapping a Cliniko patient record onto a Moveify
// `users` row, used by BOTH the manual per-patient sync (routes/cliniko.js
// POST /sync/:patientId) and the scheduled auto-sync job
// (jobs/sync-cliniko-patients.js). Keeping the field mapping + UPDATE here
// guarantees the two paths stay identical.
//
// Direction is Cliniko → Moveify only. Email is NEVER synced — it is the login
// credential in Moveify and must not be overwritten. COALESCE preserves
// existing Moveify data when Cliniko has no value for a field (name is the
// exception — it is always set from Cliniko's first/last name).
const db = require('../database/db');

// Derive Moveify user fields from a Cliniko patient object.
function buildPatientFields(cp) {
  const name = `${cp.first_name || ''} ${cp.last_name || ''}`.trim();
  const dob = cp.date_of_birth || null;
  const sex = cp.sex || null;
  const phone = cp.patient_phone_numbers?.[0]?.number || null;
  const addressParts = [cp.address_1, cp.address_2, cp.address_3, cp.city, cp.state, cp.post_code]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(', ') : null;
  // PMS-enrichment fields Cliniko exposes — Cliniko owns these. Fields Cliniko
  // has no concept of (emergency contact, referring GP, private health) stay
  // Moveify-native and are not touched here. A null below is preserved by the
  // COALESCE in applySync, so a missing Cliniko value never wipes a Moveify one.
  const title = cp.title || null;
  const preferredName = cp.preferred_first_name || null;
  const occupation = cp.occupation || null;
  const medicareNumber = cp.medicare || null;
  const referralSource = cp.referral_source || null;
  const dvaNumber = cp.dva || null;
  return { name, dob, sex, phone, address, title, preferredName, occupation, medicareNumber, referralSource, dvaNumber };
}

// Apply a Cliniko patient record to a Moveify user row. Returns the fields written.
async function applySync(userId, cp) {
  const f = buildPatientFields(cp);
  await db.query(
    `UPDATE users
       SET name = $1,
           dob = COALESCE($2, dob),
           sex = COALESCE($3, sex),
           phone = COALESCE($4, phone),
           address = COALESCE($5, address),
           title = COALESCE($6, title),
           preferred_name = COALESCE($7, preferred_name),
           occupation = COALESCE($8, occupation),
           medicare_number = COALESCE($9, medicare_number),
           referral_source = COALESCE($10, referral_source),
           dva_number = COALESCE($11, dva_number),
           cliniko_synced_at = NOW()
     WHERE id = $12`,
    [f.name, f.dob, f.sex, f.phone, f.address, f.title, f.preferredName,
     f.occupation, f.medicareNumber, f.referralSource, f.dvaNumber, userId]
  );
  return f;
}

// ─── Generic key/value state store (app_state table) ─────────────────────────
// Used to persist the incremental sync cursor between scheduled runs.
async function getState(key) {
  const row = await db.getOne('SELECT value FROM app_state WHERE key = $1', [key]);
  return row ? row.value : null;
}

async function setState(key, value) {
  await db.query(
    `INSERT INTO app_state (key, value, updated_at)
       VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

module.exports = { buildPatientFields, applySync, getState, setState };
