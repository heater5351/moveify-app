const CLINIKO_API_KEY = process.env.NODE_ENV === 'production'
  ? process.env.CLINIKO_API_KEY
  : process.env.CLINIKO_API_KEY_STAGING;
const CLINIKO_SUBDOMAIN = process.env.CLINIKO_SUBDOMAIN;

function getAuthHeader() {
  return 'Basic ' + Buffer.from(`${CLINIKO_API_KEY}:`).toString('base64');
}

async function clinikoFetch(path) {
  const url = `https://api.${CLINIKO_SUBDOMAIN}.cliniko.com/v1${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: 'application/json',
      'User-Agent': 'Moveify/1.0 (support@moveifyhealth.com)',
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

module.exports = { searchPatients, getPatient };
