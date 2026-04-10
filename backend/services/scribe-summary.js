/**
 * Rolling patient summary service.
 * Generates/updates a cumulative patient summary after each completed session.
 * Uses AWS Bedrock Nova Pro, ap-southeast-2. PHI stays in Australia.
 */
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const db = require('../database/db');
const { encrypt, decrypt } = require('./scribe-encryption');

const client = new BedrockRuntimeClient({ region: 'ap-southeast-2' });
const MODEL_ID = 'amazon.nova-pro-v1:0';

const SUMMARY_SYSTEM_PROMPT = `You are a clinical documentation assistant. Maintain a concise rolling summary of a patient's treatment history.

Given a previous patient summary (if any) and the latest SOAP note, produce an updated cumulative summary.

Rules:
- Keep under 300 words
- Focus on: presenting condition, key findings/progress over time, current treatment approach, outstanding concerns
- Track trends (e.g. "pain decreased from 6/10 to 3/10 over 4 sessions")
- Note any red flags or important clinical decisions
- Use concise clinical language
- Structure: Condition | Progress | Current Plan | Flags (if any)`;

async function updatePatientSummary(patientId, soapNoteContent, sessionId) {
  if (!patientId) return null;

  const existing = await db.query(
    'SELECT summary_enc, session_count FROM patient_summaries WHERE patient_id = $1',
    [patientId]
  );

  const previousSummary = existing.rows.length > 0 ? decrypt(existing.rows[0].summary_enc) : null;
  const sessionCount = existing.rows.length > 0 ? existing.rows[0].session_count + 1 : 1;

  const userMessage = previousSummary
    ? `Previous patient summary (${sessionCount - 1} sessions):\n${previousSummary}\n\n---\n\nLatest SOAP note (session ${sessionCount}):\n${soapNoteContent}\n\nUpdate the rolling summary.`
    : `First session SOAP note:\n${soapNoteContent}\n\nCreate an initial patient summary.`;

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    system: [{ text: SUMMARY_SYSTEM_PROMPT }],
    inferenceConfig: { maxTokens: 500 },
  });

  const response = await client.send(command);
  const summary = response.output.message.content[0].text;

  await db.query(
    `INSERT INTO patient_summaries (patient_id, summary_enc, session_count, last_session_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (patient_id) DO UPDATE
     SET summary_enc = $2, session_count = $3, last_session_id = $4, updated_at = NOW()`,
    [patientId, encrypt(summary), sessionCount, sessionId]
  );

  return { summary, sessionCount };
}

async function getPatientSummary(patientId) {
  const result = await db.query(
    'SELECT summary_enc, session_count, updated_at FROM patient_summaries WHERE patient_id = $1',
    [patientId]
  );
  if (result.rows.length === 0) return null;
  return {
    summary: decrypt(result.rows[0].summary_enc),
    sessionCount: result.rows[0].session_count,
    updatedAt: result.rows[0].updated_at,
  };
}

module.exports = { updatePatientSummary, getPatientSummary };
