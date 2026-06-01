'use strict';

const fetch = require('node-fetch');
const { getSecret } = require('../lib/secrets');
const { logger } = require('../lib/logger');

// Shard is required: https://api.[shard].cliniko.com/v1
// Default au1 — set CLINIKO_SHARD env var if your account is on a different shard
const CLINIKO_SHARD = process.env.CLINIKO_SHARD || 'au1';
const BASE_URL = `https://api.${CLINIKO_SHARD}.cliniko.com/v1`;
// Token bucket: 150 req/min (Cliniko allows 200, leaving headroom)
const RATE_LIMIT = 150;
const WINDOW_MS = 60_000;

let tokens = RATE_LIMIT;
let lastRefill = Date.now();

function consumeToken() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= WINDOW_MS) {
    tokens = RATE_LIMIT;
    lastRefill = now;
  }
  if (tokens <= 0) return false;
  tokens--;
  return true;
}

async function waitForToken() {
  while (!consumeToken()) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function clinikoRequest(path, options = {}, secretName = 'cliniko-api-key') {
  const apiKey = (await getSecret(secretName)).trim();
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');

  const delays = [1000, 2000, 4000, 8000, 16000];
  let lastErr;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    await waitForToken();

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: 'application/json',
          'User-Agent': 'MoveifyBillingWorker/1.0 (ryan@moveifyhealth.com)',
          ...(options.headers || {}),
        },
      });

      if (res.status === 429 || res.status >= 500) {
        const delay = delays[attempt];
        if (delay === undefined) throw new Error(`Cliniko ${res.status} after all retries`);
        logger.warn({ path, status: res.status, attempt }, 'Cliniko rate limit / server error — retrying');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) throw new Error(`Cliniko ${res.status} for ${path}`);
      return res.json();
    } catch (err) {
      lastErr = err;
      const delay = delays[attempt];
      if (delay === undefined) break;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

async function getPatients(since, secretName = 'cliniko-api-key') {
  const qs = since ? `?updated_at%5Bgt%5D=${encodeURIComponent(since)}&per_page=100` : '?per_page=100';
  return clinikoRequest(`/patients${qs}`, {}, secretName);
}

async function getPatient(patientId, secretName = 'cliniko-api-key') {
  return clinikoRequest(`/patients/${patientId}`, {}, secretName);
}

// Group appointment attendees. Attendance for groups is tracked here, not on
// the parent group_appointment record. Each attendee row carries an `arrived`
// boolean and links to its patient and booking.
async function getAttendeesAll(since, secretName = 'cliniko-api-key') {
  const all = [];
  let path = since
    ? `/attendees?updated_at%5Bgt%5D=${encodeURIComponent(since)}&per_page=100`
    : '/attendees?per_page=100';
  while (path) {
    const data = await clinikoRequest(path, {}, secretName);
    all.push(...(data.attendees || []));
    const next = data.links?.next;
    if (!next) break;
    path = next.startsWith(BASE_URL) ? next.slice(BASE_URL.length) : next;
  }
  return all;
}

// Group appointment cache — per-secret to avoid prod/staging cross-contamination.
const _groupApptCacheByKey = new Map();
async function getGroupAppointment(id, secretName = 'cliniko-api-key') {
  let cache = _groupApptCacheByKey.get(secretName);
  if (!cache) { cache = new Map(); _groupApptCacheByKey.set(secretName, cache); }
  if (cache.has(id)) return cache.get(id);
  const data = await clinikoRequest(`/group_appointments/${id}`, {}, secretName);
  cache.set(id, data);
  return data;
}

async function getAppointments(since, secretName = 'cliniko-api-key') {
  const qs = since ? `?updated_at%5Bgt%5D=${encodeURIComponent(since)}&per_page=100` : '?per_page=100';
  return clinikoRequest(`/appointments${qs}`, {}, secretName);
}

// Paginated variant — follows Cliniko's `links.next` cursor until exhausted.
// Returns the flat array of appointment records.
async function getAppointmentsAll(since, secretName = 'cliniko-api-key') {
  const all = [];
  let path = since
    ? `/appointments?updated_at%5Bgt%5D=${encodeURIComponent(since)}&per_page=100`
    : '/appointments?per_page=100';
  while (path) {
    const data = await clinikoRequest(path, {}, secretName);
    all.push(...(data.appointments || []));
    const next = data.links?.next;
    if (!next) break;
    path = next.startsWith(BASE_URL) ? next.slice(BASE_URL.length) : next;
  }
  return all;
}

// A single patient's individual appointments (paginated). Used by block-progress
// so we only pull the handful of active block patients, not the whole clinic.
async function getPatientAppointmentsAll(patientId, secretName = 'cliniko-api-key') {
  const all = [];
  let path = `/patients/${patientId}/appointments?per_page=100`;
  while (path) {
    const data = await clinikoRequest(path, {}, secretName);
    all.push(...(data.appointments || []));
    const next = data.links?.next;
    if (!next) break;
    path = next.startsWith(BASE_URL) ? next.slice(BASE_URL.length) : next;
  }
  return all;
}

// A single patient's group attendances (paginated), filtered server-side by
// patient_id. Each attendee carries an `arrived` flag + a booking/group link.
async function getPatientAttendeesAll(patientId, secretName = 'cliniko-api-key') {
  const all = [];
  let path = `/attendees?q[]=patient_id:=${encodeURIComponent(patientId)}&per_page=100`;
  while (path) {
    const data = await clinikoRequest(path, {}, secretName);
    all.push(...(data.attendees || []));
    const next = data.links?.next;
    if (!next) break;
    path = next.startsWith(BASE_URL) ? next.slice(BASE_URL.length) : next;
  }
  return all;
}

async function getInvoices(since, secretName = 'cliniko-api-key') {
  const qs = since ? `?updated_at%5Bgt%5D=${encodeURIComponent(since)}&per_page=100` : '?per_page=100';
  return clinikoRequest(`/invoices${qs}`, {}, secretName);
}

async function getPayments(since, secretName = 'cliniko-api-key') {
  const qs = since ? `?updated_at%5Bgt%5D=${encodeURIComponent(since)}&per_page=100` : '?per_page=100';
  return clinikoRequest(`/payments${qs}`, {}, secretName);
}

async function createInvoice(patientId, lineItems) {
  return clinikoRequest('/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: patientId, line_items: lineItems }),
  });
}

async function createPayment(invoiceId, amount, note) {
  return clinikoRequest('/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId, amount, note }),
  });
}

// Credit payment — not attached to any invoice, becomes account credit on patient file
async function createCreditPayment(patientId, amount, note) {
  return clinikoRequest('/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: patientId, amount, note }),
  });
}

// Appointment-attached invoice
async function createAppointmentInvoice(patientId, appointmentId, lineItems) {
  return clinikoRequest('/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: patientId, appointment_id: appointmentId, line_items: lineItems }),
  });
}

// In-memory cache for appointment types — keyed per secret so prod/staging
// instance IDs (which may collide numerically) don't cross-contaminate.
const _apptTypeCacheByKey = new Map();

async function getAppointmentType(typeId, secretName = 'cliniko-api-key') {
  let cache = _apptTypeCacheByKey.get(secretName);
  if (!cache) {
    cache = new Map();
    _apptTypeCacheByKey.set(secretName, cache);
  }
  if (cache.has(typeId)) return cache.get(typeId);
  const data = await clinikoRequest(`/appointment_types/${typeId}`, {}, secretName);
  cache.set(typeId, data);
  return data;
}

// Search patients by email in Cliniko
async function findPatientByEmail(email) {
  const res = await clinikoRequest(`/patients?q[]=email:=${encodeURIComponent(email)}&per_page=10`);
  return (res.patients || []);
}

// ─── Referral patient management ─────────────────────────────────────────────

/**
 * Searches Cliniko for a patient by DOB + last name (Ransack predicates).
 * Handles nickname differences (Harry↔Harrison) by accepting a DOB+last-name
 * match even when the first name differs. Returns matching patient or null.
 * PHI is never included in thrown error messages or logs.
 */
async function searchPatientByNameDob(firstName, lastName, dobIso) {
  if (!dobIso || !/^\d{4}-\d{2}-\d{2}$/.test(dobIso)) {
    logger.warn({ dobFormat: dobIso ? 'invalid' : 'missing' }, 'Patient search skipped — no valid DOB extracted from referral');
    return null;
  }

  // Strip apostrophes/hyphens/whitespace — Cliniko stores names verbatim and the
  // raw value (e.g. "O'Brien", "Smith-Jones") sometimes triggers HTTP 400 or
  // misses records that were entered without the punctuation.
  const normalize = (s) => (s || '').replace(/[\s'`\-]/g, '').toLowerCase();
  const lastNorm = normalize(lastName);

  // First attempt: DOB only — small result set we filter client-side by
  // normalized last name. Avoids encoding edge cases on the Ransack predicate.
  let patients;
  try {
    const qs = `q[]=date_of_birth:=${encodeURIComponent(dobIso)}&per_page=50`;
    const res = await clinikoRequest(`/patients?${qs}`);
    patients = (res.patients || []).filter((p) => normalize(p.last_name) === lastNorm);
  } catch (err) {
    const status = err.message.match(/Cliniko (\d+)/)?.[1] || 'unknown';
    throw new Error(`Cliniko patient search failed (HTTP ${status})`);
  }

  if (patients.length === 0) return null;
  if (patients.length === 1) return patients[0];

  // Multiple patients share the same DOB + last name — disambiguate by first name.
  // Accept if either name is a prefix of the other (min 3 chars) to handle
  // nickname/legal name differences e.g. Harry↔Harrison, Nick↔Nicholas.
  const firstLower = firstName.toLowerCase().trim();
  const match = patients.find((p) => {
    const pFirst = (p.first_name || '').toLowerCase().trim();
    const minLen = Math.min(pFirst.length, firstLower.length);
    return minLen >= 3 && pFirst.substring(0, minLen) === firstLower.substring(0, minLen);
  });

  if (match) return match;

  // Still ambiguous — log count only (no PHI) and return null for manual review
  logger.warn({ count: patients.length }, 'Multiple patients match DOB + last name — flagging for review');
  return null;
}

/**
 * Creates a new patient in Cliniko from extracted referral data.
 * All fields are optional except first_name and last_name.
 * date_of_birth must be YYYY-MM-DD if provided.
 */
async function createPatient(data) {
  const body = {
    first_name: data.first_name,
    last_name:  data.last_name,
    ...(data.date_of_birth   && { date_of_birth: data.date_of_birth }),
    ...(data.medicare_number && { medicare: data.medicare_number }),
    ...(data.address         && { address_1: data.address }),
    ...(data.suburb          && { city: data.suburb }),
    ...(data.state           && { state: data.state }),
    ...(data.postcode        && { post_code: data.postcode }),
    ...(data.phone           && {
      patient_phone_numbers: [{ number: data.phone, phone_type: 'Mobile' }],
    }),
  };

  return clinikoRequest('/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Patches missing fields on an existing Cliniko patient with newly extracted
 * referral data. Only fills fields that are blank on the existing record —
 * never overwrites data already in Cliniko. Returns the field names patched
 * (no values, to keep PHI out of logs).
 */
async function updatePatientMissingFields(patientId, existing, extracted) {
  const body = {};
  const filled = [];

  const setIf = (key, existingVal, newVal) => {
    if (newVal && !(existingVal && String(existingVal).trim())) {
      body[key] = newVal;
      filled.push(key);
    }
  };

  setIf('date_of_birth', existing.date_of_birth, extracted.date_of_birth);
  setIf('medicare',      existing.medicare,      extracted.medicare_number);
  setIf('address_1',     existing.address_1,     extracted.address);
  setIf('city',          existing.city,          extracted.suburb);
  setIf('state',         existing.state,         extracted.state);
  setIf('post_code',     existing.post_code,     extracted.postcode);

  const hasPhone = Array.isArray(existing.patient_phone_numbers) && existing.patient_phone_numbers.length > 0;
  if (extracted.phone && !hasPhone) {
    body.patient_phone_numbers = [{ number: extracted.phone, phone_type: 'Mobile' }];
    filled.push('phone');
  }

  if (Object.keys(body).length === 0) return { filled: [] };

  await clinikoRequest(`/patients/${patientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { filled };
}

/**
 * Appends a note to the patient's notes field in Cliniko.
 * Reads existing notes first to avoid overwriting them.
 */
async function addPatientNote(patientId, content) {
  const patient = await clinikoRequest(`/patients/${patientId}`);
  const existing = (patient.notes || '').trim();
  const updated = existing ? `${existing}\n\n${content}` : content;
  return clinikoRequest(`/patients/${patientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: updated }),
  });
}

/**
 * Writes the block-progress one-liner into the patient's `appointment_notes`
 * field — the patient-level field Cliniko surfaces on the booking screen.
 *
 * Rewrites ONLY the `[BLOCK] …` delimited line, preserving any manual clinical
 * alert the front desk has typed. GET-then-PATCH (like addPatientNote). Skips
 * the write when the line is unchanged. Returns { changed: boolean }.
 *
 * `appointment_notes` is a writable Patient attribute (confirmed against the
 * Cliniko API). This uses the admin (full-access) key — the finance key is
 * read-only. The block line is a session-count summary, not health data.
 */
async function updateBlockProgressNote(patientId, blockLine) {
  const { spliceBlockLine } = require('../lib/block-bundles');
  const patient = await clinikoRequest(`/patients/${patientId}`);
  const updated = spliceBlockLine(patient.appointment_notes, blockLine);
  if (updated === null) return { changed: false };
  await clinikoRequest(`/patients/${patientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointment_notes: updated }),
  });
  return { changed: true };
}

/**
 * Uploads a PDF to Cliniko as a patient attachment.
 * Flow: get presigned S3 URL from Cliniko → POST file to S3 → register attachment.
 * Builds multipart/form-data manually to ensure correct Content-Type boundary for S3.
 */
async function uploadPatientAttachment(patientId, pdfBuffer, filename) {
  // Step 1: Get presigned POST details from Cliniko
  const presigned = await clinikoRequest(`/patients/${patientId}/attachment_presigned_post`);

  // Step 2: Build multipart body manually — S3 requires file field to be last
  const boundary = `----MoveifyBoundary${Date.now().toString(36)}`;
  const CRLF = '\r\n';
  const fieldParts = Object.entries(presigned.fields).map(([k, v]) =>
    `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`
  );
  const filePreamble = `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: application/pdf${CRLF}${CRLF}`;
  const closing = `${CRLF}--${boundary}--${CRLF}`;

  const body = Buffer.concat([
    Buffer.from(fieldParts.join('')),
    Buffer.from(filePreamble),
    pdfBuffer,
    Buffer.from(closing),
  ]);

  const s3Res = await fetch(presigned.url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (s3Res.status !== 201) {
    const text = await s3Res.text().catch(() => '');
    throw new Error(`S3 upload failed: ${s3Res.status} ${text.slice(0, 200)}`);
  }

  // Step 3: Extract Key from S3 XML response → build upload_url
  const xml = await s3Res.text();
  const keyMatch = xml.match(/<Key>([\s\S]*?)<\/Key>/);
  if (!keyMatch) throw new Error('No Key in S3 XML response');
  const uploadUrl = presigned.url.replace(/\/$/, '') + '/' + keyMatch[1];

  // Step 4: Register the attachment record in Cliniko
  return clinikoRequest('/patient_attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patient_id: patientId,
      upload_url: uploadUrl,
      description: 'GP Referral (auto-imported)',
    }),
  });
}

// ─── Referring doctor contacts ────────────────────────────────────────────────

// Parse "Dr John Smith" or "John Smith" → { first_name, last_name }
function parseReferrerName(fullName) {
  const cleaned = (fullName || '').replace(/^(Dr\.?|Prof\.?|Mr\.?|Mrs\.?|Ms\.?)\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return null;
  if (parts.length === 1) return { first_name: '', last_name: parts[0] };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

/**
 * Finds an existing contact by provider number, or creates one.
 * Returns the contact object (with .id), or null if no name was extracted.
 * No PHI in logs — only the Cliniko contact ID is logged on success.
 */
async function findOrCreateReferrerContact(data) {
  const name = parseReferrerName(data.referring_doctor);
  if (!name || !name.last_name) return null;

  let existing = null;

  // Search by provider number first (most reliable GP identifier)
  if (data.provider_number) {
    try {
      const res = await clinikoRequest(
        `/contacts?q[]=provider_number:=${encodeURIComponent(data.provider_number)}&per_page=5`
      );
      existing = (res.contacts || [])[0] || null;
    } catch {
      // Contact search failure is non-fatal — fall through to name search
    }
  }

  // Fallback: search by last name and match on first-name prefix.
  // Avoids creating duplicates when the referral has no provider number or the
  // existing record was created by a previous run without one.
  if (!existing) {
    try {
      const res = await clinikoRequest(
        `/contacts?q[]=last_name:=${encodeURIComponent(name.last_name)}&per_page=20`
      );
      const firstLower = (name.first_name || '').toLowerCase().trim();
      existing = (res.contacts || []).find((c) => {
        const cFirst = (c.first_name || '').toLowerCase().trim();
        if (!firstLower || !cFirst) return false;
        const minLen = Math.min(cFirst.length, firstLower.length);
        return minLen >= 3 && cFirst.substring(0, minLen) === firstLower.substring(0, minLen);
      }) || null;
    } catch {
      // Non-fatal — fall through to create
    }
  }

  if (existing) {
    // Patch any fields the existing record is missing — never overwrite.
    const patch = {};
    if (data.provider_number             && !existing.provider_number) patch.provider_number = data.provider_number;
    if (data.referring_practice          && !existing.company_name)    patch.company_name    = data.referring_practice;
    if (data.referring_practice_address  && !existing.address_1)       patch.address_1       = data.referring_practice_address;
    if (data.referring_practice_suburb   && !existing.city)            patch.city            = data.referring_practice_suburb;
    if (data.referring_practice_state    && !existing.state)           patch.state           = data.referring_practice_state;
    if (data.referring_practice_postcode && !existing.post_code)       patch.post_code       = data.referring_practice_postcode;
    if (Object.keys(patch).length > 0) {
      try {
        await clinikoRequest(`/contacts/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch {
        // Non-fatal — return the existing contact regardless
      }
    }
    return existing;
  }

  // Create new contact
  const body = {
    title:         'Dr',
    first_name:    name.first_name || 'Unknown',
    last_name:     name.last_name,
    country_code:  'AU',
    doctor_type:   'general_practitioner',
    ...(data.provider_number             && { provider_number: data.provider_number }),
    ...(data.referring_practice          && { company_name:    data.referring_practice }),
    ...(data.referring_practice_address  && { address_1:       data.referring_practice_address }),
    ...(data.referring_practice_suburb   && { city:            data.referring_practice_suburb }),
    ...(data.referring_practice_state    && { state:           data.referring_practice_state }),
    ...(data.referring_practice_postcode && { post_code:       data.referring_practice_postcode }),
  };

  const created = await clinikoRequest('/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return created;
}

/**
 * Sets the referring doctor on an existing patient record (PATCH).
 */
async function setPatientReferringDoctor(patientId, contactId) {
  return clinikoRequest(`/patients/${patientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referring_doctor_id: String(contactId) }),
  });
}

// Two-namespace export — keeps the administrative pipeline (referrals: writes
// to patients/contacts/attachments) on a distinct API key from the financial
// pipeline (appointment poller, sync, reconcile: read-only). The two keys are
// declared in `lib/secrets.js`:
//   - cliniko-api-key-admin   → full-access Cliniko user (writes)
//   - cliniko-api-key-finance → read-only Cliniko user (reads)
// Initially both can point at the same GCP secret. Once the read-only Cliniko
// user is provisioned and CLINIKO_API_KEY_FINANCE is populated, the finance
// namespace is physically incapable of writing — Cliniko returns 403 on writes.
//
// Admin functions default to 'cliniko-api-key' (which maps to the same target
// as -admin) — leaving the default keeps backwards compatibility with any
// legacy call paths while the explicit namespace makes intent obvious.

module.exports = {
  admin: {
    // Reads used during the referrals lookup phase
    searchPatientByNameDob,
    findPatientByEmail,
    // Writes — patients, doctor contacts, attachments, notes
    createPatient,
    updatePatientMissingFields,
    addPatientNote,
    updateBlockProgressNote,
    uploadPatientAttachment,
    findOrCreateReferrerContact,
    setPatientReferringDoctor,
    // Legacy: Cliniko's invoice/payment API is read-only, these will 422/403
    // in practice but are retained for any old call sites still wired up.
    createInvoice,
    createPayment,
    createCreditPayment,
    createAppointmentInvoice,
  },
  finance: {
    getPatients:         (since) => getPatients(since, 'cliniko-api-key-finance'),
    getPatient:          (id) => getPatient(id, 'cliniko-api-key-finance'),
    getAppointments:     (since) => getAppointments(since, 'cliniko-api-key-finance'),
    getAppointmentsAll:  (since) => getAppointmentsAll(since, 'cliniko-api-key-finance'),
    getAppointmentType:  (id) => getAppointmentType(id, 'cliniko-api-key-finance'),
    getInvoices:         (since) => getInvoices(since, 'cliniko-api-key-finance'),
    getPayments:         (since) => getPayments(since, 'cliniko-api-key-finance'),
    getAttendeesAll:     (since) => getAttendeesAll(since, 'cliniko-api-key-finance'),
    getGroupAppointment: (id) => getGroupAppointment(id, 'cliniko-api-key-finance'),
    getPatientAppointmentsAll: (id) => getPatientAppointmentsAll(id, 'cliniko-api-key-finance'),
    getPatientAttendeesAll:    (id) => getPatientAttendeesAll(id, 'cliniko-api-key-finance'),
  },
};
