/**
 * WebSocket route for real-time audio transcription.
 * Browser sends audio chunks → Deepgram Nova-2 → returns transcript fragments.
 * Processed in ap-southeast-2 (Sydney). PHI stays in Australia.
 *
 * Also drives live clinical suggestions (Nova Lite + Claude Sonnet 4.6).
 */
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { createLiveTranscription } = require('../services/scribe-transcribe');
const { getPatientSummary } = require('../services/scribe-summary');
const { generateSuggestion } = require('../services/scribe-suggestions');
const audit = require('../services/audit');

const SEGMENTS_PER_SUGGESTION = 10;
const TIME_INTERVAL_MS = 60_000;
const SUGGESTION_COOLDOWN_MS = 60_000;

function registerScribeTranscriptionWs(app) {
  app.ws('/ws/scribe/transcribe', async (ws, req) => {
    // Authenticate via query param token (same JWT as HTTP requests)
    const token = req.query.token;
    if (!token) { ws.close(4001, 'Authentication required'); return; }

    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    if (user.role !== 'clinician') { ws.close(4003, 'Clinicians only'); return; }

    console.log(`Scribe WS connected for clinician ${user.id}`);

    // Look up patient_id from session for summary context
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId, 10) : null;
    let patientId = null;
    if (sessionId) {
      try {
        const result = await db.query(
          'SELECT patient_id FROM scribe_sessions WHERE id = $1 AND clinician_id = $2',
          [sessionId, user.id]
        );
        patientId = result.rows[0]?.patient_id || null;
      } catch (err) {
        console.error('Session lookup error:', err.message);
      }
    }

    const finalSegments = [];
    let lastSuggestionAt = 0;
    let segmentsAtLastSuggestion = 0;
    let suggestionInFlight = false;

    // Suggestion interval — fires on segment count or time threshold
    const silenceCheckInterval = setInterval(async () => {
      if (ws.readyState !== 1) return;
      if (suggestionInFlight || finalSegments.length === 0) return;

      const timeSinceLast = Date.now() - lastSuggestionAt;
      if (timeSinceLast < SUGGESTION_COOLDOWN_MS) return;

      const newSegments = finalSegments.length - segmentsAtLastSuggestion;
      const enoughSegments = newSegments >= SEGMENTS_PER_SUGGESTION;
      const timeIntervalReached = lastSuggestionAt > 0 && timeSinceLast >= TIME_INTERVAL_MS && newSegments > 0;
      const firstSuggestion = lastSuggestionAt === 0 && finalSegments.length >= SEGMENTS_PER_SUGGESTION;

      if (!enoughSegments && !timeIntervalReached && !firstSuggestion) return;

      suggestionInFlight = true;
      lastSuggestionAt = Date.now();
      segmentsAtLastSuggestion = finalSegments.length;

      try {
        const recentTranscript = finalSegments.slice(-30).join(' ');
        const patientSummaryData = patientId ? await getPatientSummary(patientId) : null;
        const suggestion = await generateSuggestion({
          recentTranscript,
          patientSummary: patientSummaryData?.summary || null,
        });
        if (suggestion && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'suggestion', ...suggestion }));
        }
      } catch (err) {
        console.error('Suggestion error:', err.message);
        lastSuggestionAt = 0;
      } finally {
        suggestionInFlight = false;
      }
    }, 5_000);

    const transcribe = createLiveTranscription({
      onTranscript({ text, isFinal, speaker }) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'transcript', text, isFinal, speaker }));
        }
        if (isFinal && text.trim()) finalSegments.push(text.trim());
      },
      onError(err) {
        console.error('Deepgram error:', err.message);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'Transcription service error' }));
        }
      },
      onClose() { console.log('Deepgram stream closed'); },
    });

    // Build a minimal req-like object for audit.log (WS doesn't have a standard Express req)
    const auditReq = { user: { id: user.id }, ip: req.ip || req.socket?.remoteAddress || null, connection: {} };
    audit.log(auditReq, 'recording_start', 'transcription');

    ws.on('message', (data) => {
      if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
        transcribe.send(data);
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'stop') {
            transcribe.close();
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'final_transcript', text: finalSegments.join(' ') }));
            }
          }
        } catch { /* not JSON — ignore */ }
      }
    });

    function cleanup() {
      clearInterval(silenceCheckInterval);
      transcribe.close();
    }

    ws.on('close', () => {
      console.log(`Scribe WS closed for clinician ${user.id}`);
      cleanup();
      audit.log(auditReq, 'recording_stop', 'transcription');
    });

    ws.on('error', (err) => {
      console.error('Scribe WS error:', err.message);
      cleanup();
    });
  });
}

module.exports = { registerScribeTranscriptionWs };
