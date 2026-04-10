import { useState, useRef, useCallback, useEffect } from 'react';
import { getToken } from '../utils/api';
import { API_URL } from '../config';
import type { Suggestion } from '../types';

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
}

export function useAudioRecorder({ onTranscript, onFinalTranscript, onError, onSuggestion, sessionId }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animFrameRef = useRef<number>(0);

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

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]!));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        ws.send(pcm16.buffer);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setIsRecording(true);
      setIsPaused(false);
      updateAudioLevel();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  }, [onTranscript, onFinalTranscript, onError, onSuggestion, sessionId, updateAudioLevel]);

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

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      processorRef.current?.disconnect();
      audioCtxRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return { isRecording, isPaused, audioLevel, start, pause, resume, stop };
}
