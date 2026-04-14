import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Mic, Square, Pause, Play, Clock, ArrowRightLeft, Sparkles, Save, FileText, Check, Loader2 } from 'lucide-react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { apiFetch, generateHandout, revertSessionToDraft } from '../../utils/scribe-api';
import type { HandoutSections } from '../../types';
import HandoutPreview from './HandoutPreview';

interface ProgressNotePageProps {
  patientId: number;
  patientName: string;
  onBack: () => void;
  existingSessionId?: number;
  initialNote?: string;
  onRecordingActiveChange?: (active: boolean) => void;
  onSessionIdChange?: (sessionId: number) => void;
  /** Called after the note is successfully saved as final. */
  onNoteComplete?: () => void;
}

interface TranscriptLine {
  text: string;
  speaker: number | null;
}

export default function ProgressNotePage({ patientId, patientName, onBack, existingSessionId, initialNote, onRecordingActiveChange, onSessionIdChange, onNoteComplete }: ProgressNotePageProps) {
  const [sessionId, setSessionId] = useState<number | null>(existingSessionId ?? null);
  const [noteContent, setNoteContent] = useState(initialNote ?? '');
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interimText, setInterimText] = useState('');
  const [interimSpeaker, setInterimSpeaker] = useState<number | null>(null);
  const [speakerMap, setSpeakerMap] = useState<Record<number, 'clinician' | 'patient'>>({});
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [recordingDone, setRecordingDone] = useState(false);
  const [fullTranscript, setFullTranscript] = useState('');
  const [prevTranscript, setPrevTranscript] = useState('');
  const [saved, setSaved] = useState(false);
  const [generatingHandout, setGeneratingHandout] = useState(false);
  const [handoutSections, setHandoutSections] = useState<HandoutSections | null>(null);
  const [handoutError, setHandoutError] = useState('');
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  const linesRef = useRef<TranscriptLine[]>([]);
  const firstSpeakerRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<number | null>(existingSessionId ?? null);
  const prevTranscriptRef = useRef('');

  useEffect(() => {
    if (!existingSessionId) ensureSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!existingSessionId) return;
    apiFetch(`/sessions/${existingSessionId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setSessionStatus(data.status);
          setCompletedAt(data.endedAt ?? null);
        }
      })
      .catch(() => {});
    apiFetch(`/sessions/${existingSessionId}/transcript`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.content) {
          prevTranscriptRef.current = data.content;
          setPrevTranscript(data.content);
        }
      })
      .catch(() => {});
    apiFetch(`/sessions/${existingSessionId}/soap-note`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.content) setNoteContent(data.content);
      })
      .catch(() => {});
  }, [existingSessionId]);

  function assignSpeaker(speakerNum: number | null) {
    if (speakerNum === null) return;
    setSpeakerMap(prev => {
      if (prev[speakerNum]) return prev;
      if (firstSpeakerRef.current === null) {
        firstSpeakerRef.current = speakerNum;
        return { ...prev, [speakerNum]: 'clinician' };
      }
      return { ...prev, [speakerNum]: 'patient' };
    });
  }

  function getRoleLabel(speakerNum: number | null, map: Record<number, 'clinician' | 'patient'>): string {
    if (speakerNum === null) return '';
    const role = map[speakerNum];
    return role === 'clinician' ? 'Clinician' : role === 'patient' ? 'Patient' : '';
  }

  async function ensureSession(): Promise<number | null> {
    if (sessionIdRef.current) {
      // Existing session — don't fire onSessionIdChange (that's only for new recording sessions)
      return sessionIdRef.current;
    }
    try {
      const res = await apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({ patientId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      sessionIdRef.current = data.id;
      setSessionId(data.id);
      return data.id;
    } catch {
      return null;
    }
  }

  const handleFinalTranscript = useCallback((rawText: string) => {
    const labelled = linesRef.current.length > 0 ? linesRef.current.map(l => l.text).join('\n') : rawText;
    setFullTranscript(labelled);
    setRecordingDone(true);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const { isRecording, isPaused, audioLevel, start, pause, resume, stop } = useAudioRecorder({
    sessionId,
    onTranscript({ text, isFinal, speaker }) {
      assignSpeaker(speaker);
      if (isFinal) {
        const line = { text, speaker };
        linesRef.current.push(line);
        setLines(prev => [...prev, line]);
        setInterimText('');
        setInterimSpeaker(null);
      } else {
        setInterimText(text);
        setInterimSpeaker(speaker);
      }
    },
    onFinalTranscript: handleFinalTranscript,
    onError(message) { console.error('Recording error:', message); },
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, interimText]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording, isPaused]);

  // Notify parent when recording becomes active or inactive
  useEffect(() => {
    onRecordingActiveChange?.(isRecording && !isPaused);
  }, [isRecording, isPaused, onRecordingActiveChange]);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function handleSwapSpeakers() {
    setSpeakerMap(prev => {
      const next: Record<number, 'clinician' | 'patient'> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[Number(k)] = v === 'clinician' ? 'patient' : 'clinician';
      }
      return next;
    });
  }

  async function handleStartRecording() {
    setRecordingDone(false);
    setLines([]);
    linesRef.current = [];
    setInterimText('');
    setElapsedSecs(0);
    setFullTranscript('');
    setGenerateError('');
    firstSpeakerRef.current = null;
    setSpeakerMap({});
    const sid = await ensureSession();
    start();
    if (sid) onSessionIdChange?.(sid);
  }

  async function handlePause() {
    pause();
    // Save transcript draft to DB so it's preserved if the user navigates away
    const sid = sessionIdRef.current;
    if (!sid || linesRef.current.length === 0) return;
    try {
      await apiFetch(`/sessions/${sid}/transcript`, {
        method: 'POST',
        body: JSON.stringify({ transcript: buildLabelledNow() }),
      });
    } catch { /* fire and forget */ }
  }

  function buildLabelledNow(): string {
    const newPart = linesRef.current.length > 0
      ? linesRef.current.map(l => {
          const role = l.speaker !== null ? speakerMap[l.speaker] : undefined;
          const label = role === 'clinician' ? 'Clinician' : role === 'patient' ? 'Patient' : '';
          return label ? `${label}: ${l.text}` : l.text;
        }).join('\n')
      : fullTranscript;
    if (prevTranscriptRef.current && newPart) {
      return `${prevTranscriptRef.current}\n\n[Continued]\n\n${newPart}`;
    }
    return newPart || prevTranscriptRef.current;
  }

  async function handleGenerateNote() {
    const transcript = buildLabelledNow();
    if (!transcript.trim()) return;
    setGenerating(true);
    setGenerateError('');
    try {
      const sid = await ensureSession();
      if (!sid) throw new Error('Could not create session');
      const res = await apiFetch(`/sessions/${sid}/soap-note/generate`, {
        method: 'POST',
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setNoteContent(prev => prev.trim() ? `${prev}\n\n---\n\n${data.content}` : data.content);
      setTimeout(() => {
        if (noteRef.current) {
          noteRef.current.focus();
          noteRef.current.scrollTop = noteRef.current.scrollHeight;
        }
      }, 50);
    } catch {
      setGenerateError('Generation failed. You can still save manually.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!noteContent.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const sid = await ensureSession();
      if (!sid) throw new Error('Could not create session');
      await apiFetch(`/sessions/${sid}/soap-note`, {
        method: 'POST',
        body: JSON.stringify({ content: noteContent }),
      });
      await apiFetch(`/sessions/${sid}/complete`, { method: 'POST' });
      setSaved(true);
      onNoteComplete?.();
    } catch {
      setSaveError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  async function handleGenerateHandout() {
    const transcript = buildLabelledNow();
    if (!transcript.trim()) return;
    const sid = await ensureSession();
    if (!sid) return;
    setGeneratingHandout(true);
    setHandoutError('');
    try {
      const firstName = patientName.split(' ')[0];
      const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      const result = await generateHandout(sid, transcript, firstName, date);
      setHandoutSections(result.sections);
    } catch (err) {
      setHandoutError(err instanceof Error ? err.message : 'Handout generation failed');
    } finally {
      setGeneratingHandout(false);
    }
  }


  const isLocked = sessionStatus === 'completed';
  const canRevert = isLocked && completedAt !== null &&
    (Date.now() - new Date(completedAt).getTime()) < 48 * 60 * 60 * 1000;

  async function handleRevertToDraft() {
    if (!sessionIdRef.current) return;
    setReverting(true);
    setSaveError('');
    try {
      await revertSessionToDraft(sessionIdRef.current);
      setSessionStatus('recording');
      setCompletedAt(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to revert to draft');
    } finally {
      setReverting(false);
    }
  }

  const hasSpeakers = Object.keys(speakerMap).length >= 1;
  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <>
    <div className="max-w-4xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>

      {/* Header */}
      <div className="flex items-center justify-between py-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="p-1 -ml-1 text-gray-400 hover:text-secondary-700 transition shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-display font-bold text-secondary-700 truncate">{patientName}</h1>
            <p className="text-xs text-gray-500">{today}</p>
          </div>
        </div>
        {!saved && !isLocked && (
          <button
            onClick={handleSave}
            disabled={saving || !noteContent.trim()}
            className="flex items-center gap-2 bg-primary-400 hover:bg-primary-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition active:scale-[0.98] shrink-0"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save as Final'}
          </button>
        )}
        {isLocked && canRevert && (
          <button
            onClick={handleRevertToDraft}
            disabled={reverting}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition active:scale-[0.98] shrink-0"
          >
            {reverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeft className="w-4 h-4" />}
            {reverting ? 'Reverting…' : 'Revert to Draft'}
          </button>
        )}
        {isLocked && !canRevert && (
          <span className="text-xs text-slate-400 font-medium shrink-0">Note locked</span>
        )}
      </div>

      {saveError && <p className="text-xs text-red-500 mb-2 shrink-0">{saveError}</p>}

      {saved && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-2 shrink-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700"><Check className="w-4 h-4" /> Note saved.</span>
          <button onClick={onNoteComplete ?? onBack} className="ml-auto text-sm font-semibold text-gray-500 hover:text-secondary-700 transition">
            Done →
          </button>
        </div>
      )}

      {/* Note editor */}
      <div className={`flex flex-col min-h-0 pb-3 ${isLocked ? 'flex-1' : 'border-b border-gray-200'}`} style={isLocked ? { flex: 1 } : {}}>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 shrink-0">
          Progress Note
          {!sessionId && <span className="ml-2 text-gray-300 font-normal normal-case">Draft</span>}
        </label>
        <textarea
          ref={noteRef}
          value={noteContent}
          onChange={e => !isLocked && setNoteContent(e.target.value)}
          readOnly={isLocked}
          placeholder="Write your note here, or record below and generate…"
          className={`flex-1 w-full border rounded-xl p-4 text-sm text-secondary-700 leading-relaxed resize-none focus:outline-none ${isLocked ? 'border-gray-100 bg-gray-50 cursor-default' : 'border-gray-200 focus:ring-2 focus:ring-primary-300'}`}
          style={{ minHeight: 0 }}
        />
        {generating && (
          <div className="flex items-center gap-2 mt-1.5 text-xs text-primary-600 shrink-0">
            <div className="w-3.5 h-3.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
            Generating note from recording…
          </div>
        )}
        {generateError && <p className="text-xs text-red-500 mt-1 shrink-0">{generateError}</p>}
      </div>

      {/* Recording + transcript — draft only */}
      {!isLocked && <div className="flex flex-col flex-1 min-h-0 pt-3">

        {/* Controls */}
        <div className="flex items-center gap-2 mb-3 shrink-0">
          {!recordingDone ? (
            <>
              {!isRecording ? (
                <button onClick={handleStartRecording} className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition active:scale-95">
                  <Mic className="w-4 h-4" /> Record
                </button>
              ) : isPaused ? (
                <button onClick={resume} className="flex items-center gap-1.5 bg-primary-400 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition active:scale-95">
                  <Play className="w-4 h-4" /> Resume
                </button>
              ) : (
                <button onClick={handlePause} className="flex items-center gap-1.5 border-2 border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition active:scale-95">
                  <Pause className="w-4 h-4" /> Pause
                </button>
              )}
              {isRecording && (
                <button onClick={stop} className="flex items-center gap-1.5 border-2 border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition active:scale-95">
                  <Square className="w-3.5 h-3.5" /> Stop
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={handleGenerateNote}
                disabled={generating}
                className="flex items-center gap-1.5 bg-primary-400 hover:bg-primary-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition active:scale-95"
              >
                {generating ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Generating…' : 'Generate Note'}
              </button>
              <button
                onClick={handleGenerateHandout}
                disabled={generatingHandout}
                className="flex items-center gap-1.5 border-2 border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition active:scale-95"
              >
                {generatingHandout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Patient Handout
              </button>
              <button onClick={handleStartRecording} className="flex items-center gap-1.5 border-2 border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition active:scale-95">
                <Mic className="w-3.5 h-3.5" /> Record Again
              </button>
            </>
          )}

          <div className="flex items-center gap-1 text-sm font-mono text-secondary-700 ml-auto">
            {isRecording && !isPaused && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1" />}
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {formatTime(elapsedSecs)}
          </div>

          {hasSpeakers && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full bg-primary-400 inline-block" /> You
                <span className="w-2 h-2 rounded-full bg-secondary-500 inline-block ml-1" /> Patient
              </span>
              <button onClick={handleSwapSpeakers} className="flex items-center gap-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition">
                <ArrowRightLeft className="w-3.5 h-3.5" /> Swap
              </button>
            </div>
          )}
        </div>

        {isRecording && !isPaused && (
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2 shrink-0">
            <div className="h-full bg-primary-400 rounded-full transition-all duration-75" style={{ width: `${Math.max(2, audioLevel * 100)}%` }} />
          </div>
        )}
        {isPaused && <p className="text-xs text-amber-500 font-medium mb-2 shrink-0">Paused</p>}

        {/* Transcript */}
        <div className="flex-1 min-h-0 bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-y-auto">
          {lines.length === 0 && !interimText ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm text-center">
              {prevTranscript ? (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Previous recording</p>
                  <pre className="text-xs text-gray-400 whitespace-pre-wrap text-left w-full leading-relaxed">{prevTranscript}</pre>
                  <p className="text-xs text-gray-300 mt-3 italic">Record to add a new session — transcripts will be combined on generate</p>
                </>
              ) : (
                <>
                  <Mic className="w-8 h-8 mb-2 opacity-30" />
                  {isRecording ? 'Listening…' : 'Press Record — transcript appears here in real time'}
                </>
              )}
            </div>
          ) : (
            <div className="text-sm leading-relaxed space-y-2">
              {prevTranscript && lines.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Previous recording</p>
                  <pre className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed mb-2">{prevTranscript}</pre>
                  <div className="border-t border-gray-200 pt-2 mb-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">New recording</p>
                  </div>
                </div>
              )}
              {lines.map((line, i) => {
                const role = line.speaker !== null ? speakerMap[line.speaker] : undefined;
                const isClinician = role === 'clinician';
                const label = getRoleLabel(line.speaker, speakerMap);
                return (
                  <p key={i}>
                    {label && (
                      <span className={`font-semibold ${isClinician ? 'text-primary-600' : 'text-secondary-500'}`}>
                        {label}:{' '}
                      </span>
                    )}
                    <span className="text-secondary-700">{line.text}</span>
                  </p>
                );
              })}
              {interimText && (
                <p className="text-gray-400 italic">
                  {interimSpeaker !== null && getRoleLabel(interimSpeaker, speakerMap) && (
                    <span className="font-semibold">{getRoleLabel(interimSpeaker, speakerMap)}: </span>
                  )}
                  {interimText}
                </p>
              )}
              {isRecording && !isPaused && !interimText && (
                <span className="inline-block w-2 h-4 bg-primary-400 animate-pulse ml-1" />
              )}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </div>}

      {handoutError && <p className="text-xs text-red-500 mt-1 shrink-0">{handoutError}</p>}
    </div>

    {handoutSections && (
      <HandoutPreview
        sections={handoutSections}
        patientFirstName={patientName.split(' ')[0]}
        assessmentDate={today}
        onClose={() => setHandoutSections(null)}
        onRegenerate={handleGenerateHandout}
      />
    )}
    </>
  );
}
