/**
 * Live clinical suggestion service.
 *
 * Phase classification: Amazon Nova Micro (ap-southeast-2, direct)
 * Evidence retrieval:   NCBI PubMed E-utilities API (no PHI sent — clean keyword query only)
 * Suggestion generation: Claude Sonnet 4.6 via AWS Bedrock APAC cross-region inference
 *
 * PHI stays in Australia (ap-southeast-2). No PHI sent to PubMed.
 */
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const https = require('https');

const client = new BedrockRuntimeClient({ region: 'ap-southeast-2' });

// Nova Lite: fast, cost-effective, good quality for short clinical suggestions
const SUGGESTION_MODEL = 'amazon.nova-lite-v1:0';
// Nova Micro: cheapest, used for phase classification only
const NOVA_MICRO_MODEL = 'amazon.nova-micro-v1:0';

/**
 * Use Nova Micro to classify the session phase and produce a clean clinical search query.
 * The search query must contain NO patient-identifying information.
 * @param {string} transcript - Recent transcript text
 * @returns {Promise<{ phase: 'subjective'|'objective'|'planning', searchQuery: string }>}
 */
async function classifyPhaseAndQuery(transcript) {
  const command = new ConverseCommand({
    modelId: NOVA_MICRO_MODEL,
    messages: [{
      role: 'user',
      content: [{
        text: `Analyse this exercise physiology consultation excerpt. Respond with exactly two lines:
Line 1: The consultation phase — exactly one of: subjective, objective, planning
Line 2: A clinical PubMed search query (3-6 medical/physiology keywords, NO patient names, NO identifying info)

Transcript:
${transcript.slice(-1200)}

Two lines only.`,
      }],
    }],
    inferenceConfig: { maxTokens: 60, temperature: 0 },
  });

  const resp = await client.send(command);
  const lines = resp.output.message.content[0].text.trim().split('\n').map(l => l.trim().toLowerCase());

  let phase = 'subjective';
  if ((lines[0] || '').includes('objective')) phase = 'objective';
  else if ((lines[0] || '').includes('plan')) phase = 'planning';

  // Strip quotes/labels Nova Micro sometimes adds, convert commas to spaces, cap at 3 terms
  const searchQuery = (lines[1] || '')
    .replace(/^(line 2:|search:|query:)/i, '')
    .replace(/['"]/g, '')
    .replace(/,\s*/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
  return { phase, searchQuery };
}

/**
 * Fetch top PubMed article titles for a clinical query.
 * Uses NCBI E-utilities (free, unauthenticated). No PHI sent.
 * @param {string} query
 * @returns {Promise<{ title: string, url: string }[]>}
 */
function fetchPubmedRefs(query) {
  return new Promise((resolve) => {
    if (!query || query.length < 5) { resolve([]); return; }

    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmax=3&retmode=json&sort=relevance&term=${encodeURIComponent(query)}`;

    const req = https.get(searchUrl, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const ids = (parsed.esearchresult?.idlist || []).slice(0, 3);
          if (ids.length === 0) { resolve([]); return; }

          const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;

          const req2 = https.get(summaryUrl, (res2) => {
            let data2 = '';
            res2.on('data', chunk => { data2 += chunk; });
            res2.on('end', () => {
              try {
                const parsed2 = JSON.parse(data2);
                const refs = ids
                  .map(id => {
                    const item = parsed2.result?.[id];
                    if (!item || !item.title) return null;
                    return {
                      title: item.title.replace(/<[^>]+>/g, ''),
                      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                    };
                  })
                  .filter(Boolean);
                resolve(refs);
              } catch { resolve([]); }
            });
          });
          req2.on('error', () => resolve([]));
          req2.setTimeout(6000, () => { req2.destroy(); resolve([]); });
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(6000, () => { req.destroy(); resolve([]); });
  });
}

/**
 * Build a phase-aware system prompt for Claude.
 * @param {'subjective'|'objective'|'planning'} phase
 */
function buildSystemPrompt(phase) {
  const phaseGuidance = {
    subjective: 'The consultation is in the subjective phase (history-taking). Consider: unexplored symptom patterns, relevant psychosocial factors, screening questions for red flags, or aspects of the history that may need clarification.',
    objective: 'The consultation is in the objective/assessment phase. Consider: appropriate clinical tests, outcome measures, movement screens, or assessment approaches for the presenting condition.',
    planning: 'The consultation is in the planning/treatment phase. Consider: evidence-based exercise prescription, load management principles, return-to-function progressions, patient education, or home programme considerations.',
  };

  return `You are a real-time clinical decision support assistant for an exercise physiologist in active consultation.

${phaseGuidance[phase]}

Provide exactly ONE concise, clinically actionable suggestion based on what you hear. Rules:
- One suggestion only — the highest-value clinical prompt
- CRITICAL: Your suggestion MUST relate specifically to the body part, condition, and context being discussed in the transcript. Never suggest something for a different body part or unrelated condition.
- Maximum 55 words
- Specific and actionable (e.g. "Consider testing hip abductor strength — weakness is frequently associated with this pattern of anterior knee pain")
- Do not repeat what the clinician has already addressed
- Do not diagnose — support clinical reasoning only
- Professional peer tone, not instructive`;
}

/**
 * Generate a single clinical suggestion for the current session.
 * @param {object} params
 * @param {string} params.recentTranscript - Accumulated session transcript (last ~2000 chars used)
 * @param {string|null} params.patientSummary - Prior patient history summary from rolling summary service
 * @returns {Promise<{ text: string, phase: string, refs: { title: string, url: string }[] }|null>}
 */
async function generateSuggestion({ recentTranscript, patientSummary }) {
  if (!recentTranscript || recentTranscript.trim().length < 40) return null;

  const { phase, searchQuery } = await classifyPhaseAndQuery(recentTranscript);

  const [refs, text] = await Promise.all([
    fetchPubmedRefs(searchQuery),
    (async () => {
      // Use only the last ~400 chars for the suggestion — this tracks topic drift
      // so if the conversation moves from knee to shoulder, the suggestion follows
      const suggestionWindow = recentTranscript.slice(-400);
      let userMessage = `Recent consultation transcript:\n${suggestionWindow}`;
      if (patientSummary) {
        userMessage = `Prior patient history:\n${patientSummary}\n\n---\n\n${userMessage}`;
      }

      const command = new ConverseCommand({
        modelId: SUGGESTION_MODEL,
        messages: [{ role: 'user', content: [{ text: userMessage }] }],
        system: [{ text: buildSystemPrompt(phase) }],
        inferenceConfig: { maxTokens: 130, temperature: 0.4 },
      });

      const resp = await client.send(command);
      return resp.output.message.content[0].text.trim();
    })(),
  ]);

  return { text, phase, refs };
}

module.exports = { generateSuggestion };
