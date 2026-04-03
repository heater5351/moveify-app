// AI Assistant service — Claude API integration for exercise program generation
const Anthropic = require('@anthropic-ai/sdk').default;
const { matchExercises } = require('./exercise-matcher');
const { stripPhiWithLookup } = require('./phi-stripper');

const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '4096', 10);

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Build the system prompt with exercise library and protocols
 * @param {Array} exercises - Exercise library (compact JSON)
 * @param {Array} protocols - Clinician protocols
 * @returns {string}
 */
function buildSystemPrompt(exercises, protocols = []) {
  const exerciseList = exercises.map(e => {
    const parts = [e.name];
    if (e.exerciseType && e.exerciseType !== 'reps') parts.push(`(${e.exerciseType})`);
    if (e.equipment) parts.push(`[${e.equipment}]`);
    if (e.jointArea) parts.push(`{${e.jointArea}}`);
    if (e.muscleGroup) parts.push(`<${e.muscleGroup}>`);
    return parts.join(' ');
  }).join('\n');

  let protocolSection = '';
  if (protocols.length > 0) {
    protocolSection = `\n\n## Clinical Protocols\nThe clinician has provided the following treatment protocols. Use these to guide your exercise selection and progression when relevant:\n\n${protocols.map(p => `### ${p.name}${p.category ? ` (${p.category})` : ''}\n${p.content}`).join('\n\n')}`;
  }

  return `You are an AI exercise program assistant for Moveify, a clinical exercise prescription platform used by physiotherapists and exercise physiologists in Australia.

## Your Role
- Help clinicians build exercise programs from SOAP notes, injury descriptions, or general requests
- Suggest exercises ONLY from the provided exercise library below
- Provide evidence-based exercise prescriptions (sets, reps, weight, duration)
- Consider the patient's condition, stage of recovery, and contraindications
- Be concise and clinical in your responses

## Exercise Library
Available exercises (format: Name (type) [equipment] {joint area} <muscle group>):
${exerciseList}

## CRITICAL RULES
1. ONLY suggest exercises that exist in the library above. Never invent exercises.
2. Use the EXACT exercise name from the library.
3. When suggesting a program, output a fenced code block with the label \`program-exercises\` containing a JSON array.
4. Each exercise object must have: name (string), sets (number), reps (number), and optionally: prescribedWeight (number, kg), prescribedDuration (number, seconds), restDuration (number, seconds), instructions (string), isWarmup (boolean, default false — set to true for warm-up exercises).
5. For duration-type exercises, use prescribedDuration instead of reps.
6. For cardio-type exercises, use prescribedDuration (in seconds) and sets=1.
7. Default prescriptions if not specified: reps exercises = 3 sets x 10 reps, duration exercises = 3 sets x 30 seconds, cardio = 1 set x 1200 seconds (20 min).
8. Consider the patient's stage of recovery:
   - Early rehab: isometric/supported exercises, lower volume
   - Mid rehab: progressive loading, moderate volume
   - Late rehab/return to sport: compound movements, higher intensity
9. Explain your reasoning briefly after the program block.
10. If the clinician mentions specific protocols, follow them.

## Output Format Example
\`\`\`program-exercises
[
  { "name": "Squat with Bodyweight", "sets": 2, "reps": 10, "isWarmup": true, "instructions": "Light warm-up, focus on range of motion" },
  { "name": "Squat with Barbell", "sets": 3, "reps": 12, "instructions": "Focus on depth and knee tracking" },
  { "name": "Calf Raise Hold with Bodyweight", "sets": 3, "prescribedDuration": 30, "instructions": "Hold at top position" }
]
\`\`\`
When suggesting a program, include warm-up exercises (isWarmup: true) before the main exercises if appropriate. Warm-up exercises are typically lighter, lower volume, and prepare the joints/muscles for the main program.

## Periodization Blocks
When the clinician asks for a periodized program, progressive overload, or a multi-week block, output a \`program-block\` fenced code block IN ADDITION to the \`program-exercises\` block. The \`program-exercises\` block defines the base exercises; the \`program-block\` defines weekly progressions.

The \`program-block\` JSON object must have:
- blockDuration (number): total weeks (4, 6, or 8)
- weeks (array): one entry per exercise per week, each with:
  - exerciseIndex (number): 0-based index into the program-exercises array
  - weekNumber (number): 1-based week number
  - sets (number)
  - reps (number)
  - weight (number or null, in kg)
  - duration (number or null, in seconds — for duration/cardio exercises)
  - restDuration (number or null, in seconds)
  - rpeTarget (number or null, 1-10 scale)
  - notes (string or null)

Only output a \`program-block\` if periodization is requested or clearly implied (e.g., "progressive program", "6-week block", "build up over time"). Do NOT output a \`program-block\` for simple one-off program requests.

**IMPORTANT:** Periodization blocks must NEVER include warm-up exercises. Only reference non-warm-up exercises by their exerciseIndex in the \`program-block\`. Warm-up exercises keep their base prescription and do not progress.

### Periodization Block Example
\`\`\`program-block
{
  "blockDuration": 4,
  "weeks": [
    { "exerciseIndex": 0, "weekNumber": 1, "sets": 3, "reps": 10, "weight": 20, "duration": null, "restDuration": 60, "rpeTarget": 6, "notes": null },
    { "exerciseIndex": 0, "weekNumber": 2, "sets": 3, "reps": 10, "weight": 25, "duration": null, "restDuration": 60, "rpeTarget": 7, "notes": null },
    { "exerciseIndex": 0, "weekNumber": 3, "sets": 4, "reps": 8, "weight": 30, "duration": null, "restDuration": 90, "rpeTarget": 7, "notes": null },
    { "exerciseIndex": 0, "weekNumber": 4, "sets": 4, "reps": 8, "weight": 32.5, "duration": null, "restDuration": 90, "rpeTarget": 8, "notes": "Deload next week if RPE > 8" }
  ]
}
\`\`\`
${protocolSection}

## Privacy
- Patient identifying information has been automatically removed from messages
- Never ask for patient names, DOBs, or contact details
- Refer to the patient as "the patient" or "your patient"`;
}

/**
 * Parse exercise suggestions from AI response text
 * @param {string} responseText - Full AI response
 * @param {Array} exercises - Exercise library for matching
 * @returns {{ exercises: Array, rawText: string }}
 */
function parseExerciseResponse(responseText, exercises) {
  // Extract program-exercises JSON block
  const blockRegex = /```program-exercises\s*\n([\s\S]*?)```/;
  const match = responseText.match(blockRegex);

  if (!match) {
    return { exercises: [], rawText: responseText };
  }

  try {
    const suggested = JSON.parse(match[1]);
    if (!Array.isArray(suggested)) {
      return { exercises: [], rawText: responseText };
    }

    // Run fuzzy matching against the library
    const matched = matchExercises(suggested, exercises);
    return { exercises: matched, rawText: responseText };
  } catch (error) {
    console.error('Failed to parse AI exercise response:', error.message);
    return { exercises: [], rawText: responseText };
  }
}

/**
 * Stream a chat completion from Claude
 * @param {Array} messages - Conversation messages [{ role, content }]
 * @param {Array} exercises - Exercise library
 * @param {Array} protocols - Clinician protocols
 * @returns {AsyncIterable} - Yields { type: 'text'|'done', text?, usage? }
 */
async function* streamChat(messages, exercises, protocols = []) {
  const anthropic = getClient();
  const systemPrompt = buildSystemPrompt(exercises, protocols);

  // Strip PHI from all user messages
  const cleanedMessages = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      const { cleaned } = await stripPhiWithLookup(msg.content);
      cleanedMessages.push({ role: msg.role, content: cleaned });
    } else {
      cleanedMessages.push(msg);
    }
  }

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: cleanedMessages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'text', text: event.delta.text };
    }
  }

  const finalMessage = await stream.finalMessage();
  yield {
    type: 'done',
    usage: {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    }
  };
}

/**
 * Parse periodization block from AI response text
 * @param {string} responseText - Full AI response
 * @returns {{ blockDuration: number, weeks: Array } | null}
 */
function parseBlockResponse(responseText) {
  const blockRegex = /```program-block\s*\n([\s\S]*?)```/;
  const match = responseText.match(blockRegex);

  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed.blockDuration || !Array.isArray(parsed.weeks)) return null;

    // Validate and clean week entries
    const weeks = parsed.weeks
      .filter(w => typeof w.exerciseIndex === 'number' && typeof w.weekNumber === 'number')
      .map(w => ({
        exerciseIndex: w.exerciseIndex,
        weekNumber: w.weekNumber,
        sets: w.sets || 3,
        reps: w.reps || 10,
        weight: w.weight ?? null,
        duration: w.duration ?? null,
        restDuration: w.restDuration ?? null,
        rpeTarget: w.rpeTarget ?? null,
        notes: w.notes ?? null,
      }));

    return {
      blockDuration: Math.min(Math.max(parsed.blockDuration, 1), 12),
      weeks,
    };
  } catch (error) {
    console.error('Failed to parse AI block response:', error.message);
    return null;
  }
}

module.exports = { buildSystemPrompt, parseExerciseResponse, parseBlockResponse, streamChat, getClient };
