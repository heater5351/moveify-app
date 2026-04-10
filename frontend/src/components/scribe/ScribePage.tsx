import { useState } from 'react';
import { FileText, Clock, Settings } from 'lucide-react';
import ProgressNotePage from './ProgressNotePage';
import ScribeHistoryPage from './ScribeHistoryPage';
import ScribeSettingsPage from './ScribeSettingsPage';

type ScribeView = 'history' | 'new-note' | 'settings';

interface NoteContext {
  patientId: number;
  patientName: string;
  sessionId?: number;
  initialNote?: string;
}

export default function ScribePage() {
  const [view, setView] = useState<ScribeView>('history');
  const [noteCtx, setNoteCtx] = useState<NoteContext | null>(null);

  function openNewNote(patientId: number, patientName: string, sessionId?: number, initialNote?: string) {
    setNoteCtx({ patientId, patientName, sessionId, initialNote });
    setView('new-note');
  }

  function handleViewSession(sessionId: number, patientName: string, patientId: number, _startedAt: string, status: string, hasNote: boolean) {
    if (status === 'recording' && hasNote) {
      openNewNote(patientId, patientName, sessionId);
    } else if (status === 'completed' && hasNote) {
      openNewNote(patientId, patientName, sessionId);
    }
  }

  if (view === 'new-note' && noteCtx) {
    return (
      <ProgressNotePage
        patientId={noteCtx.patientId}
        patientName={noteCtx.patientName}
        existingSessionId={noteCtx.sessionId}
        initialNote={noteCtx.initialNote}
        onBack={() => { setView('history'); setNoteCtx(null); }}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
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
          onClick={() => setView('settings')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
            view === 'settings' ? 'border-primary-400 text-primary-600' : 'border-transparent text-gray-500 hover:text-secondary-700'
          }`}
        >
          <Settings className="w-4 h-4" /> Settings
        </button>

        {/* New Note — floated right */}
        <div className="ml-auto pb-2">
          <button
            onClick={() => {
              // Open with a placeholder patient — user selects from history or PatientProfile
              // For top-level new note, we'd need a patient picker. For now direct them to use patient profile.
              alert('To start a new note, open the patient\'s profile and tap "New Progress Note".');
            }}
            className="flex items-center gap-1.5 bg-primary-400 hover:bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition active:scale-[0.98]"
          >
            <FileText className="w-4 h-4" /> New Note
          </button>
        </div>
      </div>

      {view === 'history' && <ScribeHistoryPage onViewSession={handleViewSession} />}
      {view === 'settings' && <ScribeSettingsPage />}
    </div>
  );
}
