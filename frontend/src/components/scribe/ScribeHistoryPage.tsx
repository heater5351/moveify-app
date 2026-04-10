import { useState, useEffect } from 'react';
import { Clock, FileText, CheckCircle, XCircle, Loader2, Copy, Check, ChevronDown, ChevronUp, Brain, Mic, Trash2 } from 'lucide-react';
import { apiFetch, deleteSession } from '../../utils/scribe-api';

interface HistorySession {
  id: number;
  patientName: string;
  patientId?: number;
  sessionDate: string;
  startedAt: string;
  status: string;
  hasNote: boolean;
}

interface ScribeHistoryPageProps {
  onViewSession: (sessionId: number, patientName: string, patientId: number, startedAt: string, status: string, hasNote: boolean) => void;
  patientId?: number;
}

export default function ScribeHistoryPage({ onViewSession, patientId }: ScribeHistoryPageProps) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState<Record<number, string>>({});
  const [noteLoading, setNoteLoading] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState<number | null>(null);
  const [summaryContent, setSummaryContent] = useState<Record<number, string>>({});
  const [summaryLoading, setSummaryLoading] = useState<number | null>(null);
  const [expandedTranscript, setExpandedTranscript] = useState<number | null>(null);
  const [transcriptContent, setTranscriptContent] = useState<Record<number, string>>({});
  const [transcriptLoading, setTranscriptLoading] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => { loadSessions(); }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSessions() {
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const pid = patientId ? `&patientId=${patientId}` : '';
      const res = await apiFetch(`/sessions/history?limit=${limit}&offset=${offset}${pid}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
        setTotal(data.total);
      } else {
        const err = await res.json().catch(() => ({}));
        setLoadError((err as { error?: string }).error || `Error ${res.status}`);
      }
    } catch (err) {
      setLoadError((err as Error).name === 'AbortError' ? 'Request timed out — please try again.' : 'Failed to load sessions.');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  async function toggleNote(sessionId: number) {
    if (expandedNote === sessionId) { setExpandedNote(null); return; }
    setExpandedNote(sessionId);
    if (noteContent[sessionId]) return;
    setNoteLoading(sessionId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await apiFetch(`/sessions/${sessionId}/soap-note`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setNoteContent(prev => ({ ...prev, [sessionId]: data.content }));
      } else {
        setNoteContent(prev => ({ ...prev, [sessionId]: '' }));
      }
    } catch (err) {
      setNoteContent(prev => ({ ...prev, [sessionId]: (err as Error).name === 'AbortError' ? 'Timed out.' : 'Failed to load.' }));
    } finally {
      clearTimeout(timer);
      setNoteLoading(null);
    }
  }

  async function toggleTranscript(sessionId: number) {
    if (expandedTranscript === sessionId) { setExpandedTranscript(null); return; }
    setExpandedTranscript(sessionId);
    if (transcriptContent[sessionId]) return;
    setTranscriptLoading(sessionId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await apiFetch(`/sessions/${sessionId}/transcript`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setTranscriptContent(prev => ({ ...prev, [sessionId]: data.content }));
      } else {
        setTranscriptContent(prev => ({ ...prev, [sessionId]: '' }));
      }
    } catch (err) {
      setTranscriptContent(prev => ({ ...prev, [sessionId]: (err as Error).name === 'AbortError' ? 'Timed out.' : 'Failed to load.' }));
    } finally {
      clearTimeout(timer);
      setTranscriptLoading(null);
    }
  }

  async function handleCopy(sessionId: number, content: string) {
    await navigator.clipboard.writeText(content);
    setCopied(sessionId);
    setTimeout(() => setCopied(null), 2000);
    apiFetch(`/sessions/${sessionId}/soap-note/copy`, { method: 'POST' }).catch(() => {});
  }

  async function handleDeleteSession(sessionId: number) {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    setDeleting(sessionId);
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setTotal(prev => prev - 1);
    } catch (err) {
      console.error('Delete session error:', err);
    } finally {
      setDeleting(null);
    }
  }

  async function toggleSummary(patientId: number) {
    if (summaryOpen === patientId) { setSummaryOpen(null); return; }
    setSummaryOpen(patientId);
    if (summaryContent[patientId]) return;
    setSummaryLoading(patientId);
    try {
      const res = await apiFetch(`/sessions/patient/${patientId}/summary`);
      if (res.ok) {
        const data = await res.json();
        setSummaryContent(prev => ({ ...prev, [patientId]: data.summary }));
      } else {
        setSummaryContent(prev => ({ ...prev, [patientId]: 'No summary yet — complete a session to generate one.' }));
      }
    } catch {
      setSummaryContent(prev => ({ ...prev, [patientId]: 'Failed to load summary.' }));
    } finally {
      setSummaryLoading(null);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  }

  function statusBadge(status: string) {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Completed</span>;
      case 'recording':
        return <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><FileText className="w-3 h-3" />Draft</span>;
      case 'discarded':
        return <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Discarded</span>;
      default:
        return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{status}</span>;
    }
  }

  if (loading && sessions.length === 0) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>;
  }

  if (loadError && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-red-600">{loadError}</p>
        <button onClick={loadSessions} className="px-4 py-2 text-sm font-medium text-white bg-primary-400 hover:bg-primary-500 rounded-lg transition">Retry</button>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-secondary-700">Session History</h1>
          <p className="text-sm text-gray-500">{total} session{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No sessions yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <div key={session.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-4">
                <div className="flex items-start sm:items-center justify-between gap-2 mb-2 sm:mb-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-secondary-700 truncate">{session.patientName}</h3>
                    <p className="text-xs text-gray-500">{formatDate(session.sessionDate)} at {formatTime(session.startedAt)}</p>
                  </div>
                  <div className="shrink-0">{statusBadge(session.status)}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {session.patientId && session.status === 'completed' && (
                    <button onClick={() => toggleSummary(session.patientId!)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition active:scale-[0.98]">
                      <Brain className="w-3.5 h-3.5" /> Summary
                    </button>
                  )}
                  {session.hasNote && (
                    <button onClick={() => toggleNote(session.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition active:scale-[0.98]">
                      <FileText className="w-3.5 h-3.5" />
                      {expandedNote === session.id ? 'Hide' : 'View'} Note
                      {expandedNote === session.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                  <button onClick={() => toggleTranscript(session.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition active:scale-[0.98]">
                    <Mic className="w-3.5 h-3.5" />
                    {expandedTranscript === session.id ? 'Hide' : 'View'} Transcript
                    {expandedTranscript === session.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {session.status === 'recording' && (
                    <>
                      {session.hasNote && (
                        <button onClick={() => onViewSession(session.id, session.patientName, session.patientId ?? 0, session.startedAt, session.status, session.hasNote)} className="px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition active:scale-[0.98]">
                          Continue
                        </button>
                      )}
                      <button onClick={() => handleDeleteSession(session.id)} disabled={deleting === session.id} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50 active:scale-[0.98]">
                        {deleting === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Delete Draft
                      </button>
                    </>
                  )}
                  {session.status === 'completed' && session.hasNote && (
                    <button onClick={() => onViewSession(session.id, session.patientName, session.patientId ?? 0, session.startedAt, session.status, session.hasNote)} className="px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition active:scale-[0.98]">
                      Open
                    </button>
                  )}
                </div>
              </div>

              {expandedNote === session.id && (
                <div className="border-t border-gray-100 px-4 sm:px-5 py-3 sm:py-4 bg-gray-50">
                  {noteLoading === session.id ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
                  ) : noteContent[session.id] ? (
                    <>
                      <pre className="text-sm text-secondary-700 whitespace-pre-wrap leading-relaxed mb-3">{noteContent[session.id]}</pre>
                      <button onClick={() => handleCopy(session.id, noteContent[session.id] || '')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition active:scale-[0.98]">
                        {copied === session.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied === session.id ? 'Copied' : 'Copy to clipboard'}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No note content available.</p>
                  )}
                </div>
              )}

              {expandedTranscript === session.id && (
                <div className="border-t border-gray-100 px-4 sm:px-5 py-3 sm:py-4 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-600">Raw Transcript</span>
                  </div>
                  {transcriptLoading === session.id ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
                  ) : transcriptContent[session.id] ? (
                    <>
                      <pre className="text-sm text-secondary-700 whitespace-pre-wrap leading-relaxed mb-3">{transcriptContent[session.id]}</pre>
                      <button onClick={() => handleCopy(session.id, transcriptContent[session.id] || '')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition active:scale-[0.98]">
                        {copied === session.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied === session.id ? 'Copied' : 'Copy to clipboard'}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No transcript available.</p>
                  )}
                </div>
              )}

              {session.patientId && summaryOpen === session.patientId && (
                <div className="border-t border-purple-100 px-4 sm:px-5 py-3 sm:py-4 bg-purple-50/50">
                  {summaryLoading === session.patientId ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /></div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-purple-500" />
                        <span className="text-xs font-semibold text-purple-700">Rolling Patient Summary</span>
                      </div>
                      <pre className="text-sm text-secondary-700 whitespace-pre-wrap leading-relaxed">{summaryContent[session.patientId]}</pre>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98]">Previous</button>
          <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98]">Next</button>
        </div>
      )}
    </div>
  );
}
