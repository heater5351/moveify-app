/**
 * Scaffolds an edge-case test program on staging to stress-test the PDF export.
 *
 * Exercises chosen to cover:
 *   - duration-type (Wall Sit)
 *   - cardio-type (Recumbent Cycling) — no poster, tests cardio prescription line
 *   - apostrophe in name (Child's Pose) — tests text escaping
 *   - very long clinician notes (~250 words) — tests text wrapping + page-break
 *   - custom exercise not in library — tests missing cues + placeholder image
 *   - warm-up section + main section — tests warm-up grouping
 *   - exercise with NO instructions but cues present — tests cues-only render
 *   - normal reps exercise — tests baseline
 *
 * Usage:
 *   set MOVEIFY_EMAIL=ryan@moveifyhealth.com
 *   set MOVEIFY_PASSWORD=...
 *   node scripts/scaffold-pdf-edge-case-program.mjs               # picks first "test" patient
 *   node scripts/scaffold-pdf-edge-case-program.mjs --list        # list patients to choose from
 *   node scripts/scaffold-pdf-edge-case-program.mjs --patient=42  # specific patient id
 */

const API = 'https://moveify-backend-staging-alcprcunba-ts.a.run.app/api';

const argv = process.argv.slice(2);
const LIST_ONLY = argv.includes('--list');
const PATIENT_ARG = argv.find(a => a.startsWith('--patient='));
const FORCED_PATIENT_ID = PATIENT_ARG ? Number(PATIENT_ARG.split('=')[1]) : null;

const EMAIL = process.env.MOVEIFY_EMAIL;
const PASSWORD = process.env.MOVEIFY_PASSWORD;
const TOKEN = process.env.MOVEIFY_TOKEN;

if (!TOKEN && (!EMAIL || !PASSWORD)) {
  console.error('Provide MOVEIFY_TOKEN OR both MOVEIFY_EMAIL and MOVEIFY_PASSWORD.');
  process.exit(1);
}

const LONG_INSTRUCTIONS = `This is a deliberately long clinician note to stress-test how the PDF handles wrapping and page breaks under a single exercise row. Focus on the descent: keep the chest proud, ribs stacked over the pelvis, and the bar travelling vertically over the mid-foot. If you feel any sharp pinch in the front of the hip, pause and reset — do not push through pain. For your home setup, place a chair behind you as a depth cue so you do not have to think about how low to go. Aim for a tempo of three seconds down, one second pause, one second up. Breathe in on the way down, brace through the bottom, exhale as you stand. If the load feels too heavy on day one, drop to bodyweight and add load by week two only when you can complete all sets without rounding the lower back. Track this exercise in your weekly journal: note whether the descent felt symmetrical, whether either knee drifted inward, and how the lift sat overall on a 0-10 RPE scale. We will adjust at our next appointment.`;

async function api(path, opts = {}, token) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

const exerciseRow = (overrides) => ({
  name: '',
  category: 'Musculoskeletal',
  sets: 3,
  reps: 10,
  prescribedWeight: 0,
  holdTime: '',
  instructions: '',
  image: '',
  prescribedDuration: null,
  restDuration: null,
  isWarmup: false,
  ...overrides,
});

const EXERCISES = [
  // Warm-up — known library exercise with poster
  exerciseRow({
    name: 'Romanian Deadlift with Barbell',
    sets: 2, reps: 8, prescribedWeight: 30,
    isWarmup: true,
    instructions: 'Light warm-up set. Focus on the hip hinge.',
  }),
  // Normal reps exercise, has poster + cues
  exerciseRow({
    name: 'Back Squat with Barbell',
    sets: 4, reps: 6, prescribedWeight: 60,
  }),
  // Duration-type — has poster, tests "sets x duration" prescription line
  exerciseRow({
    name: 'Wall Sit with Bodyweight',
    sets: 3, reps: 0,
    prescribedDuration: 45, // seconds
    restDuration: 60,
  }),
  // Cardio — no poster, tests "as prescribed" / duration-only prescription
  exerciseRow({
    name: 'Recumbent Cycling',
    sets: 1, reps: 0,
    prescribedDuration: 600, // 10 minutes
  }),
  // Apostrophe in name — tests text escaping
  exerciseRow({
    name: "Child's Pose",
    sets: 1, reps: 0,
    prescribedDuration: 60,
    instructions: 'Hold for one full minute. Breathe slowly.',
  }),
  // Very long clinician notes — tests wrapping + page break behavior
  exerciseRow({
    name: 'Squat with Bodyweight',
    sets: 3, reps: 12,
    instructions: LONG_INSTRUCTIONS,
  }),
  // Custom exercise NOT in library — should show placeholder image + no cues
  exerciseRow({
    name: 'Custom Made-Up Test Exercise',
    sets: 3, reps: 10,
    instructions: 'Custom exercise — should render placeholder image and no library cues.',
  }),
  // Has poster, NO instructions — tests cues-only rendering
  exerciseRow({
    name: 'Forward Lunge with Bodyweight',
    sets: 3, reps: 10,
  }),
];

async function main() {
  let token = TOKEN;
  if (!token) {
    console.log('Logging in...');
    const login = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    token = login.token;
  } else {
    console.log('Using provided MOVEIFY_TOKEN.');
  }

  console.log('Fetching patients...');
  const patientsRes = await api('/patients', {}, token);
  const patients = Array.isArray(patientsRes) ? patientsRes : patientsRes.patients || [];

  if (LIST_ONLY) {
    for (const p of patients) console.log(`  ${p.id}\t${p.name}\t${p.email || ''}`);
    return;
  }

  let patient;
  if (FORCED_PATIENT_ID) {
    patient = patients.find(p => p.id === FORCED_PATIENT_ID);
    if (!patient) throw new Error(`Patient id ${FORCED_PATIENT_ID} not found`);
  } else {
    patient = patients.find(p => /test/i.test(p.name)) || patients[0];
  }
  console.log(`Target patient: ${patient.id} — ${patient.name}`);

  const config = {
    startDate: 'today',
    customStartDate: '',
    frequency: ['Mon', 'Wed', 'Fri'],
    duration: '4weeks',
    customEndDate: '',
    trackActualPerformance: true,
    trackRpe: true,
    trackPainLevel: true,
  };

  console.log(`Creating edge-case program with ${EXERCISES.length} exercises...`);
  const result = await api(`/programs/patient/${patient.id}`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'PDF Edge-Case Stress Test',
      exercises: EXERCISES,
      config,
    }),
  }, token);

  console.log(`✓ Created program id ${result.programId} for patient ${patient.name}`);
  console.log(`  Now open the patient in staging and click Download PDF on this program.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
