// AI Assistant routes — chat, usage tracking, protocol management
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { streamChat, parseExerciseResponse } = require('../services/ai-assistant');
const audit = require('../services/audit');

const router = express.Router();

// All AI routes require clinician authentication
router.use(authenticate, requireRole('clinician'));

// Dedicated rate limit for AI endpoints: 10 req/min per IP
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many AI requests. Please wait a moment.' }
});
router.use(aiLimiter);

const DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || '50', 10);
const MAX_MESSAGES_PER_CONVERSATION = 20;

// Load exercise library (cached on first request)
let exerciseLibrary = null;
function getExerciseLibrary() {
  if (!exerciseLibrary) {
    exerciseLibrary = require('../data/default-exercises.json');
  }
  return exerciseLibrary;
}

/**
 * Check daily usage for a clinician
 */
async function getDailyUsage(clinicianId) {
  const result = await db.getOne(
    `SELECT COUNT(*) as count FROM ai_usage_log
     WHERE clinician_id = $1 AND created_at >= CURRENT_DATE`,
    [clinicianId]
  );
  return parseInt(result?.count || '0', 10);
}

/**
 * Log AI usage
 */
async function logUsage(clinicianId, inputTokens, outputTokens, model, requestType) {
  await db.query(
    `INSERT INTO ai_usage_log (clinician_id, input_tokens, output_tokens, model, request_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [clinicianId, inputTokens, outputTokens, model, requestType]
  );
}

// ============= CHAT ENDPOINT (SSE Streaming) =============

/**
 * POST /api/ai/chat
 * Body: { messages: [{ role, content }] }
 * Response: SSE stream with text chunks and exercise matches
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const clinicianId = req.user.id;

    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      return res.status(400).json({ error: `Maximum ${MAX_MESSAGES_PER_CONVERSATION} messages per conversation` });
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content || typeof msg.content !== 'string') {
        return res.status(400).json({ error: 'Each message must have role and content' });
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        return res.status(400).json({ error: 'Message role must be "user" or "assistant"' });
      }
      // Strip HTML/script tags from user input
      if (msg.role === 'user') {
        msg.content = msg.content.replace(/<[^>]*>/g, '');
      }
    }

    // Check daily limit
    const usage = await getDailyUsage(clinicianId);
    if (usage >= DAILY_LIMIT) {
      return res.status(429).json({
        error: 'Daily AI usage limit reached. Limit resets at midnight.',
        dailyUsage: usage,
        dailyLimit: DAILY_LIMIT
      });
    }

    // Check for ANTHROPIC_API_KEY
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI assistant is not configured. Contact your administrator.' });
    }

    // Load protocols for this clinician
    const protocolResult = await db.query(
      `SELECT name, content, category FROM clinician_protocols
       WHERE created_by = $1 OR is_global = TRUE
       ORDER BY is_global DESC, name ASC`,
      [clinicianId]
    );

    const exercises = getExerciseLibrary();
    const protocols = protocolResult.rows;

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    let fullResponse = '';

    try {
      for await (const chunk of streamChat(messages, exercises, protocols)) {
        if (chunk.type === 'text') {
          fullResponse += chunk.text;
          res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.text })}\n\n`);
        } else if (chunk.type === 'done') {
          // Parse exercises from the complete response
          const parsed = parseExerciseResponse(fullResponse, exercises);

          // Log usage (fire-and-forget)
          logUsage(
            clinicianId,
            chunk.usage.inputTokens,
            chunk.usage.outputTokens,
            process.env.AI_MODEL || 'claude-sonnet-4-20250514',
            'chat'
          ).catch(err => console.error('Failed to log AI usage:', err.message));

          // Audit log (no message content for privacy)
          audit.log(req, 'ai_chat', 'ai_assistant', null, {
            messageCount: messages.length,
            inputTokens: chunk.usage.inputTokens,
            outputTokens: chunk.usage.outputTokens,
            exercisesMatched: parsed.exercises.length,
          });

          // Send exercise matches
          if (parsed.exercises.length > 0) {
            res.write(`data: ${JSON.stringify({
              type: 'exercises',
              exercises: parsed.exercises.map(e => ({
                suggested: e.suggested,
                matched: e.matchedExercise ? {
                  name: e.matchedExercise.name,
                  exerciseType: e.matchedExercise.exerciseType || 'reps',
                  equipment: e.matchedExercise.equipment,
                  jointArea: e.matchedExercise.jointArea,
                  muscleGroup: e.matchedExercise.muscleGroup,
                } : null,
                confidence: e.confidence,
                score: e.score,
              }))
            })}\n\n`);
          }

          // Send done event
          res.write(`data: ${JSON.stringify({
            type: 'done',
            usage: {
              inputTokens: chunk.usage.inputTokens,
              outputTokens: chunk.usage.outputTokens,
              dailyUsage: usage + 1,
              dailyLimit: DAILY_LIMIT,
            }
          })}\n\n`);
        }
      }
    } catch (streamError) {
      console.error('AI stream error:', streamError.message);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI processing failed. Please try again.' })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('AI chat error:', error.message);
    // If headers haven't been sent yet, return JSON error
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process AI request' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'An unexpected error occurred' })}\n\n`);
      res.end();
    }
  }
});

// ============= USAGE ENDPOINT =============

/**
 * GET /api/ai/usage
 * Returns daily usage count for current clinician
 */
router.get('/usage', async (req, res) => {
  try {
    const usage = await getDailyUsage(req.user.id);
    res.json({ dailyUsage: usage, dailyLimit: DAILY_LIMIT });
  } catch (error) {
    console.error('Failed to get AI usage:', error.message);
    res.status(500).json({ error: 'Failed to get usage data' });
  }
});

// ============= PROTOCOL ENDPOINTS =============

/**
 * GET /api/ai/protocols
 * List protocols (own + global)
 */
router.get('/protocols', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cp.*, u.name as created_by_name
       FROM clinician_protocols cp
       LEFT JOIN users u ON cp.created_by = u.id
       WHERE cp.created_by = $1 OR cp.is_global = TRUE
       ORDER BY cp.is_global DESC, cp.name ASC`,
      [req.user.id]
    );
    res.json({ protocols: result.rows });
  } catch (error) {
    console.error('Failed to list protocols:', error.message);
    res.status(500).json({ error: 'Failed to load protocols' });
  }
});

/**
 * POST /api/ai/protocols
 * Create a new protocol
 */
router.post('/protocols', async (req, res) => {
  try {
    const { name, content, category, isGlobal } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    // Only admins can create global protocols
    const global = isGlobal && req.user.is_admin ? true : false;

    const result = await db.getOne(
      `INSERT INTO clinician_protocols (name, content, category, created_by, is_global)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), content.trim(), category?.trim() || null, req.user.id, global]
    );

    res.status(201).json({ protocol: result });
  } catch (error) {
    console.error('Failed to create protocol:', error.message);
    res.status(500).json({ error: 'Failed to create protocol' });
  }
});

/**
 * PUT /api/ai/protocols/:id
 * Update a protocol
 */
router.put('/protocols/:id', async (req, res) => {
  try {
    const { name, content, category, isGlobal } = req.body;
    const protocolId = parseInt(req.params.id, 10);

    // Check ownership
    const existing = await db.getOne(
      'SELECT * FROM clinician_protocols WHERE id = $1',
      [protocolId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Protocol not found' });
    }
    if (existing.created_by !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Cannot edit another clinician\'s protocol' });
    }

    const global = isGlobal && req.user.is_admin ? true : false;

    const result = await db.getOne(
      `UPDATE clinician_protocols
       SET name = $1, content = $2, category = $3, is_global = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name?.trim() || existing.name, content?.trim() || existing.content, category?.trim() || null, global, protocolId]
    );

    res.json({ protocol: result });
  } catch (error) {
    console.error('Failed to update protocol:', error.message);
    res.status(500).json({ error: 'Failed to update protocol' });
  }
});

/**
 * DELETE /api/ai/protocols/:id
 * Delete a protocol (own only, or admin)
 */
router.delete('/protocols/:id', async (req, res) => {
  try {
    const protocolId = parseInt(req.params.id, 10);

    const existing = await db.getOne(
      'SELECT * FROM clinician_protocols WHERE id = $1',
      [protocolId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Protocol not found' });
    }
    if (existing.created_by !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Cannot delete another clinician\'s protocol' });
    }

    await db.query('DELETE FROM clinician_protocols WHERE id = $1', [protocolId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete protocol:', error.message);
    res.status(500).json({ error: 'Failed to delete protocol' });
  }
});

module.exports = router;
