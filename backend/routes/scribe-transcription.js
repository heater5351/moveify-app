/**
 * WebSocket route for real-time audio transcription.
 * Browser sends audio chunks → AWS Transcribe Streaming → transcript fragments.
 * Processed in ap-southeast-2 (Sydney). PHI stays in Australia.
 *
 * Also drives live clinical suggestions via Claude.
 *
 * Auth: the FIRST message on the socket must be {type:'auth', token, sessionId?}.
 * The token never travels in the URL — query strings end up in Cloud Run
 * request logs, and an ID token in a log line is a live session.
 */
const db = require('../database/db');
const { verifyToken } = require('../middleware/auth');
const { createLiveTranscription } = require('../services/scribe-transcribe');
const { getPatientSummary } = require('../services/scribe-summary');
const { generateSuggestion } = require('../services/scribe-suggestions');
const { encrypt } = require('../services/scribe-encryption');
const audit = require('../services/audit');

const SEGMENTS_PER_SUGGESTION = 10;
const TIME_INTERVAL_MS = 60_000;
const SUGGESTION_COOLDOWN_MS = 60_000;
const AUTH_TIMEOUT_MS = 10_000;

function registerScribeTranscriptionWs(app) {
  app.ws('/ws/scribe/transcribe', (ws, req) => {
    // ---- Auth handshake: wait for the first message, must be an auth frame ----
    const authTimer = setTimeout(() => {
      ws.close(4001, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);

    ws.once('message', async (data) => {
      clearTimeout(authTimer);

      let authMsg;
      try {
        authMsg = JSON.parse(data.toString());
      } catch {
        ws.close(4001, 'Authentication required');
        return;
      }
      if (authMsg.type !== 'auth' || !authMsg.token) {
        ws.close(4001, 'Authentication required');
        return;
      }

      let user;
      try {
        // Skip the revocation check — WS sessions are short-lived and the
        // ~100-400ms HTTP round-trip dominates Record-button latency.
        user = await verifyToken(authMsg.token, { checkRevoked: false });
      } catch {
        ws.close(4001, 'Invalid token');
        return;
      }

      if (user.role !== 'clinician') { ws.close(4003, 'Clinicians only'); return; }

      // Verify session ownership BEFORE anything can write to it — the 30s
      // auto-save below upserts transcripts by session_id, so an unverified
      // sessionId would let any clinician token overwrite another session.
      const sessionId = authMsg.sessionId ? parseInt(authMsg.sessionId, 10) : null;
      let patientId = null;
      if (sessionId) {
        try {
          const result = await db.query(
            'SELECT patient_id FROM scribe_sessions WHERE id = $1 AND clinician_id = $2',
            [sessionId, user.id]
          );
          if (result.rows.length === 0) {
            ws.close(4003, 'Session not found');
            return;
          }
          patientId = result.rows[0].patient_id || null;
        } catch (err) {
          console.error('Session lookup error:', err.message);
          ws.close(1011, 'Session lookup failed');
          return;
        }
      }

      if (ws.readyState !== 1) return; // client went away during auth

      console.log(`Scribe WS connected for clinician ${user.id}`);
      startSession(ws, req, user, sessionId, patientId);
      ws.send(JSON.stringify({ type: 'ready' }));
    });
  });
}

function startSession(ws, req, user, sessionId, patientId) {
  const finalSegments = [];
  let lastSuggestionAt = 0;
  let segmentsAtLastSuggestion = 0;
  let suggestionInFlight = false;
  let lastAutoSavedCount = 0;

  // Auto-save transcript to DB every 30s so recordings survive disconnects
  const autoSaveInterval = sessionId ? setInterval(async () => {
    if (finalSegments.length === lastAutoSavedCount) return;
    try {
      const text = finalSegments.join(' ');
      await db.query(
        `INSERT INTO transcripts (session_id, content_enc, word_count)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id) DO UPDATE SET content_enc = $2, word_count = $3`,
        [sessionId, encrypt(text), text.split(/\s+/).length]
      );
      lastAutoSavedCount = finalSegments.length;
    } catch (err) {
      console.error('Transcript auto-save error:', err.message);
    }
  }, 30_000) : null;

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
      console.error('Transcribe stream error:', err.message);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'error', message: 'Transcription service error' }));
      }
    },
    onClose() { console.log('Transcribe stream closed'); },
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
    if (autoSaveInterval) clearInterval(autoSaveInterval);
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
}

module.exports = { registerScribeTranscriptionWs };
