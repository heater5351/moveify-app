/**
 * LLM service for SOAP note and handout generation via AWS Bedrock (DeepSeek V3.2).
 * Inference runs in-region in ap-southeast-2 (Sydney) — DeepSeek V3.2 is In-Region
 * only (no cross-region routing), so PHI never leaves Australia.
 */
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { interpret, buildInterpretation, matchTest, parseValue } = require('./normative-data');

const client = new BedrockRuntimeClient({ region: 'ap-southeast-2' });
const MODEL_ID = 'deepseek.v3.2';

const DEFAULT_SYSTEM_PROMPT = `You are an experienced clinical exercise physiologist scribe. Given a transcript of a patient consultation, generate a structured SOAP note following Australian allied health clinical standards.

Format the note as a single block of text with section headers:

Subjective
- Patient's reported symptoms, history of present condition, pain descriptions, functional limitations, goals, and relevant psychosocial factors. Include relevant quotes where helpful.

Objective
- Clinical findings mentioned: range of motion, strength assessments, functional tests, movement quality observations, vitals if mentioned, any outcome measures discussed.
- When a test was measured multiple times under the SAME conditions, list ALL the individual recorded values, then state the single derived figure and how it was reached. How to derive it depends on the test type:
  - Strength tests measured as repeated trials (e.g. grip strength): give the AVERAGE of the trials, e.g. "Grip Strength (Right): 28, 30, 29 kg, avg 29 kg".
  - Balance / timed-hold tests (e.g. single-leg stance, tandem stance): give the BEST (longest) valid attempt, not the average. A value labelled "Retest" is a redo of a failed or invalid attempt and replaces the earlier one, e.g. "Single Leg Stance, Left (shoes off): 0 sec, then 9 sec on retest, best 9 sec".
  Keep different conditions and different sides separate — never merge one side's or condition's value into another (shoes on vs shoes off, left vs right foot/leg, eyes open vs closed are each their own test). Show the working — do not drop the individual values in this note.

Assessment
- Clinical reasoning, working diagnosis/impression, progress since last session, contributing factors, prognosis.

Plan
- Treatment provided today, exercise prescription changes, home exercise program updates, follow-up schedule, referrals, patient education provided.

Use bullet points within each section. Use clinical terminology appropriate for exercise physiology documentation. Be concise but thorough — capture all clinically relevant information from the transcript. Do not fabricate information not present in the transcript.`;

/**
 * Assemble the user message for SOAP generation from structured context blocks.
 * Each block carries its own handling instruction (context-only vs transcribe-verbatim),
 * so the instruction survives custom per-clinician system prompts. Later phases
 * (program diffs, in-session measurements, outcome scores) slot in as new blocks here.
 */
function buildSoapUserMessage({ transcript, priorContext, programDiff }) {
  const blocks = [];

  if (priorContext && (priorContext.summary || priorContext.lastNote)) {
    const parts = [];
    if (priorContext.summary) {
      const count = priorContext.sessionCount
        ? ` (${priorContext.sessionCount} prior session${priorContext.sessionCount === 1 ? '' : 's'})`
        : '';
      parts.push(`Rolling treatment summary${count}:\n${priorContext.summary}`);
    }
    if (priorContext.lastNote) {
      const d = priorContext.lastNoteDaysAgo;
      const when = d != null
        ? ` (${d === 0 ? 'earlier today' : `${d} day${d === 1 ? '' : 's'} ago`})`
        : '';
      parts.push(`Most recent prior note${when}:\n${priorContext.lastNote}`);
    }
    blocks.push(`=== PATIENT HISTORY — CONTEXT ONLY ===
Background from previous sessions. Strict rules for using it:
- Use it ONLY to phrase a trend when today's transcript contains a comparable NEW finding (e.g. "pain 3/10 today, down from 6/10 last session"), or for one brief continuity sentence in the Assessment.
- NEVER restate, copy, list, or summarise previous findings, measurements, test results, or plans anywhere in today's note — not even labelled as "previous" or "remain current". The reader has the prior note.
- If today's transcript contains little or no information for a section, write a single line such as "Not assessed this session" or "Nil new reported" — do NOT fill the section from this history.
- Do not infer or assume anything not explicitly in today's transcript (e.g. do not write "no new symptoms reported" or "education provided" unless it was actually said).
Today's note documents today's session only. A short note for a short session is correct.

${parts.join('\n\n')}
=== END PATIENT HISTORY ===`);
  }

  if (Array.isArray(programDiff) && programDiff.length > 0) {
    blocks.push(`=== PRESCRIPTION CHANGES — EXACT ===
The exercise program changes below were recorded by the system during this session. Reflect them accurately in the Plan section (exact exercises, sets, reps, weights — do not round, rename, or invent changes). The transcript may discuss them too; where they differ, these recorded values are authoritative.

${programDiff.map(line => `- ${line}`).join('\n')}
=== END PRESCRIPTION CHANGES ===`);
  }

  blocks.push(`Here is the consultation transcript:\n\n${transcript}`);
  blocks.push('Generate the SOAP note.');
  return blocks.join('\n\n');
}

async function generateSoapNote(input, systemPrompt) {
  const opts = typeof input === 'string' ? { transcript: input } : (input || {});
  if (!opts.transcript || opts.transcript.trim().length < 20) {
    throw new Error('Transcript too short to generate a meaningful SOAP note');
  }
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: buildSoapUserMessage(opts) }] }],
    system: [{ text: systemPrompt || DEFAULT_SYSTEM_PROMPT }],
    inferenceConfig: { maxTokens: 2000 },
  });
  const response = await client.send(command);
  return { content: response.output.message.content[0].text, model: MODEL_ID };
}

const HANDOUT_SYSTEM_PROMPT = `You are a clinical documentation assistant for Moveify Health Solutions, an Accredited Exercise Physiology practice in Williamstown, South Australia. Patients are typically injured athletes and older adults (roughly 45–75).

Your task is to generate the four narrative sections of a patient assessment handout from a session transcript provided by the Exercise Physiologist. The transcript is a raw, unstructured record of a clinical conversation.

Produce these four sections. Each section is a short list of 3 to 5 warm, plain-language bullet points. Start every bullet on its own line with "- " and keep each bullet to a single sentence. Use the EXACT headings shown:

WHAT'S GOING ON
What you found and what it means for the patient, in plain language. Their main concern, how long it has been present, relevant contributing factors, and the key physical findings (movement, strength, endurance, function) tied to their daily life or goals.

WHAT WE'RE AIMING FOR
The goals for the program, ideally reflecting the patient's own stated goals from the session (e.g. return to a sport, lift grandchildren, walk without pain). Make it feel personal.

HOW WE'LL GET THERE
The clinical approach: the type of work (strength, load management, mobility), how it addresses the findings, and how it progresses through the program. Describe the APPROACH only. Do NOT mention session counts, frequency, tiers, or pricing — that is covered separately.

WHAT YOU CAN EXPECT
What the journey looks like: the phases of the program, early signs things are working, and that you will reassess and adjust. CRITICAL: only state a specific timeframe (weeks/months) if the clinician explicitly gave one in the transcript. If they did not, describe the phases and the reassessment point WITHOUT inventing a date. Never fabricate a prognosis.

Rules:
- Plain, warm, capable language. Treat the reader as intelligent.
- ALWAYS second person ("you", "your") for the patient — never use their name or the third person.
- ALWAYS first person plural ("we", "our") for the clinic.
- No clinical jargon without an immediate plain-language explanation.
- Do not assert a specific pathological mechanism (for example "inflammation", "degeneration", "a tear", "arthritis") unless the clinician explicitly named it in the transcript. Prefer plain, non-diagnostic language such as "irritated" or "sensitised" tissue.
- No em dashes. No asterisks, emojis, or markdown formatting. Use plain "- " hyphen bullets only, one point per line.
- Do not fabricate anything not supported by the transcript.
- Output only the four sections in plain text with the exact headings above. No preamble or text outside them.`;

const CLINICAL_CONTEXT_SYSTEM_PROMPT = `You are a clinical exercise physiologist analyzing assessment data from a patient transcript.

Your task is to extract EVERY objective, measured clinical finding and present them in a table for the patient handout.

Be exhaustive and systematic: read the transcript from start to finish and capture every measurement, in the order it appears. Do not summarise, group, or drop any measured finding — it is a failure to omit a measurement that is present. Include bilateral results as separate or combined rows (e.g. "Calf Raise | L 8 / R 15 | ...").

Rules:
- ONLY include findings that have an actual numeric or graded measurement (e.g. "45°", "4/5", "45 sec", "120/80 mmHg", "Grade 2"). Never include a finding if the only evidence is a subjective patient report or a qualitative clinician observation with no number or grade.
- The Result column must contain only the patient's actual measured value. Never put normative data, comparisons, or descriptive text in the Result column.
- When a test was measured multiple times under the SAME conditions, report ONLY the single derived value in the Result column — never the individual trial values, and give it ONE row. How to derive that value depends on the test type:
  - Strength tests measured as repeated trials (e.g. grip strength): use the AVERAGE of the trials.
  - Balance / timed-hold tests (e.g. single-leg stance, tandem stance): use the BEST (longest) valid attempt. A value labelled "Retest" is a redo of a failed or invalid attempt and REPLACES the earlier one — never average a balance retest.
  Never combine genuinely different conditions or sides into one row, and never average across them: shoes on vs shoes off, left vs right foot/leg, and eyes open vs closed are each their own test and own row. Keep bilateral sides as separate or combined rows (e.g. "Grip Strength | L 27 / R 29 kg | ..."), never merging one side's value into the other. Round to a sensible precision and keep the unit.
- The Interpretation column should be one short, factual sentence describing the functional meaning of the finding. Do NOT state specific normative numbers, percentiles, population averages, or fall-risk cut-offs from memory — those are added separately from a verified normative database. Describe only the clinical/functional meaning (e.g. "Limited ankle dorsiflexion may affect squat depth and gait").
- Never wrap test names in square brackets. Write the test name as plain text only (e.g. "ROM Forward Bending", not "[ROM Forward Bending]").
- Never use asterisks (*), emojis, or markdown formatting anywhere in the output.

Output format — one finding per line, pipe-separated, no header row:
Test Name | Measured Value | Interpretation

Only include findings actually present in the transcript. Do not fabricate data. If no objective measurements are present, output nothing.`;

/**
 * Replace each assessment row's interpretation with a normative-data-grounded one
 * where the test is recognised and the patient's age/sex allow classification.
 * Rows that don't match the dataset keep the model's own interpretation (fallback).
 * `clinicalContext` is the raw "Test | Result | Interpretation" block.
 * No patient values are logged.
 */
function groundClinicalContext(clinicalContext, age, sex) {
  if (!clinicalContext) return clinicalContext;
  return clinicalContext.split('\n').map(line => {
    if (!line.includes('|')) return line;
    const cols = line.split('|').map(s => s.trim());
    const [test, result] = cols;
    if (!test || !result) return line;
    try {
      const res = interpret(test, result, age, sex);
      const grounded = res && buildInterpretation(res);
      if (grounded) return `${test} | ${result} | ${grounded}`;
    } catch { /* fall through to the model's interpretation */ }
    return line;
  }).join('\n');
}

// Fallback for a test that IS in the normative dataset but can't be graded for
// this patient (e.g. grip with no recorded sex). We deliberately do NOT reuse the
// model's recalled interpretation here — that is where ungrounded qualitative
// claims ("a good foundation of strength") leak in. State a neutral baseline only.
const NEUTRAL_BASELINE = 'Recorded as a baseline; we track your change at reassessment.';

// Unit suffix for a value rendered in the Result column of a split row.
function unitSuffix(unit) {
  if (unit === 'reps') return ' reps';
  if (unit === 'seconds') return ' sec';
  if (unit === 'kg') return ' kg';
  if (unit === 'degrees') return '°';
  if (unit === 'cm') return ' cm';
  return unit ? ` ${unit}` : '';
}

// Strip the canonical test name from a row label to leave the condition descriptor
// (e.g. "Tandem Stance (Shoes On, Right Foot Forward)" → "Shoes On, Right Foot Forward").
function conditionLabel(name, def) {
  let s = String(name || '');
  const aliases = [def.displayName, ...(def.aliases || [])].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const a of aliases) {
    const re = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(s)) { s = s.replace(re, ' '); break; }
  }
  return s.replace(/[()]/g, ' ').replace(/^[\s,:;.-]+|[\s,:;.-]+$/g, '').replace(/\s+/g, ' ').trim();
}

// Ground a single row. If the test is a known norm test but can't be graded for
// this patient, use the neutral baseline (never the model's recalled claim). Only
// genuinely unrecognised tests keep the model's functional description.
function groundRow(row, age, sex) {
  try {
    const res = row.match && interpret(row.name, row.result, age, sex);
    const g = res && buildInterpretation(res);
    if (g) return g;
    if (row.match) return NEUTRAL_BASELINE;
  } catch { /* fall through */ }
  return row.interp;
}

// Pull left/right side values from a group of rows (a combined "L/R" row, or
// separate per-side rows where the side appears in the result or the name).
function collectSides(grp, unit) {
  let left = null, right = null;
  for (const row of grp) {
    const parsed = parseValue(row.result, unit);
    if (!parsed) continue;
    if (parsed.left != null && parsed.right != null) { left = parsed.left; right = parsed.right; continue; }
    if (parsed.value == null) continue;
    const hay = `${row.result} ${row.name}`.toLowerCase();
    const hasL = /\bleft\b|\bl\b/.test(hay);
    const hasR = /\bright\b|\br\b/.test(hay);
    if (hasL && !hasR) left = parsed.value;
    else if (hasR && !hasL) right = parsed.value;
  }
  return (left != null || right != null) ? { left, right } : null;
}

// Bilateral norm test (grip, single-leg, calf, ROM) → one grounded row per side,
// with a side-to-side asymmetry note appended to the weaker side.
function splitBilateral(def, sides, age, sex) {
  const display = def.displayName.replace(/\s*\(.*?\)\s*$/, '').trim();
  const suffix = unitSuffix(def.unit);
  const built = [];
  for (const [label, val] of [['Right', sides.right], ['Left', sides.left]]) {
    if (val == null) continue;
    let interp = '';
    try { const res = interpret(def.displayName, String(val), age, sex); interp = (res && buildInterpretation(res)) || ''; } catch { /* */ }
    if (!interp) interp = NEUTRAL_BASELINE;
    built.push({ label, val, interp });
  }
  if (sides.left != null && sides.right != null) {
    const hi = Math.max(sides.left, sides.right), lo = Math.min(sides.left, sides.right);
    if (hi > 0 && (hi - lo) / hi >= 0.10) {
      const pct = Math.round((hi - lo) / hi * 100);
      const stronger = sides.right >= sides.left ? 'right' : 'left';
      const weaker = sides.right >= sides.left ? 'Left' : 'Right';
      const r = built.find(b => b.label === weaker);
      if (r) r.interp = `${r.interp} ${pct}% weaker than the ${stronger} side.`.trim();
    }
  }
  return built.map(b => `${display} (${b.label}) | ${b.val}${suffix} | ${b.interp || '—'}`);
}

// Pass/fail condition-variant test (tandem) → one consolidated row listing every
// condition, with the interpretation stated once and any failed condition named.
function consolidatePassFail(def, grp) {
  const thr = def.passThreshold;
  const higher = def.direction !== 'lower_better';
  const parts = [], passed = [], failed = [];
  for (const row of grp) {
    const cond = conditionLabel(row.name, def) || 'Standard';
    parts.push(`${cond}: ${row.result}`);
    const v = (parseValue(row.result, def.unit) || {}).value;
    if (v == null) continue;
    ((higher ? v >= thr : v <= thr) ? passed : failed).push(cond);
  }
  let interp;
  if (failed.length === 0) interp = `Held the ${thr}-second threshold in every tested condition, a reassuring sign for standing balance.`;
  else if (passed.length === 0) interp = `Could not hold the ${thr}-second tandem threshold in any tested condition, a sign of increased fall risk on the 4-Stage Balance test.`;
  else interp = `Met the ${thr}-second threshold in the standard conditions; ${failed.join(' and ')} held under ${thr} seconds, a sign of increased fall risk on the 4-Stage Balance test.`;
  // ' // ' is the in-cell line-break sentinel: it survives the newline-delimited
  // row format and the editable textarea, and the docx layer (parseOaRows in
  // scribe-handout-docx.js) converts it to a real line break so each condition
  // sits on its own line in the Result cell instead of a cramped semicolon list.
  return `${def.displayName} | ${parts.join(' // ')} | ${interp}`;
}

/**
 * Consolidate + ground the raw "Test | Result | Interpretation" extraction so one
 * clinical assessment reads as one logical entry rather than many near-duplicate
 * rows. Grouped by the normative dataset's canonical test key:
 *  - pass/fail condition tests (tandem) → a single consolidated row
 *  - bilateral norm tests (grip, single-leg, calf, ROM) → one grounded row per side
 *  - everything else → grounded per row (unchanged)
 * Rows that don't match the dataset keep the model's own interpretation.
 * No patient values are logged.
 */
function consolidateClinicalContext(raw, age, sex) {
  if (!raw) return raw;
  const rows = raw.split('\n').map(line => {
    if (!line.includes('|')) return null;
    const cols = line.split('|').map(s => s.trim());
    if (!cols[0]) return null;
    return { name: cols[0], result: cols[1] || '', interp: cols[2] || '', match: matchTest(cols[0]) };
  }).filter(Boolean);

  const order = [];
  const groups = new Map();
  rows.forEach((row, i) => {
    const key = row.match ? row.match.key : `__row_${i}`;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(row);
  });

  const out = [];
  for (const key of order) {
    const grp = groups.get(key);
    const def = grp[0].match ? grp[0].match.def : null;

    if (def && def.type === 'pass_fail' && def.passThreshold != null) {
      out.push(consolidatePassFail(def, grp));
      continue;
    }
    const sides = def && (def.bands?.length || def.cutoffs?.length) ? collectSides(grp, def.unit) : null;
    if (def && sides) {
      out.push(...splitBilateral(def, sides, age, sex));
      continue;
    }
    for (const row of grp) out.push(`${row.name} | ${row.result} | ${groundRow(row, age, sex)}`);
  }
  return out.join('\n');
}

/**
 * Extract + ground the measured clinical findings from a transcript (or a saved
 * SOAP note) into the consolidated "Test | Result | Interpretation" block. Shared
 * by the handout (generateHandout) and the reassessment report so both derive
 * findings identically. Best-effort: returns '' on failure. No patient values logged.
 */
async function extractFindings(sourceText, age, sex) {
  try {
    const ctxCmd = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: `Extract and interpret clinical findings from this transcript:\n\n${sourceText}` }] }],
      system: [{ text: CLINICAL_CONTEXT_SYSTEM_PROMPT }],
      // temperature 0 → deterministic extraction so the same source yields the
      // same set of findings every run (fixes 3-vs-6 inconsistency).
      inferenceConfig: { maxTokens: 1200, temperature: 0 },
    });
    const ctxRes = await client.send(ctxCmd);
    const raw = ctxRes.output.message.content[0].text
      .replace(/\*+/g, '')
      .replace(/\[|\]/g, '')
      .trim();
    // Ground + consolidate: one assessment reads as one entry (sides split,
    // tandem conditions merged), interpretation grounded in peer-reviewed norms.
    return consolidateClinicalContext(raw, age, sex);
  } catch (err) {
    console.error('Clinical context generation failed:', err.message);
    return '';
  }
}

const RESULTS_SUMMARY_SYSTEM_PROMPT = `You are writing the "What Your Results Mean" paragraph of a patient assessment handout for an Accredited Exercise Physiology clinic. Patients are typically injured athletes and adults aged 45-75.

You are given the patient's assessment results, each with a grounded interpretation (within/below/above the expected range for their age and sex, plus any clinical flags). Write ONE warm, plain-language paragraph that ties the findings together and explains, in human terms, WHY they matter.

Requirements:
- 4 to 6 sentences, flowing prose (no bullet points, no headings, no lists).
- Second person throughout ("you", "your"). Never use the patient's name.
- First person plural for the clinic ("we", "our").
- Summarise the overall picture, then explain the functional meaning of the notable findings. Draw on the relevant rationale, for example:
  - reduced balance → higher risk of falls and loss of confidence on your feet
  - reduced range of motion → movements like reaching, squatting, or stairs become harder and other areas compensate
  - reduced strength or muscle endurance → everyday tasks (stairs, carrying, getting off a low chair) tire you sooner and independence is harder to maintain
  - reduced walking speed or aerobic capacity → less endurance for daily activity and a known marker of general health
  - elevated blood pressure or blood glucose → a screening measure worth keeping an eye on over time, relevant to long-term heart and metabolic health (never state or imply a diagnosis)
- Frame below-range findings as a starting point that shapes your program, not a verdict.
- End reassuringly: we re-measure the same tests at reassessment so progress is objective.

Rules:
- Only discuss findings actually present in the data. Do not invent results.
- Only describe a finding with a quality judgement (good, strong, healthy, reduced, low, weak, etc.) when its interpretation EXPLICITLY says it is within, above, or below the expected range. If a finding has no such grounded verdict (for example the interpretation only says what the test measures, or calls it a baseline), present it neutrally as a baseline we will track and do NOT praise or criticise it. Never call strength or fitness "good", "solid", or "a good foundation" without an explicit within/above-range verdict.
- For blood pressure or glucose, describe them as screening measures to keep an eye on over time, never a diagnosis. Do NOT tell the patient to see, consult, review with, or be referred to a GP or any other provider — referral is the clinician's decision, not yours to state.
- No specific numbers or percentiles are needed in this paragraph.
- No em dashes, asterisks, emojis, or markdown. Output only the paragraph.`;

async function generateHandout(transcript, patientFirstName, assessmentDate, demographics = {}) {
  if (!transcript || transcript.trim().length < 10) {
    throw new Error('Transcript too short to generate a handout');
  }
  const { age = null, sex = null } = demographics;
  // patientFirstName is intentionally not sent — the system prompt uses "you"/"your" only.
  // assessmentDate is administrative metadata, not needed for content generation.
  const userMessage = `The following is a transcript of a Gateway Assessment session. Generate ALL FOUR sections of the patient assessment handout — WHAT'S GOING ON, WHAT WE'RE AIMING FOR, HOW WE'LL GET THERE, and WHAT YOU CAN EXPECT — using the exact headings.\n\nTranscript:\n${transcript}`;

  // The narrative sections and the clinical-findings extraction are independent
  // (both derive from the transcript) — run them in parallel to keep total
  // latency under the client timeout.
  const sectionsPromise = (async () => {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: userMessage }] }],
      system: [{ text: HANDOUT_SYSTEM_PROMPT }],
      inferenceConfig: { maxTokens: 2000 },
    });
    const response = await client.send(command);
    const cleaned = response.output.message.content[0].text.replace(/\*\*/g, '').replace(/\*/g, '');
    const grab = (re) => { const m = cleaned.match(re); return m ? m[1].trim() : ''; };
    return {
      whatsGoingOn:  grab(/WHAT(?:'|')?S GOING ON\s*\n([\s\S]*?)(?=WHAT WE(?:'|')?RE AIMING FOR|HOW WE(?:'|')?LL GET THERE|WHAT YOU CAN EXPECT|$)/i),
      ourAims:       grab(/WHAT WE(?:'|')?RE AIMING FOR\s*\n([\s\S]*?)(?=HOW WE(?:'|')?LL GET THERE|WHAT YOU CAN EXPECT|$)/i),
      howWeGetThere: grab(/HOW WE(?:'|')?LL GET THERE\s*\n([\s\S]*?)(?=WHAT YOU CAN EXPECT|$)/i),
      whatToExpect:  grab(/WHAT YOU CAN EXPECT\s*\n([\s\S]*?)$/i),
    };
  })();

  const contextPromise = extractFindings(transcript, age, sex);

  const [sections, clinicalContext] = await Promise.all([sectionsPromise, contextPromise]);

  // "What Your Results Mean" — a content-aware summary built from the grounded
  // findings (why the notable results matter functionally). Best-effort.
  let resultsSummary = '';
  if (clinicalContext) {
    try {
      const sumCmd = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [{ role: 'user', content: [{ text: `Patient assessment results with grounded interpretations:\n\n${clinicalContext}\n\nWrite the "What Your Results Mean" paragraph.` }] }],
        system: [{ text: RESULTS_SUMMARY_SYSTEM_PROMPT }],
        inferenceConfig: { maxTokens: 600 },
      });
      const sumRes = await client.send(sumCmd);
      resultsSummary = sumRes.output.message.content[0].text
        .replace(/\*+/g, '')
        .replace(/^#+\s*/gm, '')
        .trim();
    } catch (err) {
      console.error('Results summary generation failed:', err.message);
    }
  }

  return {
    sections: {
      ...sections,
      clinicalContext: clinicalContext || undefined,
      resultsSummary: resultsSummary || undefined,
    },
    model: MODEL_ID,
  };
}

const REASSESSMENT_SYSTEM_PROMPT = `You are a clinical documentation assistant for Moveify Health Solutions, an Accredited Exercise Physiology practice. You are writing the narrative of a REASSESSMENT summary that compares a patient's baseline assessment with their latest reassessment of the SAME tests.

You are given the paired results, each already graded deterministically with a direction (improved / declined / maintained) and, where available, a verdict transition (e.g. "now within the expected range, from below before"). Treat those gradings as ground truth — do not re-judge the numbers yourself.

Produce TWO sections. Each is a short list of 3 to 5 warm, plain-language bullet points. Start every bullet on its own line with "- " and keep each bullet to a single sentence. Use the EXACT headings shown:

YOUR PROGRESS
What has changed since baseline, in plain language tied to daily life. Lead with the genuine improvements. If the patient's goals are provided, open by acknowledging progress toward the goals the results actually support. If pain or functional issues are provided, mention meaningful changes (e.g. reduced pain, easier stairs) honestly — only as far as the notes/results support. Acknowledge anything that has not yet changed or has slipped, honestly but encouragingly, as the focus for the next phase.

WHERE WE GO NEXT
The clinical focus for the coming phase given the results and the patient's goals — what we keep building, what we shift attention to, and that we will reassess again to keep progress objective. Where goals remain, frame the next phase around them. Describe the APPROACH only. Do NOT mention session counts, frequency, tiers, or pricing.

Rules:
- Plain, warm, capable language. Treat the reader as intelligent.
- ALWAYS second person ("you", "your") for the patient — never use their name or the third person.
- ALWAYS first person plural ("we", "our") for the clinic.
- Only describe a result as improved, better, stronger, declined, or similar when its grading EXPLICITLY says so. If a result is marked "maintained" or has no graded direction, present it neutrally as held steady or as a baseline we keep tracking — never invent a gain or a loss.
- For blood pressure, blood glucose, or other screening measures, never call the reading "good", "healthy", "fine", or at "good levels" unless its grading EXPLICITLY says it is within the normal range. If it improved but is still elevated or flagged, describe it as moving in the right direction but still worth keeping an eye on — never as being at good levels.
- A finding marked "measured this visit, no baseline" has nothing to compare against — present it only as a new baseline we will track, and never describe it as improved, declined, better, or worse.
- Refer ONLY to the specific tests, body areas, pains, goals, and issues given to you. Do NOT introduce any measure, body region, or capability that is not in the input — for example, do not mention "core strength", "walking tolerance", "flexibility", or any test that is not in the provided results.
- Do NOT state or imply a diagnosis, and do NOT tell the patient to see, consult, review with, or be referred to a GP or any other provider — referral is the clinician's decision.
- Do not assert a specific pathological mechanism unless it appears in the data.
- No em dashes. No asterisks, emojis, or markdown. Use plain "- " hyphen bullets only, one point per line.
- Do not fabricate anything not supported by the provided results.
- Output only the two sections in plain text with the exact headings above. No preamble or text outside them.`;

const REASSESSMENT_SUMMARY_SYSTEM_PROMPT = `You are writing the "What Your Progress Means" paragraph of a patient reassessment summary for an Accredited Exercise Physiology clinic.

You are given the paired baseline-vs-latest results, each graded with a direction (improved / declined / maintained) and any verdict transition. Write ONE warm, plain-language paragraph that ties the changes together and explains, in human terms, what the progress means for the patient.

Requirements:
- 4 to 6 sentences, flowing prose (no bullet points, no headings, no lists).
- Second person throughout ("you", "your"). Never use the patient's name. First person plural for the clinic.
- Lead with the genuine improvements, then note honestly what is still developing, framed as the focus we keep working on.
- End reassuringly: we re-measure the same tests at each reassessment so progress stays objective.

Rules:
- Only describe a result with a quality judgement (improved, stronger, better, declined, reduced, etc.) when its grading EXPLICITLY supports it. Anything marked maintained or ungraded is presented neutrally as held steady or a baseline we track. Never invent a gain or a loss.
- For blood pressure, blood glucose, or other screening measures, never call the reading "good", "healthy", or at "good levels" unless its grading EXPLICITLY says it is within the normal range; if it improved but is still elevated, say so plainly as still worth monitoring.
- Refer ONLY to the tests, body areas, pains, goals, and issues actually present in the input. Do NOT introduce any measure or body region that is not there (e.g. do not mention "core strength" or "walking tolerance" unless they appear in the provided data).
- Do NOT state or imply a diagnosis, and do NOT tell the patient to see, consult, or be referred to a GP or any other provider.
- No specific numbers or percentiles are needed. No em dashes, asterisks, emojis, or markdown. Output only the paragraph.`;

const SUBJECTIVE_COMPARISON_SYSTEM_PROMPT = `You are a clinical exercise physiologist comparing a patient's BASELINE consultation note with their LATEST reassessment note. Extract and compare the three things the objective test table does NOT capture: the patient's goals, their pain, and their functional issues.

You are given both notes. Compare them.

Output EXACTLY these three sections, with these headings, each as pipe-separated bullet lines. If a section has nothing supported by the notes, output the heading with no bullets under it.

GOALS
One bullet per goal the patient stated (prefer goals from the baseline note). Format:
- <goal in the patient's own terms> | <status: achieved / progressing / not yet / unclear> | <brief basis from the notes or measured results>
Judge the status ONLY from what the notes and results support. If unsure, use "unclear".

PAIN
One bullet per distinct pain the patient reported at EITHER visit. Format:
- <site or description> | <baseline severity 0-10, or ns if not stated> | <latest severity 0-10, or ns if not stated> | <brief note>
Use a numeric 0-10 rating only if the note actually gives one; otherwise write ns.

ISSUES
One bullet per functional difficulty or limitation (e.g. stairs, sleep, gripping, walking distance, returning to a sport). Format:
- <issue in plain terms> | <how it has changed since baseline: improved / unchanged / worse / new>

Rules:
- Only include items actually supported by the notes. Do not invent goals, pain, or issues.
- Do not state or imply a diagnosis, and do not recommend seeing or being referred to any provider.
- No asterisks, emojis, markdown, or em dashes. Output only the three sections with their headings.`;

/**
 * Compare the SUBJECTIVE side of two notes — goals, pain, functional issues —
 * which the objective findings table doesn't capture. Returns the raw three-section
 * block (GOALS / PAIN / ISSUES) for the caller to parse. Best-effort: '' on failure.
 * Patient name not sent. No patient values logged.
 */
async function extractSubjectiveComparison(prevText, currText) {
  try {
    const cmd = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: `BASELINE note:\n${prevText}\n\n---\n\nLATEST note:\n${currText}\n\nCompare the patient's goals, pain, and functional issues across the two notes.` }] }],
      system: [{ text: SUBJECTIVE_COMPARISON_SYSTEM_PROMPT }],
      inferenceConfig: { maxTokens: 900, temperature: 0 },
    });
    const res = await client.send(cmd);
    return res.output.message.content[0].text.replace(/\*+/g, '').replace(/\[|\]/g, '').trim();
  } catch (err) {
    console.error('Subjective comparison failed:', err.message);
    return '';
  }
}

/**
 * Generate the reassessment narrative (two bulleted sections + a prose summary)
 * from the deterministically-graded comparison text. The comparison verdicts are
 * computed upstream (normative-data.compareValues) — the model only phrases them.
 * `subjectiveContext` (optional) adds goals/pain/issues so the prose can speak to
 * goal progress and symptom change. Patient name/dates are not sent. No values logged.
 */
async function generateReassessmentNarrative(comparisonText, subjectiveContext = '') {
  const subjectiveBlock = subjectiveContext
    ? `\n\nThe patient's goals, pain, and functional issues across the two visits (comment on goal progress and meaningful symptom changes where the results support it; never claim a change a result does not support):\n\n${subjectiveContext}`
    : '';
  const userMessage = `The following are this patient's paired baseline-vs-latest assessment results, already graded:\n\n${comparisonText}${subjectiveBlock}\n\nGenerate the two narrative sections — YOUR PROGRESS and WHERE WE GO NEXT — using the exact headings.`;

  const sectionsCmd = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    system: [{ text: REASSESSMENT_SYSTEM_PROMPT }],
    inferenceConfig: { maxTokens: 1200 },
  });

  const summaryCmd = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: `Paired reassessment results (graded):\n\n${comparisonText}${subjectiveBlock}\n\nWrite the "What Your Progress Means" paragraph.` }] }],
    system: [{ text: REASSESSMENT_SUMMARY_SYSTEM_PROMPT }],
    inferenceConfig: { maxTokens: 600 },
  });

  const [sectionsRes, summaryRes] = await Promise.all([
    client.send(sectionsCmd),
    client.send(summaryCmd).catch(err => { console.error('Reassessment summary failed:', err.message); return null; }),
  ]);

  const cleaned = sectionsRes.output.message.content[0].text.replace(/\*\*/g, '').replace(/\*/g, '');
  const grab = (re) => { const m = cleaned.match(re); return m ? m[1].trim() : ''; };
  const progress = grab(/YOUR PROGRESS\s*\n([\s\S]*?)(?=WHERE WE GO NEXT|$)/i);
  const nextSteps = grab(/WHERE WE GO NEXT\s*\n([\s\S]*?)$/i);
  const resultsSummary = summaryRes
    ? summaryRes.output.message.content[0].text.replace(/\*+/g, '').replace(/^#+\s*/gm, '').trim()
    : '';

  return { progress, nextSteps, resultsSummary, model: MODEL_ID };
}

const GP_REASSESSMENT_SYSTEM_PROMPT = `You are Ryan Heath, an Accredited Exercise Physiologist at Moveify Health Solutions, writing a formal REASSESSMENT progress report to a patient's referring GP (e.g. under a GP/Chronic Disease Management Plan). The report compares the patient's baseline assessment with their latest reassessment of the same measures.

You are given the paired baseline-vs-latest results, already graded deterministically (improved / declined / no significant change, with reference-range context), plus the patient's goals, pain, and functional issues. Treat the gradings as ground truth — do not re-judge the numbers.

Write THREE sections using these EXACT headings. Formal clinical prose. No markdown, no asterisks, no bullet points.

EXECUTIVE SUMMARY
Two short paragraphs. (1) "[PATIENT_NAME] attended Moveify Health Solutions for an Exercise Physiology reassessment to review progress since the initial assessment." Summarise the overall trajectory (clear gains, areas unchanged, any decline) in clinical terms. (2) Briefly note progress toward the patient's stated goals and any change in reported pain or function.

CLINICAL INTERPRETATION
One to two paragraphs interpreting the objective changes clinically — what the measured improvements/declines mean functionally, and how they relate to the referral reason and goals. Where a screening measure (e.g. blood pressure, blood glucose) is outside the reference range, you MAY note it for the GP's attention as a screening observation (never a diagnosis). Only describe a finding as improved/declined/unchanged where the grading supports it; present no-baseline findings as newly established baselines for future tracking.

RECOMMENDATIONS
One paragraph of formal recommendations: the ongoing exercise-physiology focus for the next phase given the results and goals, the intent to continue regular review and objective reassessment, and — where clinically appropriate — any matter flagged for the GP's consideration (e.g. "blood pressure remains above the reference range and may warrant GP review"). Do not prescribe medication or make a diagnosis.

Rules:
- Refer to the patient as [PATIENT_NAME] (the literal placeholder) — do not invent a name or use he/she/they.
- Refer ONLY to the measures, pains, goals, and issues provided. Do not introduce any test or body region not in the input.
- Do not fabricate results or claim a change a grading does not support.
- Australian clinical English. Output only the three sections with their exact headings. No preamble.`;

/**
 * GP-facing reassessment narrative (Executive Summary / Clinical Interpretation /
 * Recommendations) from the deterministically-graded comparison + goals/pain
 * context. Uses the literal [PATIENT_NAME] placeholder (substituted by the caller
 * so the name never leaves Australia). No patient values logged.
 */
async function generateGPReassessmentNarrative(comparisonText, subjectiveContext = '') {
  const subjectiveBlock = subjectiveContext
    ? `\n\nThe patient's goals, pain, and functional issues across the two visits:\n\n${subjectiveContext}`
    : '';
  const cmd = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: `Paired baseline-vs-latest reassessment results (graded):\n\n${comparisonText}${subjectiveBlock}\n\nWrite the GP reassessment report — EXECUTIVE SUMMARY, CLINICAL INTERPRETATION, RECOMMENDATIONS — using the exact headings.` }] }],
    system: [{ text: GP_REASSESSMENT_SYSTEM_PROMPT }],
    inferenceConfig: { maxTokens: 1500 },
  });
  const res = await client.send(cmd);
  const cleaned = res.output.message.content[0].text.replace(/\*\*/g, '').replace(/\*/g, '');
  const grab = (re) => { const m = cleaned.match(re); return m ? m[1].trim() : ''; };
  return {
    executiveSummary:      grab(/EXECUTIVE SUMMARY\s*\n([\s\S]*?)(?=CLINICAL INTERPRETATION|RECOMMENDATIONS|$)/i),
    clinicalInterpretation: grab(/CLINICAL INTERPRETATION\s*\n([\s\S]*?)(?=RECOMMENDATIONS|$)/i),
    recommendations:        grab(/RECOMMENDATIONS\s*\n([\s\S]*?)$/i),
    model: MODEL_ID,
  };
}

const LETTER_META_SYSTEM_PROMPT = `You are extracting addressing details from a clinical report or referral letter so they can pre-fill a new letter. From the document, identify:
- the referring / addressed GP's name (surname only, omit the title "Dr")
- the medical practice or clinic name
- the practice postal address (one line)
- the patient's full name
- the patient's date of birth

Output EXACTLY these five lines with these exact labels. If a field is not present in the document, write the label with nothing after the colon. Do not guess or invent values.
GP: <surname>
PRACTICE: <name>
ADDRESS: <address>
PATIENT: <full name>
DOB: <date of birth>

Output only those five lines. No other text.`;

/**
 * Pull addressing details (referring GP, practice, address, patient, DOB) from an
 * uploaded previous report so the GP letter's recipient block can be pre-filled.
 * Only the top of the document is scanned (where letterhead/recipient details sit).
 * Best-effort: returns {} on failure. No values logged.
 */
async function extractLetterMeta(text) {
  if (!text || text.trim().length < 20) return {};
  try {
    const cmd = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: `Document:\n${text.slice(0, 6000)}\n\nExtract the addressing details.` }] }],
      system: [{ text: LETTER_META_SYSTEM_PROMPT }],
      inferenceConfig: { maxTokens: 300, temperature: 0 },
    });
    const res = await client.send(cmd);
    const out = res.output.message.content[0].text;
    const grab = (label) => { const m = out.match(new RegExp('^' + label + ':\\s*(.+)$', 'im')); return m ? m[1].trim() : ''; };
    return {
      gpName: grab('GP'),
      practiceName: grab('PRACTICE'),
      practiceAddress: grab('ADDRESS'),
      patientName: grab('PATIENT'),
      dob: grab('DOB'),
    };
  } catch (err) {
    console.error('Letter meta extraction failed:', err.message);
    return {};
  }
}

async function generateReport(soapNoteContent, systemPrompt) {
  if (!soapNoteContent || soapNoteContent.trim().length < 20) {
    throw new Error('SOAP note too short to generate a report');
  }
  // Patient name and session date are not sent to AWS — they are substituted by the
  // caller after the API returns, keeping identifying information off the wire.
  const userMessage = `SOAP Note:\n${soapNoteContent}\n\nGenerate the four report sections. Where the patient name is needed write the literal placeholder: [PATIENT_NAME]. Where the session date is needed write: [SESSION_DATE].`;
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    system: [{ text: systemPrompt }],
    inferenceConfig: { maxTokens: 1500 },
  });
  const response = await client.send(command);
  const raw = response.output.message.content[0].text;
  const cleaned = raw.replace(/\*\*/g, '');
  const summaryMatch = cleaned.match(/EXECUTIVE SUMMARY\s*\n([\s\S]*?)(?=OBJECTIVE ASSESSMENT|$)/i);
  const objectiveMatch = cleaned.match(/OBJECTIVE ASSESSMENT\s*\n([\s\S]*?)(?=GOALS|$)/i);
  const goalsMatch = cleaned.match(/GOALS\s*\n([\s\S]*?)(?=RECOMMENDATIONS?|MANAGEMENT PLAN|$)/i);
  const planMatch = cleaned.match(/(?:RECOMMENDATIONS?|MANAGEMENT PLAN)\s*\n([\s\S]*?)$/i);
  return {
    executiveSummary: summaryMatch ? summaryMatch[1].trim() : '',
    objectiveAssessment: objectiveMatch ? objectiveMatch[1].trim() : '',
    goals: goalsMatch ? goalsMatch[1].trim() : '',
    managementPlan: planMatch ? planMatch[1].trim() : '',
    model: MODEL_ID,
  };
}

module.exports = { generateSoapNote, buildSoapUserMessage, generateHandout, generateReport, groundClinicalContext, consolidateClinicalContext, extractFindings, generateReassessmentNarrative, generateGPReassessmentNarrative, extractSubjectiveComparison, extractLetterMeta };
