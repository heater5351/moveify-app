const CLINIKO_API_KEY = process.env.CLINIKO_API_KEY;
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
  const q = encodeURIComponent(query);
  const data = await clinikoFetch(
    `/patients?q[first_name_cont]=${q}&q[last_name_cont]=${q}&q[m]=or&sort=last_name`
  );
  return data.patients || [];
}

async function getPatient(clinikoPatientId) {
  return clinikoFetch(`/patients/${clinikoPatientId}`);
}

module.exports = { searchPatients, getPatient };
