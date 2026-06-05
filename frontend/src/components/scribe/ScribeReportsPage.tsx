import { useState, useEffect } from 'react';
import { FileText, Users, TrendingUp, Stethoscope, Loader2, Search, ChevronRight, Upload, FileUp, X } from 'lucide-react';
import { apiFetch, generateReport, generateHandout, generateReassessment, extractDocumentText, downloadReportDocx } from '../../utils/scribe-api';
import type { HandoutSections, HandoutGrounding, ReassessmentData } from '../../types';
import HandoutPreview from './HandoutPreview';
import ReassessmentPreview from './ReassessmentPreview';
import GPReassessmentPreview from './GPReassessmentPreview';

type TemplateType = 'cdmp' | 'handout' | 'reassessment' | 'gp-reassessment';

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
  {
    type: 'reassessment',
    title: 'Reassessment Summary',
    description: "Before/after comparison of a patient's latest results vs an earlier baseline session",
    requiresNote: false,
  },
  {
    type: 'gp-reassessment',
    title: 'GP Reassessment Report',
    description: 'Clinician-to-GP progress letter comparing baseline vs latest results',
    requiresNote: false,
  },
];

// Resolve a session's source text: live transcript first, then the saved SOAP
// note (transcripts are purged 48h after recording). `source` reflects which was
// used. Returns text '' if neither is available.
async function resolveSessionSource(sessionId: number): Promise<{ text: string; source: 'transcript' | 'note' }> {
  const transcriptRes = await apiFetch(`/sessions/${sessionId}/transcript`);
  if (transcriptRes.ok) return { text: (await transcriptRes.json()).content || '', source: 'transcript' };
  if (transcriptRes.status === 410 || transcriptRes.status === 404) {
    const noteRes = await apiFetch(`/sessions/${sessionId}/soap-note`);
    if (noteRes.ok) return { text: (await noteRes.json()).content || '', source: 'note' };
    return { text: '', source: 'note' };
  }
  throw new Error('Could not load this session — please try again.');
}

export default function ScribeReportsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [selectedBaseline, setSelectedBaseline] = useState<SessionItem | null>(null);
  const [previousReport, setPreviousReport] = useState('');   // extra baseline context (pasted/uploaded)
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [activeHandout, setActiveHandout] = useState<{ sections: HandoutSections; session: SessionItem; source: 'transcript' | 'note'; grounding?: HandoutGrounding } | null>(null);
  const [activeReassessment, setActiveReassessment] = useState<{ data: ReassessmentData; session: SessionItem; baseline: SessionItem | null } | null>(null);
  const [activeGPReassessment, setActiveGPReassessment] = useState<{ data: ReassessmentData; session: SessionItem; baseline: SessionItem | null } | null>(null);

  // Reassessment variants need a baseline session selected before generating.
  const isReassessment = selectedTemplate === 'reassessment' || selectedTemplate === 'gp-reassessment';

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

  // Baseline candidates for a reassessment: the same patient's OTHER completed
  // sessions that have a saved note (the transcript is long purged), on or before
  // the selected session's date. Prefer patientId; fall back to name.
  const baselineCandidates = selectedSession
    ? sessions.filter(s =>
        s.id !== selectedSession.id &&
        s.hasNote &&
        (selectedSession.patientId != null
          ? s.patientId === selectedSession.patientId
          : s.patientName === selectedSession.patientName) &&
        new Date(s.sessionDate).getTime() <= new Date(selectedSession.sessionDate).getTime()
      )
    : [];

  async function handleGenerate() {
    if (!selectedTemplate || !selectedSession) return;
    setGenerating(true);
    setGenError('');
    try {
      if (selectedTemplate === 'cdmp') {
        const sessionDate = new Date(selectedSession.sessionDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        const result = await generateReport(selectedSession.id, 'cdmp', selectedSession.patientName, sessionDate);
        await downloadReportDocx(selectedSession.id, {
          patientName:         selectedSession.patientName,
          sessionDate,
          executiveSummary:    result.sections.executiveSummary    || '',
          objectiveAssessment: result.sections.objectiveAssessment || '',
          goals:               result.sections.goals               || '',
          recommendations:     result.sections.managementPlan      || '',
        });
      } else if (selectedTemplate === 'reassessment' || selectedTemplate === 'gp-reassessment') {
        if (!selectedBaseline && !previousReport.trim()) {
          throw new Error('Select a baseline session, or upload/paste a previous report to compare against.');
        }
        // Resolve the current session's source; the backend resolves the baseline
        // (its transcript is long purged) from the saved note + any uploaded report.
        const { text: sourceText } = await resolveSessionSource(selectedSession.id);
        const audience = selectedTemplate === 'gp-reassessment' ? 'gp' : 'patient';
        const result = await generateReassessment(
          selectedSession.id, selectedBaseline ? selectedBaseline.id : null, sourceText, audience, previousReport.trim(),
        );
        if (selectedTemplate === 'gp-reassessment') {
          setActiveGPReassessment({ data: result, session: selectedSession, baseline: selectedBaseline });
        } else {
          setActiveReassessment({ data: result, session: selectedSession, baseline: selectedBaseline });
        }
      } else {
        // Prefer the live transcript; fall back to the saved SOAP note if the
        // transcript has expired (deleted 48h after recording) or is missing.
        const { text: sourceText, source: usedSource } = await resolveSessionSource(selectedSession.id);
        if (!sourceText) {
          throw new Error('No transcript or saved note for this session. The transcript is deleted 48 hours after recording — generate the handout within 48 hours, or save a SOAP note first.');
        }

        const firstName = selectedSession.patientName.split(' ')[0];
        const assessmentDate = new Date(selectedSession.sessionDate).toLocaleDateString('en-AU', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });

        const result = await generateHandout(selectedSession.id, sourceText, firstName, assessmentDate);
        setActiveHandout({ sections: result.sections, session: selectedSession, source: usedSource, grounding: result.grounding });
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

  async function handleUploadReport(file: File) {
    setUploading(true);
    setGenError('');
    try {
      const text = await extractDocumentText(file);
      setPreviousReport(prev => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
      setUploadName(file.name);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Could not read the document');
    } finally {
      setUploading(false);
    }
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
                onClick={() => { setSelectedTemplate(t.type); setSelectedSession(null); setSelectedBaseline(null); setPreviousReport(''); setUploadName(''); setGenError(''); }}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition ${
                  selectedTemplate === t.type
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${selectedTemplate === t.type ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                  {t.type === 'cdmp' ? <FileText className="w-5 h-5" /> : t.type === 'reassessment' ? <TrendingUp className="w-5 h-5" /> : t.type === 'gp-reassessment' ? <Stethoscope className="w-5 h-5" /> : <Users className="w-5 h-5" />}
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
                      onClick={() => { setSelectedSession(s); setSelectedBaseline(null); setGenError(''); }}
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

        {/* Step 3: Baseline session (reassessment variants only) */}
        {isReassessment && selectedSession && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">3. Baseline to compare against <span className="normal-case font-normal text-gray-300">(pick a session, and/or add a previous report below)</span></p>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {baselineCandidates.length === 0 ? (
                <div className="py-8 px-4 text-center text-sm text-gray-400">
                  No earlier session with a saved note for {selectedSession.patientName.split(' ')[0]}. Either save a SOAP note on an earlier session, or upload/paste the previous report below to use as the baseline.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                  {baselineCandidates.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedBaseline(s); setGenError(''); }}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition ${
                        selectedBaseline?.id === s.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${selectedBaseline?.id === s.id ? 'text-primary-700' : 'text-secondary-700'}`}>
                          {s.patientName}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(s.sessionDate)}</p>
                      </div>
                      {selectedBaseline?.id === s.id && (
                        <ChevronRight className="w-4 h-4 text-primary-400 shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Previous report (optional) — extra baseline context, or a stand-in baseline */}
        {isReassessment && selectedSession && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Previous report <span className="normal-case font-normal text-gray-300">(optional — adds baseline context, or use instead of a session)</span>
            </p>
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition cursor-pointer">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload PDF / Word
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadReport(f); e.target.value = ''; }}
                  />
                </label>
                {uploadName && (
                  <span className="flex items-center gap-1 text-xs text-primary-600">
                    <FileUp className="w-3.5 h-3.5" /> {uploadName}
                  </span>
                )}
                {previousReport.trim() && (
                  <button onClick={() => { setPreviousReport(''); setUploadName(''); }} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
              </div>
              <textarea
                value={previousReport}
                onChange={e => setPreviousReport(e.target.value)}
                rows={previousReport ? 6 : 2}
                placeholder="…or paste the previous report text here. It's used as extra baseline context (PDF/Word is extracted to text — nothing is stored)."
                className="w-full border border-gray-200 rounded-lg p-2.5 text-xs text-secondary-700 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
          </div>
        )}

        {/* Generate */}
        {selectedTemplate && selectedSession && (
          <div className="flex flex-col gap-3">
            {genError && <p className="text-sm text-red-500">{genError}</p>}
            <button
              onClick={handleGenerate}
              disabled={generating || (isReassessment && !selectedBaseline && !previousReport.trim())}
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

      {activeHandout && (
        <HandoutPreview
          sections={activeHandout.sections}
          patientFirstName={activeHandout.session.patientName.split(' ')[0]}
          assessmentDate={new Date(activeHandout.session.sessionDate).toLocaleDateString('en-AU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          })}
          sessionId={activeHandout.session.id}
          source={activeHandout.source}
          grounding={activeHandout.grounding}
          onClose={() => setActiveHandout(null)}
          onRegenerate={handleGenerate}
        />
      )}

      {activeReassessment && (
        <ReassessmentPreview
          data={activeReassessment.data}
          patientFirstName={activeReassessment.session.patientName.split(' ')[0]}
          baselineDate={activeReassessment.baseline
            ? new Date(activeReassessment.baseline.sessionDate).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'previous report'}
          latestDate={new Date(activeReassessment.session.sessionDate).toLocaleDateString('en-AU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          })}
          sessionId={activeReassessment.session.id}
          grounding={activeReassessment.data.grounding}
          onClose={() => setActiveReassessment(null)}
          onRegenerate={handleGenerate}
        />
      )}

      {activeGPReassessment && (
        <GPReassessmentPreview
          data={activeGPReassessment.data}
          patientName={activeGPReassessment.session.patientName}
          baselineDate={activeGPReassessment.baseline
            ? new Date(activeGPReassessment.baseline.sessionDate).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'previous report'}
          latestDate={new Date(activeGPReassessment.session.sessionDate).toLocaleDateString('en-AU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          })}
          sessionId={activeGPReassessment.session.id}
          grounding={activeGPReassessment.data.grounding}
          onClose={() => setActiveGPReassessment(null)}
          onRegenerate={handleGenerate}
        />
      )}
    </>
  );
}
