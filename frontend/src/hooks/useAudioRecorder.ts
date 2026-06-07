import { useState, useRef, useCallback, useEffect } from 'react';
import { getToken } from '../utils/api';
import { API_URL } from '../config';
import type { Suggestion } from '../types';

// --- Voice-activity-detection / cost-control tuning ---
// AWS Transcribe streaming bills per second of audio SENT, so we suppress
// near-silent frames instead of streaming the whole consult wall-clock. Biased
// conservatively toward sending (clinical accuracy matters more than the cents).
const VAD_RMS_THRESHOLD = 0.008;          // raw RMS above this = speech (noiseSuppression is on, so silence sits well below)
const VAD_HANGOVER_MS = 1000;             // keep streaming this long after the last detected speech so word-endings aren't clipped
const VAD_PREROLL_FRAMES = 3;             // re-send this many buffered pre-onset frames (~0.75s) so the attack isn't clipped
const STREAM_KEEPALIVE_MS = 10000;        // during real silence, still send one frame at least this often — AWS ends a streaming session after ~15s of no audio
const DEFAULT_IDLE_AUTOSTOP_MS = 15 * 60 * 1000; // safety net: auto-stop after this long with no speech at all (forgotten sessions)

interface TranscriptFragment {
  text: string;
  isFinal: boolean;
  speaker: number | null;
}

interface UseAudioRecorderOptions {
  onTranscript: (fragment: TranscriptFragment) => void;
  onFinalTranscript: (fullText: string) => void;
  onError: (message: string) => void;
  onSuggestion?: (suggestion: Suggestion) => void;
  sessionId?: number | null;
  /** Auto-stop after this many ms with no detected speech. 0 disables. Default 15 min. */
  idleAutoStopMs?: number;
  /** Called when the recorder auto-stops due to inactivity (for a UI toast). */
  onAutoStop?: () => void;
}

export function useAudioRecorder({ onTranscript, onFinalTranscript, onError, onSuggestion, sessionId, idleAutoStopMs = DEFAULT_IDLE_AUTOSTOP_MS, onAutoStop }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const idleTimerRef = useRef<number>(0);
  const stopRef = useRef<() => void>(() => {});

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const val = (data[i]! - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / data.length);
    setAudioLevel(Math.min(1, rms * 3));
    animFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Moveify uses localStorage token (12h) — no mid-session expiry risk
      const token = getToken();
      const sessionParam = sessionId ? `&sessionId=${sessionId}` : '';
      const wsUrl = API_URL.replace(/^http/, 'ws').replace('/api', '') + `/ws/scribe/transcribe?token=${token}${sessionParam}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'transcript') {
            onTranscript({ text: msg.text, isFinal: msg.isFinal, speaker: msg.speaker });
          } else if (msg.type === 'final_transcript') {
            onFinalTranscript(msg.text);
          } else if (msg.type === 'suggestion') {
            onSuggestion?.({ text: msg.text, phase: msg.phase, refs: msg.refs ?? [] });
          } else if (msg.type === 'error') {
            onError(msg.message);
          }
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      ws.onerror = () => onError('WebSocket connection error');

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // VAD state (scoped to this recording session; shared with the idle timer below)
      let lastSpeechAt = performance.now();   // last frame whose energy crossed the speech threshold
      let lastSentAt = 0;                      // last time we actually sent audio (for keepalive cadence)
      let wasSending = false;                  // were we streaming on the previous frame? (for pre-roll flush)
      const preroll: ArrayBuffer[] = [];       // recent pre-onset frames, re-sent so we don't clip the attack

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // RMS energy → voice activity
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) { const v = inputData[i]!; sum += v * v; }
        const rms = Math.sqrt(sum / inputData.length);
        const now = performance.now();
        if (rms > VAD_RMS_THRESHOLD) lastSpeechAt = now;
        const inSpeech = now - lastSpeechAt < VAD_HANGOVER_MS;

        // PCM16 encode (always — cheap; we just may not send it)
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]!));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        if (inSpeech) {
          // On speech onset, flush the buffered pre-onset frames so the first syllable isn't lost.
          if (!wasSending && preroll.length) {
            for (const buf of preroll) ws.send(buf);
            preroll.length = 0;
          }
          ws.send(pcm16.buffer);
          lastSentAt = now;
          wasSending = true;
        } else {
          wasSending = false;
          // Keep a short ring of recent frames as pre-roll for the next onset.
          preroll.push(pcm16.buffer);
          if (preroll.length > VAD_PREROLL_FRAMES) preroll.shift();
          // Keepalive: AWS Transcribe ends a streaming session after ~15s of no audio,
          // so during long silences send one frame periodically. Bills ~one frame
          // per STREAM_KEEPALIVE_MS instead of the whole silence.
          if (now - lastSentAt >= STREAM_KEEPALIVE_MS) {
            ws.send(pcm16.buffer);
            lastSentAt = now;
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      // Idle auto-stop: catch sessions left running with no speech at all.
      if (idleAutoStopMs > 0) {
        idleTimerRef.current = window.setInterval(() => {
          if (performance.now() - lastSpeechAt > idleAutoStopMs) {
            onAutoStop?.();
            stopRef.current();
          }
        }, 5000);
      }

      setIsRecording(true);
      setIsPaused(false);
      updateAudioLevel();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  }, [onTranscript, onFinalTranscript, onError, onSuggestion, sessionId, updateAudioLevel, idleAutoStopMs, onAutoStop]);

  const pause = useCallback(() => {
    processorRef.current?.disconnect();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (processorRef.current && audioCtxRef.current && analyserRef.current) {
      const source = audioCtxRef.current.createMediaStreamSource(streamRef.current!);
      source.connect(analyserRef.current);
      source.connect(processorRef.current);
      processorRef.current.connect(audioCtxRef.current.destination);
    }
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    if (idleTimerRef.current) { clearInterval(idleTimerRef.current); idleTimerRef.current = 0; }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      setTimeout(() => wsRef.current?.close(), 3000);
    }
    processorRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(animFrameRef.current);
    setIsRecording(false);
    setIsPaused(false);
    setAudioLevel(0);
  }, []);

  // Keep a stable ref so the idle timer (created in start) can call the latest stop().
  useEffect(() => { stopRef.current = stop; }, [stop]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      wsRef.current?.close();
      processorRef.current?.disconnect();
      audioCtxRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return { isRecording, isPaused, audioLevel, start, pause, resume, stop };
}
