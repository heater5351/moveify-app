'use strict';

/**
 * PDF referral extraction via AWS Bedrock in ap-southeast-2.
 * Default model is Claude Sonnet 4.6 via the AU cross-region inference profile,
 * which keeps inference in Australia (vs the APAC profile, which can route to
 * Tokyo/Mumbai/etc). Override with BEDROCK_MODEL_ID env var if needed.
 */

const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { getSecret } = require('../lib/secrets');

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'au.anthropic.claude-sonnet-4-6';

let _client = null;

async function getClient() {
  if (_client) return _client;
  const [accessKeyId, secretAccessKey] = await Promise.all([
    getSecret('aws-access-key-id'),
    getSecret('aws-secret-access-key'),
  ]);
  _client = new BedrockRuntimeClient({
    region: REGION,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

const EXTRACTION_TOOL = {
  toolSpec: {
    name: 'extract_referral',
    description: 'Extract structured patient referral data from a GP or specialist referral letter. Set is_referral=false for any document that is not a referral letter written by a GP or specialist referring a patient to a treating clinician.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          is_referral:          { type: 'boolean', description: 'true only if a GP or specialist is referring a patient TO a treating clinician. false for consultation reports, progress notes, discharge summaries, insurance forms, WorkCover/TAC/CTP documents, billing statements, or any document authored by the treating clinician.' },
          classification_reason:{ type: 'string', description: 'Brief structural reason for the is_referral decision, free of patient details. Describe document type and author role only. Examples: "signed by GP, addressed to physiotherapy clinic", "signed by physiotherapist, clinical report back to GP", "WorkCover medical certificate, not a referral", "Guild Insurance form, not a referral".' },
          first_name:           { type: 'string' },
          last_name:            { type: 'string' },
          date_of_birth:        { type: 'string', description: 'YYYY-MM-DD, empty string if not found' },
          medicare_number:      { type: 'string', description: 'Patient Australian Medicare card number — exactly 10 digits, sometimes followed by a slash and 1-digit IRN (e.g. "1234567890" or "1234567890/1"). Do NOT confuse with phone numbers (also 10 digits but start with 02/03/04/07/08) or ABN (11 digits) or provider numbers (6 digits + 2 letters). Empty string if not present.' },
          phone:                { type: 'string', description: 'Patient phone number — 10 digits starting with 02, 03, 04 (mobile), 07, or 08. Do NOT put a Medicare number here. Empty string if not present.' },
          address:              { type: 'string' },
          suburb:               { type: 'string' },
          state:                { type: 'string' },
          postcode:             { type: 'string' },
          referring_doctor:     { type: 'string' },
          referring_practice:   { type: 'string', description: 'Name of the GP practice / medical centre that the referring doctor works at — taken from the letterhead or signature block. Empty string if absent.' },
          referring_practice_address:  { type: 'string', description: 'Street address (line 1) of the referring GP practice — from the letterhead. Do NOT use the addressee/recipient clinic. Empty string if absent.' },
          referring_practice_suburb:   { type: 'string', description: 'Suburb of the referring GP practice. Empty string if absent.' },
          referring_practice_state:    { type: 'string', description: 'State of the referring GP practice (e.g. "VIC", "NSW", "QLD"). Empty string if absent.' },
          referring_practice_postcode: { type: 'string', description: 'Postcode of the referring GP practice — 4 digits. Empty string if absent.' },
          provider_number:      { type: 'string', description: 'Australian Medicare provider number of the referring doctor — exactly 6 digits followed by 2 letters (e.g. "123456AB", "045678BX"). Found near the GP signature, letterhead, footer, or address block. Often labelled "Provider No.", "Prov No", "Provider Number", or "Medicare Provider". Do NOT confuse with ABN (11 digits) or phone numbers. Empty string if absent.' },
          referral_date:        { type: 'string', description: 'YYYY-MM-DD, empty string if not found' },
          num_sessions:         { type: 'string' },
          presenting_condition: { type: 'string' },
        },
        required: ['is_referral', 'classification_reason', 'first_name', 'last_name'],
      },
    },
  },
};

/**
 * Sends a PDF buffer to Amazon Nova Pro via Bedrock and returns structured patient data.
 * Returns an object with fields matching the extraction tool schema; missing fields are empty strings.
 */
async function extractReferralData(pdfBuffer) {
  const client = await getClient();

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{
      role: 'user',
      content: [
        {
          document: {
            name: 'referral',
            format: 'pdf',
            source: { bytes: pdfBuffer },
          },
        },
        {
          text: `Extract patient referral information from this document using the extract_referral tool.

Important distinctions:
- "referring_doctor" and "referring_practice" are the GP or specialist WHO IS WRITING THE REFERRAL (the sender/author), not the clinic or practice the referral is addressed to.
- "provider_number" is the referring doctor's Medicare provider number, found near their signature or letterhead.
- Ignore any clinic name that appears as the recipient or addressee of the referral (e.g. a physiotherapy practice receiving the referral).
- "presenting_condition" is the clinical reason for the referral as stated by the referring doctor.

For is_referral: set true only if a GP or medical specialist SIGNED this document to refer a patient to a treating clinician. The author must be a doctor. Set false if: the document is authored/signed by a physiotherapist, exercise physiologist, or other allied health clinician (consultation reports, progress notes, clinical letters from the treating clinician back to the GP); or if it is an insurance form, Guild Insurance document, WorkCover/TAC/CTP form, billing statement, or service agreement. If is_referral=false, set first_name and last_name to empty strings.`,
        },
      ],
    }],
    toolConfig: {
      tools: [EXTRACTION_TOOL],
      toolChoice: { tool: { name: 'extract_referral' } },
    },
    inferenceConfig: { temperature: 0 },
  });

  const response = await client.send(command);
  const toolUse = response.output?.message?.content?.find((b) => b.toolUse);
  if (!toolUse) throw new Error('Bedrock returned no tool use block');

  return toolUse.toolUse.input;
}

module.exports = { extractReferralData };
