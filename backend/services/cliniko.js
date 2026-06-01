// .trim() guards against a trailing newline in the Secret Manager value, which
// would corrupt the Basic-auth header and yield a 401 (Secret Manager secrets
// created via `echo` commonly carry one). The billing-worker trims for the same reason.
const CLINIKO_API_KEY = ((process.env.NODE_ENV === 'production'
  ? process.env.CLINIKO_API_KEY
  : process.env.CLINIKO_API_KEY_STAGING) || '').trim();
const CLINIKO_SUBDOMAIN = (process.env.CLINIKO_SUBDOMAIN || '').trim();

function getAuthHeader() {
  return 'Basic ' + Buffer.from(`${CLINIKO_API_KEY}:`).toString('base64');
}

const BASE_URL = () => `https://api.${CLINIKO_SUBDOMAIN}.cliniko.com/v1`;

async function clinikoFetch(path, options = {}) {
  const url = `${BASE_URL()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      Accept: 'application/json',
      'User-Agent': 'Moveify/1.0 (support@moveifyhealth.com)',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Cliniko API ${res.status} from ${url}:`, body);
    const err = new Error(`Cliniko API error: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Uploads a file to Cliniko as a patient attachment. Mirrors the billing-worker's
 * presigned-POST flow: get presigned S3 details → POST file to S3 → register the
 * attachment record. Writes require the admin Cliniko key (the backend's key is
 * the full-access ADMIN key in prod/staging). Generic over content type so it can
 * store a signed-agreement PDF (or any file). Returns the registered attachment.
 */
async function uploadAttachment(patientId, fileBuffer, filename, contentType, description) {
  // Step 1: presigned POST details from Cliniko
  const presigned = await clinikoFetch(`/patients/${patientId}/attachment_presigned_post`);

  // Step 2: build multipart body manually — S3 requires the file field last
  const boundary = `----MoveifyBoundary${Date.now().toString(36)}`;
  const CRLF = '\r\n';
  const fieldParts = Object.entries(presigned.fields).map(([k, v]) =>
    `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`
  );
  const filePreamble = `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${contentType}${CRLF}${CRLF}`;
  const closing = `${CRLF}--${boundary}--${CRLF}`;
  const body = Buffer.concat([
    Buffer.from(fieldParts.join('')),
    Buffer.from(filePreamble),
    fileBuffer,
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

  // Step 3: extract Key from S3 XML → build upload_url
  const xml = await s3Res.text();
  const keyMatch = xml.match(/<Key>([\s\S]*?)<\/Key>/);
  if (!keyMatch) throw new Error('No Key in S3 XML response');
  const uploadUrl = presigned.url.replace(/\/$/, '') + '/' + keyMatch[1];

  // Step 4: register the attachment record
  return clinikoFetch('/patient_attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: patientId, upload_url: uploadUrl, description }),
  });
}

async function searchPatients(query) {
  const parts = query.trim().split(/\s+/);
  if (parts.length >= 2) {
    // "John Smith" — search first_name AND last_name (single call)
    const first = encodeURIComponent(parts[0]);
    const last = encodeURIComponent(parts.slice(1).join(' '));
    const data = await clinikoFetch(`/patients?q[]=first_name:~${first}&q[]=last_name:~${last}&sort=last_name`);
    return data.patients || [];
  }
  // Single word — search first_name and last_name separately then merge (Cliniko has no OR)
  const q = encodeURIComponent(query);
  const [byFirst, byLast] = await Promise.all([
    clinikoFetch(`/patients?q[]=first_name:~${q}&sort=last_name`).then(d => d.patients || []),
    clinikoFetch(`/patients?q[]=last_name:~${q}&sort=last_name`).then(d => d.patients || []),
  ]);
  const seen = new Set();
  return [...byFirst, ...byLast].filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

async function getPatient(clinikoPatientId) {
  return clinikoFetch(`/patients/${clinikoPatientId}`);
}

// Incrementally fetch patients modified since `since` (ISO timestamp), following
// Cliniko's `links.next` cursor until exhausted. Returns the flat array of patient
// records. Pass a falsy `since` to pull all patients (first-run / full backfill).
// Filters with the Ransack predicate updated_at[gt]= so only changed records come back.
async function getPatientsUpdatedSince(since) {
  const all = [];
  let path = since
    ? `/patients?updated_at%5Bgt%5D=${encodeURIComponent(since)}&per_page=100`
    : '/patients?per_page=100';
  while (path) {
    const data = await clinikoFetch(path);
    all.push(...(data.patients || []));
    const next = data.links?.next;
    if (!next) break;
    const base = BASE_URL();
    path = next.startsWith(base) ? next.slice(base.length) : next;
  }
  return all;
}

module.exports = { searchPatients, getPatient, getPatientsUpdatedSince, uploadAttachment };
