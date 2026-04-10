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

Your task is to generate the patient-facing sections of an assessment handout (Sections 1, 2, and 3 only) from a session transcript provided by the Exercise Physiologist. The transcript is a raw, unstructured record of a clinical conversation — approximately the first 45 minutes of a 60-minute Gateway Assessment. The session is not yet complete when you receive this input, so focus on what has been discussed and assessed so far.

Rules:
- Write in plain, warm, non-clinical language suitable for adults aged 45–75
- Never use clinical jargon without an immediate plain-language explanation
- Never include diagnoses, pathology results, or sensitive medical information that the clinician has not explicitly flagged as appropriate for the patient to see
- Sections 1 and 2 use bullet points (2–4 for Section 1, 2–3 for Section 2)
- Section 3 is 1–2 sentences recommending a tier and briefly explaining why
- The recommended tier must be one of: Foundation, Progress, or Performance
- Do not include pricing, Medicare information, or next steps — those are added separately
- Output only the three sections in plain text, using the exact headings: WHAT WE FOUND / WHAT WE'LL FOCUS ON / RECOMMENDED PATHWAY
- Do not include any preamble, explanation, or text outside the three sections`;

const CLINICAL_CONTEXT_SYSTEM_PROMPT = `You are a clinical exercise physiologist analyzing assessment data from a patient transcript.

Your task is to extract objective clinical findings and provide context by comparing them to normative values or clinical thresholds.

For each finding mentioned in the transcript:
1. Identify the measure
2. Extract the patient's value
3. Compare to age-adjusted norms or clinical thresholds
4. Briefly interpret the clinical meaning

Output format — one finding per line:
- [Test name]: [patient value] vs [norm/threshold] — [brief interpretation]

Only include findings actually present in the transcript. Do not fabricate data.`;

async function generateHandout(transcript, patientFirstName, assessmentDate) {
  if (!transcript || transcript.trim().length < 10) {
    throw new Error('Transcript too short to generate a handout');
  }
  const userMessage = `The following is a transcript of a Gateway Assessment session. Generate Sections 1, 2, and 3 of the patient assessment handout.\n\nTranscript:\n${transcript}\n\nPatient first name: ${patientFirstName}\nAssessment date: ${assessmentDate}`;
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    system: [{ text: HANDOUT_SYSTEM_PROMPT }],
    inferenceConfig: { maxTokens: 1500 },
  });
  const response = await client.send(command);
  const raw = response.output.message.content[0].text;
  const cleaned = raw.replace(/\*\*/g, '');
  const foundMatch = cleaned.match(/WHAT WE FOUND\s*\n([\s\S]*?)(?=WHAT WE(?:'|')LL FOCUS ON|RECOMMENDED PATHWAY|$)/i);
  const focusMatch = cleaned.match(/WHAT WE(?:'|')LL FOCUS ON\s*\n([\s\S]*?)(?=RECOMMENDED PATHWAY|$)/i);
  const pathwayMatch = cleaned.match(/RECOMMENDED PATHWAY\s*\n([\s\S]*?)$/i);
  const sections = {
    found: foundMatch ? foundMatch[1].trim() : '',
    focus: focusMatch ? focusMatch[1].trim() : '',
    pathway: pathwayMatch ? pathwayMatch[1].trim() : '',
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
    clinicalContext = ctxRes.output.message.content[0].text.trim();
  } catch (err) {
    console.error('Clinical context generation failed:', err.message);
  }
  return { sections: { ...sections, clinicalContext: clinicalContext || undefined }, model: MODEL_ID };
}

module.exports = { generateSoapNote, generateHandout };
