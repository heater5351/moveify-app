import { useState, useCallback } from 'react';
import { FileText, Clock, Settings, Mic, ClipboardList } from 'lucide-react';
import ProgressNotePage from './ProgressNotePage';
import ScribeHistoryPage from './ScribeHistoryPage';
import ScribeSettingsPage from './ScribeSettingsPage';
import ScribeReportsPage from './ScribeReportsPage';

type ScribeView = 'history' | 'new-note' | 'settings' | 'reports';

interface NoteContext {
  patientId: number;
  patientName: string;
  sessionId?: number;
  initialNote?: string;
}

interface ScribePageProps {
  onRecordingActiveChange?: (active: boolean) => void;
  /** When provided, note opening is delegated to App.tsx (persistent across tabs). */
  onOpenNote?: (patientId: number, patientName: string, sessionId?: number) => void;
  /** Highlight the currently-recording session in the history list. */
  activeNoteSessionId?: number | null;
}

export default function ScribePage({ onRecordingActiveChange, onOpenNote, activeNoteSessionId }: ScribePageProps) {
  const [view, setView] = useState<ScribeView>('history');
  const [noteCtx, setNoteCtx] = useState<NoteContext | null>(null);
  const [isRecordingActive, setIsRecordingActive] = useState(false);

  const handleRecordingActiveChange = useCallback((active: boolean) => {
    setIsRecordingActive(active);
    onRecordingActiveChange?.(active);
  }, [onRecordingActiveChange]);

  function openNewNote(patientId: number, patientName: string, sessionId?: number, initialNote?: string) {
    if (onOpenNote) {
      // Delegate to App.tsx so note persists across tab navigation
      onOpenNote(patientId, patientName, sessionId);
    } else {
      // Fallback: internal note (no cross-tab persistence)
      setNoteCtx({ patientId, patientName, sessionId, initialNote });
      setView('new-note');
    }
  }

  function handleViewSession(sessionId: number, patientName: string, patientId: number, _startedAt: string, status: string, _hasNote: boolean) {
    if (status === 'recording' || status === 'completed') {
      openNewNote(patientId, patientName, sessionId);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">

      {/* ProgressNotePage — only used in fallback (no onOpenNote) mode */}
      {!onOpenNote && noteCtx && (
        <div style={{ display: view === 'new-note' ? 'block' : 'none' }}>
          <ProgressNotePage
            patientId={noteCtx.patientId}
            patientName={noteCtx.patientName}
            existingSessionId={noteCtx.sessionId}
            initialNote={noteCtx.initialNote}
            onRecordingActiveChange={handleRecordingActiveChange}
            onBack={() => setView('history')}
          />
        </div>
      )}

      {/* History / Settings tabs */}
      <div style={{ display: view !== 'new-note' ? 'block' : 'none' }}>
        {/* Tab navigation */}
        <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
          <button
            onClick={() => setView('history')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              view === 'history' ? 'border-primary-400 text-primary-600' : 'border-transparent text-gray-500 hover:text-secondary-700'
            }`}
          >
            <Clock className="w-4 h-4" /> History
          </button>
          <button
            onClick={() => setView('reports')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              view === 'reports' ? 'border-primary-400 text-primary-600' : 'border-transparent text-gray-500 hover:text-secondary-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Reports
          </button>
          <button
            onClick={() => setView('settings')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              view === 'settings' ? 'border-primary-400 text-primary-600' : 'border-transparent text-gray-500 hover:text-secondary-700'
            }`}
          >
            <Settings className="w-4 h-4" /> Settings
          </button>

          {/* Recording in progress (fallback mode only) — return to note */}
          {!onOpenNote && isRecordingActive && noteCtx && (
            <button
              onClick={() => setView('new-note')}
              className="flex items-center gap-1.5 ml-4 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600 animate-pulse"
            >
              <Mic className="w-3.5 h-3.5" />
              Recording — tap to return
            </button>
          )}

          {/* New Note — floated right */}
          <div className="ml-auto pb-2">
            <button
              onClick={() => {
                alert('To start a new note, open the patient\'s profile and tap "New Progress Note".');
              }}
              className="flex items-center gap-1.5 bg-primary-400 hover:bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition active:scale-[0.98]"
            >
              <FileText className="w-4 h-4" /> New Note
            </button>
          </div>
        </div>

        {view === 'history' && (
          <ScribeHistoryPage
            onViewSession={handleViewSession}
            activeNoteSessionId={activeNoteSessionId}
          />
        )}
        {view === 'reports' && <ScribeReportsPage />}
        {view === 'settings' && <ScribeSettingsPage />}
      </div>
    </div>
  );
}
