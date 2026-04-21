/**
 * LLM service for SOAP note and handout generation via AWS Bedrock (Amazon Nova Pro).
 * Inference runs in ap-southeast-2 (Sydney). PHI stays in Australia.
 */
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

const client = new BedrockRuntimeClient({ region: 'ap-southeast-2' });
const MODEL_ID = 'amazon.nova-pro-v1:0';

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

const HANDOUT_SYSTEM_PROMPT = `You are a clinical documentation assistant for Moveify Health Solutions, an Accredited Exercise Physiology practice in Williamstown, South Australia.

Your task is to generate the patient-facing sections of an assessment handout (Sections 1 and 2 only) from a session transcript provided by the Exercise Physiologist. The transcript is a raw, unstructured record of a clinical conversation — approximately the first 45 minutes of a 60-minute Gateway Assessment.

Section 1 — WHAT WE FOUND
Summarise the key assessment findings in plain language, speaking directly to the patient. Use 4–6 bullet points covering:
- The patient's main presenting concerns and how long they have been present
- Relevant history or contributing factors mentioned in the session
- Key physical findings from the assessment (movement, strength, endurance, function)
- How these findings relate to their daily life, work, or goals
- Any lifestyle or health factors discussed that are relevant to exercise

Section 2 — WHAT WE'LL FOCUS ON
Outline the treatment priorities, speaking directly to the patient. Use 3–5 bullet points covering:
- The primary movement, strength, or endurance goals for their program
- Any specific exercises, activities, or habits that will be targeted
- How the program will address the key findings from Section 1
- Any lifestyle, pain management, or self-management strategies discussed

Rules:
- Write in plain, warm language suitable for adults aged 45–75
- ALWAYS use second person ("you", "your") when referring to the patient — never use their name or write in the third person (e.g. write "you have been experiencing lower back pain" not "Ryan has been experiencing lower back pain")
- ALWAYS use first person plural ("we", "our") when referring to the clinician or practice (e.g. "we found", "we will focus on", "our assessment showed")
- Never use clinical jargon without an immediate plain-language explanation
- Never include diagnoses, pathology results, or sensitive medical information unless explicitly appropriate for the patient
- Never use asterisks (*), emojis, or markdown formatting anywhere in the output
- Do not include pricing, Medicare information, or next steps — those are added separately
- Output only the two sections in plain text, using the exact headings: WHAT WE FOUND / WHAT WE'LL FOCUS ON
- Do not include any preamble, explanation, or text outside the two sections`;

const CLINICAL_CONTEXT_SYSTEM_PROMPT = `You are a clinical exercise physiologist analyzing assessment data from a patient transcript.

Your task is to extract objective, measured clinical findings and present them in a table for the patient handout.

Rules:
- ONLY include findings that have an actual numeric or graded measurement (e.g. "45°", "4/5", "45 sec", "120/80 mmHg", "Grade 2"). Never include a finding if the only evidence is a subjective patient report or a qualitative clinician observation with no number or grade.
- The Result column must contain only the patient's actual measured value. Never put normative data, comparisons, or descriptive text in the Result column.
- The Interpretation column should be one short sentence. Include a normative comparison here if relevant (e.g. "Below norm of 50–60° — suggests lumbar restriction").
- Never wrap test names in square brackets. Write the test name as plain text only (e.g. "ROM Forward Bending", not "[ROM Forward Bending]").
- Never use asterisks (*), emojis, or markdown formatting anywhere in the output.

Output format — one finding per line, pipe-separated, no header row:
Test Name | Measured Value | Interpretation

Only include findings actually present in the transcript. Do not fabricate data. If no objective measurements are present, output nothing.`;

async function generateHandout(transcript, patientFirstName, assessmentDate) {
  if (!transcript || transcript.trim().length < 10) {
    throw new Error('Transcript too short to generate a handout');
  }
  const userMessage = `The following is a transcript of a Gateway Assessment session. Generate Sections 1 and 2 of the patient assessment handout.\n\nTranscript:\n${transcript}\n\nPatient first name: ${patientFirstName}\nAssessment date: ${assessmentDate}`;
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    system: [{ text: HANDOUT_SYSTEM_PROMPT }],
    inferenceConfig: { maxTokens: 2000 },
  });
  const response = await client.send(command);
  const raw = response.output.message.content[0].text;
  const cleaned = raw.replace(/\*\*/g, '').replace(/\*/g, '');
  const foundMatch = cleaned.match(/WHAT WE FOUND\s*\n([\s\S]*?)(?=WHAT WE(?:'|')LL FOCUS ON|$)/i);
  const focusMatch = cleaned.match(/WHAT WE(?:'|')LL FOCUS ON\s*\n([\s\S]*?)$/i);
  const sections = {
    found: foundMatch ? foundMatch[1].trim() : '',
    focus: focusMatch ? focusMatch[1].trim() : '',
  };
  let clinicalContext = '';
  try {
    const ctxCmd = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: `Extract and interpret clinical findings from this transcript:\n\n${transcript}` }] }],
      system: [{ text: CLINICAL_CONTEXT_SYSTEM_PROMPT }],
      inferenceConfig: { maxTokens: 800 },
    });
    const ctxRes = await client.send(ctxCmd);
    // Strip asterisks and square brackets that the model may still produce
    clinicalContext = ctxRes.output.message.content[0].text
      .replace(/\*+/g, '')
      .replace(/\[|\]/g, '')
      .trim();
  } catch (err) {
    console.error('Clinical context generation failed:', err.message);
  }
  return { sections: { ...sections, clinicalContext: clinicalContext || undefined }, model: MODEL_ID };
}

async function generateReport(soapNoteContent, systemPrompt, patientName, sessionDate) {
  if (!soapNoteContent || soapNoteContent.trim().length < 20) {
    throw new Error('SOAP note too short to generate a report');
  }
  const nameContext = patientName ? `Patient full name: ${patientName}\n` : '';
  const dateContext = sessionDate ? `Session date: ${sessionDate}\n` : '';
  const userMessage = `${nameContext}${dateContext}\nSOAP Note:\n${soapNoteContent}\n\nGenerate the four report sections. Use the patient name and session date provided above — do not infer these from the note.`;
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

module.exports = { generateSoapNote, generateHandout, generateReport };
