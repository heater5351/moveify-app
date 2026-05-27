/**
 * End-to-end handout demo (no network).
 *
 * The ONLY external piece — the Bedrock LLM call — is simulated here with a
 * hand-written stand-in for what the model would extract from the transcript.
 * Everything downstream runs the REAL code: groundClinicalContext (normative
 * grounding) + generateHandoutDocx (the shipped DOCX renderer).
 *
 * Run: node backend/scripts/e2e-handout-demo.js
 */
const fs = require('fs');
const path = require('path');
const { groundClinicalContext } = require('../services/scribe-llm');
const { generateHandoutDocx } = require('../services/scribe-handout-docx');

// ── 1. Dummy transcript (what the EP would dictate) ─────────────────────────
const TRANSCRIPT = `
Gateway assessment, Margaret, 67 year old female. Main concern is right knee pain
for about eight months, worse going down stairs and getting out of a low chair.
Used to walk the dog daily, stopped because of the knee and feeling unsteady.
Goal is to get back to walking and to lift her grandkids without worrying.
Objective: right knee flexion 118 degrees, left 140. Grip strength right hand 19 kg.
30 second sit to stand 9 reps. Comfortable gait speed 0.78 m/s over 4 metres.
Five times sit to stand 16.5 seconds. Single leg calf raise left 8, right 15.
Timed up and go 12.5 seconds. Resting BP 152 over 94. Fasting glucose 6.4.
Single leg stance 6 seconds. Plan: 6 week strengthening block, refer to GP re BP.
`;

// ── 2. SIMULATED Bedrock output ─────────────────────────────────────────────
// Stand-in for generateHandout()'s two LLM calls. In production these come from
// DeepSeek; here we hand-write a plausible result so the rest runs for real.
const simulatedSections = {
  whatsGoingOn:
    '- Your right knee has been sore for about eight months.\n' +
    '- Stairs and getting out of low chairs are the hardest moments.\n' +
    '- We found reduced knee bend and lower leg strength on the right side.\n' +
    '- You have also been feeling unsteady on your feet.',
  ourAims:
    '- Get you back to walking the dog comfortably.\n' +
    '- Build the strength to lift your grandkids with confidence.\n' +
    '- Improve your balance so you feel steady.',
  howWeGetThere:
    '- Progressive strengthening for the knee, hip and calf.\n' +
    '- Balance work to rebuild steadiness and confidence.\n' +
    '- Gradually loading the knee so it tolerates stairs again.',
  whatToExpect:
    '- An early phase focused on control and building a base.\n' +
    '- A progress phase adding load and challenge.\n' +
    '- A reassessment to measure your progress objectively.',
  // Raw extracted rows — interpretation is the MODEL's own wording, which the
  // grounding step replaces wherever a test is recognised.
  clinicalContext:
    'Knee Flexion ROM | 118 degrees | reduced knee bend may limit stair descent and squatting\n' +
    'Grip Strength | 19 kg | reduced hand and overall strength\n' +
    '30 Second Sit to Stand | 9 reps | reduced lower-limb strength endurance\n' +
    'Gait Speed | 0.78 m/s | slower than a typical comfortable pace\n' +
    'Five Times Sit to Stand | 16.5 s | slow rising from a chair\n' +
    'Single Leg Calf Raise | L 8 / R 15 | calf endurance deficit on the left\n' +
    'Timed Up and Go | 12.5 s | mobility and turning are slowed\n' +
    'Blood Pressure | 152/94 | elevated blood pressure reading\n' +
    'Fasting Glucose | 6.4 mmol/L | slightly above the normal range\n' +
    'Single Leg Stance | 6 s | reduced single-leg balance',
};

// ── 3. Patient demographics (would come from users table via Cliniko sync) ──
const AGE = 67;
const SEX = 'female';

// ── 4. REAL grounding step ──────────────────────────────────────────────────
const groundedContext = groundClinicalContext(simulatedSections.clinicalContext, AGE, SEX);

console.log('TRANSCRIPT (input):\n' + TRANSCRIPT.trim() + '\n');
console.log('═'.repeat(78));
console.log('GROUNDED ASSESSMENT ROWS (Test | Result | Interpretation):\n');
for (const line of groundedContext.split('\n')) {
  const [t, r, i] = line.split('|').map(s => s.trim());
  console.log(`• ${t}  [${r}]`);
  console.log(`    ${i}\n`);
}
console.log('═'.repeat(78));

// ── 5. REAL DOCX render ─────────────────────────────────────────────────────
(async () => {
  const buf = await generateHandoutDocx({
    patientFirstName: 'Margaret',
    assessmentDate: '27 May 2026',
    whatsGoingOn: simulatedSections.whatsGoingOn,
    ourAims: simulatedSections.ourAims,
    howWeGetThere: simulatedSections.howWeGetThere,
    whatToExpect: simulatedSections.whatToExpect,
    clinicalContext: groundedContext,
  });
  const out = path.join(__dirname, '../../e2e-handout-demo.docx');
  fs.writeFileSync(out, buf);
  console.log(`\nDOCX written: ${out} (${buf.length} bytes)`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
