/**
 * LLM service for SOAP note and handout generation via AWS Bedrock (DeepSeek V3.2).
 * Inference runs in-region in ap-southeast-2 (Sydney) — DeepSeek V3.2 is In-Region
 * only (no cross-region routing), so PHI never leaves Australia.
 */
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { interpret, buildInterpretation } = require('./normative-data');

const client = new BedrockRuntimeClient({ region: 'ap-southeast-2' });
const MODEL_ID = 'deepseek.v3.2';

const DEFAULT_SYSTEM_PROMPT = `You are an experienced clinical exercise physiologist scribe. Given a transcript of a patient consultation, generate a structured SOAP note following Australian allied health clinical standards.

Format the note as a single block of text with section headers:

Subjective
- Patient's reported symptoms, history of present condition, pain descriptions, functional limitations, goals, and relevant psychosocial factors. Include relevant quotes where helpful.

Objective
- Clinical findings mentioned: range of motion, strength assessments, functional tests, movement quality observations, vitals if mentioned, any outcome measures discussed.

Assessment
- Clinical reasoning, working diagnosis/impression, progress since last session, contributing factors, prognosis.

Plan
- Treatment provided today, exercise prescription changes, home exercise program updates, follow-up schedule, referrals, patient education provided.

Use bullet points within each section. Use clinical terminology appropriate for exercise physiology documentation. Be concise but thorough — capture all clinically relevant information from the transcript. Do not fabricate information not present in the transcript.`;

async function generateSoapNote(transcript, systemPrompt) {
  if (!transcript || transcript.trim().length < 20) {
    throw new Error('Transcript too short to generate a meaningful SOAP note');
  }
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: `Here is the consultation transcript:\n\n${transcript}\n\nGenerate the SOAP note.` }] }],
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
- No em dashes. No asterisks, emojis, or markdown formatting. Use plain "- " hyphen bullets only, one point per line.
- Do not fabricate anything not supported by the transcript.
- Output only the four sections in plain text with the exact headings above. No preamble or text outside them.`;

const CLINICAL_CONTEXT_SYSTEM_PROMPT = `You are a clinical exercise physiologist analyzing assessment data from a patient transcript.

Your task is to extract EVERY objective, measured clinical finding and present them in a table for the patient handout.

Be exhaustive and systematic: read the transcript from start to finish and capture every measurement, in the order it appears. Do not summarise, group, or drop any measured finding — it is a failure to omit a measurement that is present. Include bilateral results as separate or combined rows (e.g. "Calf Raise | L 8 / R 15 | ...").

Rules:
- ONLY include findings that have an actual numeric or graded measurement (e.g. "45°", "4/5", "45 sec", "120/80 mmHg", "Grade 2"). Never include a finding if the only evidence is a subjective patient report or a qualitative clinician observation with no number or grade.
- The Result column must contain only the patient's actual measured value. Never put normative data, comparisons, or descriptive text in the Result column.
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
  - elevated blood pressure or blood glucose → a screening flag to review with your GP, important for long-term heart and metabolic health (never state or imply a diagnosis)
- Frame below-range findings as a starting point that shapes your program, not a verdict.
- End reassuringly: we re-measure the same tests at reassessment so progress is objective.

Rules:
- Only discuss findings actually present in the data. Do not invent results.
- For blood pressure or glucose, describe them as screening flags to discuss with a GP — never diagnose.
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

  const contextPromise = (async () => {
    try {
      const ctxCmd = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [{ role: 'user', content: [{ text: `Extract and interpret clinical findings from this transcript:\n\n${transcript}` }] }],
        system: [{ text: CLINICAL_CONTEXT_SYSTEM_PROMPT }],
        // temperature 0 → deterministic extraction so the same transcript yields
        // the same set of findings every run (fixes 3-vs-6 inconsistency).
        inferenceConfig: { maxTokens: 1200, temperature: 0 },
      });
      const ctxRes = await client.send(ctxCmd);
      const raw = ctxRes.output.message.content[0].text
        .replace(/\*+/g, '')
        .replace(/\[|\]/g, '')
        .trim();
      // Ground the interpretation column in peer-reviewed norms (deterministic).
      return groundClinicalContext(raw, age, sex);
    } catch (err) {
      console.error('Clinical context generation failed:', err.message);
      return '';
    }
  })();

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

module.exports = { generateSoapNote, generateHandout, generateReport, groundClinicalContext };
