import { useState, useEffect } from 'react';
import { FileText, Users, Loader2, Search, ChevronRight } from 'lucide-react';
import { apiFetch, generateReport, generateHandout } from '../../utils/scribe-api';
import type { ReportSections, HandoutSections } from '../../types';
import ReportPreview from './ReportPreview';
import HandoutPreview from './HandoutPreview';

type TemplateType = 'cdmp' | 'handout';

interface SessionItem {
  id: number;
  patientName: string;
  patientId?: number;
  sessionDate: string;
  startedAt: string;
  status: string;
  hasNote: boolean;
}

const TEMPLATES: {
  type: TemplateType;
  title: string;
  description: string;
  requiresNote: boolean;
}[] = [
  {
    type: 'cdmp',
    title: 'CDMP GP Report',
    description: 'Formal report to referring GP under a Chronic Disease Management Plan',
    requiresNote: true,
  },
  {
    type: 'handout',
    title: 'Patient Handout',
    description: 'Plain-language assessment summary to hand to the patient',
    requiresNote: false,
  },
];

export default function ScribeReportsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [activeReport, setActiveReport] = useState<{ sections: ReportSections; session: SessionItem } | null>(null);
  const [activeHandout, setActiveHandout] = useState<{ sections: HandoutSections; session: SessionItem } | null>(null);

  useEffect(() => { loadSessions(); }, []);

  async function loadSessions() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch('/sessions/history?limit=100&offset=0');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions.filter((s: SessionItem) => s.status === 'completed'));
      } else {
        setLoadError('Failed to load sessions');
      }
    } catch {
      setLoadError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }

  const template = TEMPLATES.find(t => t.type === selectedTemplate);

  const filteredSessions = sessions
    .filter(s => !template?.requiresNote || s.hasNote)
    .filter(s => !search || s.patientName.toLowerCase().includes(search.toLowerCase()));

  async function handleGenerate() {
    if (!selectedTemplate || !selectedSession) return;
    setGenerating(true);
    setGenError('');
    try {
      if (selectedTemplate === 'cdmp') {
        const result = await generateReport(selectedSession.id, 'cdmp');
        setActiveReport({ sections: result.sections, session: selectedSession });
      } else {
        const transcriptRes = await apiFetch(`/sessions/${selectedSession.id}/transcript`);
        if (!transcriptRes.ok) throw new Error('Could not load transcript for this session');
        const transcriptData = await transcriptRes.json();
        const transcript = transcriptData.content;
        if (!transcript) throw new Error('No transcript found for this session');

        const firstName = selectedSession.patientName.split(' ')[0];
        const assessmentDate = new Date(selectedSession.sessionDate).toLocaleDateString('en-AU', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });

        const result = await generateHandout(selectedSession.id, transcript, firstName, assessmentDate);
        setActiveHandout({ sections: result.sections, session: selectedSession });
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-display font-bold text-secondary-700">Generate a Report</h1>
          <p className="text-sm text-gray-500 mt-1">Select a template, then choose the session to base it on.</p>
        </div>

        {/* Step 1: Template */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">1. Report type</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEMPLATES.map(t => (
              <button
                key={t.type}
                onClick={() => { setSelectedTemplate(t.type); setSelectedSession(null); setGenError(''); }}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition ${
                  selectedTemplate === t.type
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${selectedTemplate === t.type ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                  {t.type === 'cdmp' ? <FileText className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${selectedTemplate === t.type ? 'text-primary-700' : 'text-secondary-700'}`}>{t.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Session */}
        {selectedTemplate && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">2. Session</p>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by patient name…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                </div>
              ) : loadError ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-red-500 mb-3">{loadError}</p>
                  <button onClick={loadSessions} className="text-sm text-primary-600 hover:underline">Retry</button>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  {search ? 'No sessions match your search.' : template?.requiresNote ? 'No completed sessions with a saved SOAP note.' : 'No completed sessions found.'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                  {filteredSessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedSession(s); setGenError(''); }}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition ${
                        selectedSession?.id === s.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${selectedSession?.id === s.id ? 'text-primary-700' : 'text-secondary-700'}`}>
                          {s.patientName}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(s.sessionDate)}</p>
                      </div>
                      {selectedSession?.id === s.id && (
                        <ChevronRight className="w-4 h-4 text-primary-400 shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generate */}
        {selectedTemplate && selectedSession && (
          <div className="flex flex-col gap-3">
            {genError && <p className="text-sm text-red-500">{genError}</p>}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center justify-center gap-2 bg-primary-400 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl text-sm font-semibold transition active:scale-[0.98]"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              ) : (
                <><FileText className="w-4 h-4" /> Generate {template?.title}</>
              )}
            </button>
          </div>
        )}
      </div>

      {activeReport && (
        <ReportPreview
          type="cdmp"
          sections={activeReport.sections}
          patientName={activeReport.session.patientName}
          sessionDate={activeReport.session.sessionDate}
          onClose={() => setActiveReport(null)}
          onRegenerate={handleGenerate}
        />
      )}

      {activeHandout && (
        <HandoutPreview
          sections={activeHandout.sections}
          patientFirstName={activeHandout.session.patientName.split(' ')[0]}
          assessmentDate={new Date(activeHandout.session.sessionDate).toLocaleDateString('en-AU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          })}
          onClose={() => setActiveHandout(null)}
          onRegenerate={handleGenerate}
        />
      )}
    </>
  );
}
