// GCS-backed patient file store. Object bytes live in a bucket in
// australia-southeast1 (Australian Privacy Act data-residency requirement); the
// patient_files table holds only metadata + the object key.
//
// Gated behind the PATIENT_FILES_BUCKET env var — when it is unset the Files
// feature degrades to a "not configured" state instead of crashing (mirrors the
// graceful-degradation pattern used elsewhere, e.g. Turnstile on the website).
//
// Downloads stream THROUGH the authenticated backend (see routes/patient-files.js)
// rather than via public/signed URLs, so every PHI access is access-controlled
// and audit-logged, and no object-signing capability is required of the runtime
// service account.
const { Storage } = require('@google-cloud/storage');

let bucket = null;
let triedInit = false;

function getBucket() {
  if (triedInit) return bucket;
  triedInit = true;
  const name = (process.env.PATIENT_FILES_BUCKET || '').trim();
  if (!name) {
    console.warn('PATIENT_FILES_BUCKET not set — patient Files feature disabled');
    return null;
  }
  // ADC = the Cloud Run runtime service account; it needs roles/storage.objectAdmin
  // (or objectUser) on this bucket. No key-signing permission is required.
  bucket = new Storage().bucket(name);
  return bucket;
}

function isConfigured() {
  return !!getBucket();
}

async function saveObject(key, buffer, contentType) {
  const b = getBucket();
  if (!b) throw new Error('Patient file storage not configured');
  await b.file(key).save(buffer, {
    contentType: contentType || 'application/octet-stream',
    resumable: false,
    metadata: { cacheControl: 'private, max-age=0, no-store' },
  });
}

function createReadStream(key) {
  const b = getBucket();
  if (!b) throw new Error('Patient file storage not configured');
  return b.file(key).createReadStream();
}

async function deleteObject(key) {
  const b = getBucket();
  if (!b) throw new Error('Patient file storage not configured');
  await b.file(key).delete({ ignoreNotFound: true });
}

module.exports = { isConfigured, saveObject, createReadStream, deleteObject };
