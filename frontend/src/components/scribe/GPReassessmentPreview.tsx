import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Download, RefreshCw, PenLine, Calculator, Loader2 } from 'lucide-react';
import type { ReassessmentData, HandoutGrounding } from '../../types';
import { fetchReassessmentDocx, regenerateReassessmentNarrative, regradeReassessment, saveBlob } from '../../utils/scribe-api';

interface GPReassessmentPreviewProps {
  data: ReassessmentData;
  patientName: string;
  dob?: string;
  baselineDate: string;
  latestDate: string;
  sessionId: number;
  grounding?: HandoutGrounding;
  onClose: () => void;
  onRegenerate: () => void;
}

function cleanText(text: string): string {
  return (text || '')
    .replace(/\*+/g, '')
    .replace(/\[|\]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

// Merge "new this visit" findings into the comparison block as extra rows so a
// test only done at reassessment still appears (Baseline "—", Change "New").
function mergeComparison(comparison: string, newFindings: string): string {
  const extras = (newFindings || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.includes('|'))
    .map(l => {
      const p = l.split('|').map(s => s.trim());
      return `${p[0]} | — | ${p[1] || ''} | New | ${p[2] || ''}`;
    });
  return [comparison, ...extras].filter(Boolean).join('\n');
}

// Default transmittal cover-letter body (editable). Mirrors the server fallback.
function defaultCover(patient: string, baselineDate: string, latestDate: string): string {
  const p = patient || 'the patient';
  return (
    `Thank you for your ongoing care of ${p}. Please find enclosed an Exercise Physiology reassessment report following their review${latestDate ? ` on ${latestDate}` : ''}.\n\n` +
    `This report compares ${p}'s current objective measures against their baseline assessment${baselineDate ? ` of ${baselineDate}` : ''}, and summarises their progress, the clinical interpretation of those changes, and recommendations for the next phase of care.\n\n` +
    `I would be glad to discuss any aspect of this report. Thank you for the opportunity to be involved in ${p}'s care.`
  );
}

const TEAL = '#46c1c0';

export default function GPReassessmentPreview({
  data, patientName, dob, baselineDate, latestDate, sessionId, grounding, onClose, onRegenerate,
}: GPReassessmentPreviewProps) {
  const normsSkipped = !!grounding && grounding.hasFindings && (grounding.missingSex || grounding.missingAge);
  const missingFields = grounding
    ? [grounding.missingSex && 'sex', grounding.missingAge && 'date of birth'].filter(Boolean).join(' and ')
    : '';

  const [execSummary, setExecSummary] = useState(() => cleanText(data.executiveSummary || ''));
  const [interpretation, setInterpretation] = useState(() => cleanText(data.clinicalInterpretation || ''));
  const [recommendations, setRecommendations] = useState(() => cleanText(data.recommendations || ''));
  const [comparison, setComparison] = useState(() => mergeComparison(data.comparison, data.newFindings));

  // GP / referral details (editable; filled into the letter)
  const [gpName, setGpName] = useState('');
  const [practiceName, setPracticeName] = useState('');
  const [practiceAddress, setPracticeAddress] = useState('');
  const [patientNameField, setPatientNameField] = useState(patientName || '');
  const [dobField, setDobField] = useState(dob || '');
  const [coverLetter, setCoverLetter] = useState(() => defaultCover(patientName, baselineDate, latestDate));

  const [blob, setBlob] = useState<Blob | null>(null);
  const [rendering, setRendering] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const [error, setError] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExecSummary(cleanText(data.executiveSummary || ''));
    setInterpretation(cleanText(data.clinicalInterpretation || ''));
    setRecommendations(cleanText(data.recommendations || ''));
    setComparison(mergeComparison(data.comparison, data.newFindings));
  }, [data]);

  const generateAndRender = useCallback(async () => {
    setRendering(true);
    setError('');
    try {
      const docx = await fetchReassessmentDocx(sessionId, {
        variant: 'gp',
        gpName, practiceName, practiceAddress,
        patientName: patientNameField, dob: dobField,
        baselineDate, latestDate,
        coverLetter,
        executiveSummary: execSummary,
        clinicalInterpretation: interpretation,
        recommendations,
        comparison,
      });
      setBlob(docx);
      if (previewRef.current) {
        const { renderAsync } = await import('docx-preview');
        previewRef.current.innerHTML = '';
        await renderAsync(docx, previewRef.current, undefined, {
          className: 'docx-render', inWrapper: true, breakPages: false, ignoreLastRenderedPageBreak: true,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setRendering(false);
    }
  }, [sessionId, gpName, practiceName, practiceAddress, patientNameField, dobField, baselineDate, latestDate, coverLetter, execSummary, interpretation, recommendations, comparison]);

  useEffect(() => {
    const t = setTimeout(generateAndRender, 700);
    return () => clearTimeout(t);
  }, [generateAndRender]);

  async function handleRegrade() {
    setRegrading(true); setError('');
    try {
      const out = await regradeReassessment(sessionId, comparison, 'gp');
      setComparison(out.comparison);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-grade failed');
    } finally { setRegrading(false); }
  }

  async function handleRewriteFromResults() {
    setRewriting(true); setError('');
    try {
      const out = await regenerateReassessmentNarrative(sessionId, comparison, data.subjectiveContext || '', 'gp');
      setExecSummary(cleanText(out.executiveSummary || ''));
      setInterpretation(cleanText(out.clinicalInterpretation || ''));
      setRecommendations(cleanText(out.recommendations || ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rewrite failed');
    } finally { setRewriting(false); }
  }

  function handleDownload() {
    if (blob) saveBlob(blob, `GP_Reassessment_${patientNameField || 'Patient'}.docx`);
  }

  const fieldLabel = 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1';
  const textarea = 'w-full border border-gray-200 rounded-lg p-2.5 text-sm text-secondary-700 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary-300';
  const input = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-secondary-700 focus:outline-none focus:ring-2 focus:ring-primary-300';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h2 className="font-display font-bold text-secondary-700 text-base">GP Reassessment Report</h2>
          <p className="text-xs text-gray-400 mt-0.5">Clinician-to-GP letter — edit on the left, preview is the exact document</p>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-500">{error}</span>}
          <button onClick={handleRewriteFromResults} disabled={rewriting}
            title="Re-write the letter prose to match your edited results table"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-primary-300 text-primary-600 hover:bg-primary-50 transition disabled:opacity-50">
            {rewriting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />} Rewrite from results
          </button>
          <button onClick={onRegenerate}
            title="Start over from the session notes (re-extracts results — discards edits)"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate from notes
          </button>
          <button onClick={handleDownload} disabled={!blob || rendering}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-semibold transition disabled:opacity-50" style={{ background: TEAL }}>
            <Download className="w-3.5 h-3.5" /> Download DOCX
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {normsSkipped && (
        <div className="shrink-0 px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-[13px] text-amber-800 flex items-start gap-2">
          <span className="font-semibold shrink-0">Norms not applied:</span>
          <span>This patient's {missingFields} {grounding && grounding.missingSex && grounding.missingAge ? 'are' : 'is'} missing, so the comparison uses neutral baselines instead of age/sex-graded results. Add it and click Regenerate from notes.</span>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-[380px] shrink-0 bg-white border-r border-gray-200 overflow-y-auto p-4 space-y-4">
          {/* GP / referral details */}
          <div className="space-y-2 pb-2 border-b border-gray-100">
            <p className={fieldLabel}>Addressed to (GP &amp; practice)</p>
            <input className={input} placeholder="GP surname (e.g. Patel)" value={gpName} onChange={e => setGpName(e.target.value)} />
            <input className={input} placeholder="Practice name" value={practiceName} onChange={e => setPracticeName(e.target.value)} />
            <input className={input} placeholder="Practice address" value={practiceAddress} onChange={e => setPracticeAddress(e.target.value)} />
            <div className="flex gap-2">
              <input className={input} placeholder="Patient name" value={patientNameField} onChange={e => setPatientNameField(e.target.value)} />
              <input className={input} placeholder="DOB" value={dobField} onChange={e => setDobField(e.target.value)} />
            </div>
          </div>

          <div>
            <p className={fieldLabel}>Cover Letter <span className="normal-case font-normal text-gray-400">(page 1)</span></p>
            <textarea value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={6} className={textarea} />
          </div>

          <div>
            <p className={fieldLabel}>Executive Summary <span className="normal-case font-normal text-gray-400">(page 2)</span></p>
            <textarea value={execSummary} onChange={e => setExecSummary(e.target.value)} rows={6} className={textarea} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className={`${fieldLabel} mb-0`}>Objective Findings — Baseline vs Latest</p>
              <button onClick={handleRegrade} disabled={regrading}
                title="Recompute Change + interpretation from the values (use after filling in a baseline)"
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-primary-300 text-primary-600 hover:bg-primary-50 transition disabled:opacity-50">
                {regrading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calculator className="w-3 h-3" />} Re-grade
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-1">Measure | Baseline | Latest | Change | Clinical interpretation</p>
            <textarea value={comparison} onChange={e => setComparison(e.target.value)} rows={6} className={`${textarea} font-mono text-xs`} />
          </div>

          <div>
            <p className={fieldLabel}>Clinical Interpretation</p>
            <textarea value={interpretation} onChange={e => setInterpretation(e.target.value)} rows={5} className={textarea} />
          </div>
          <div>
            <p className={fieldLabel}>Recommendations</p>
            <textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} rows={5} className={textarea} />
          </div>
          {data.goals.length > 0 && (
            <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
              <span className="font-semibold text-gray-500">Goals referenced:</span>{' '}
              {data.goals.map(g => `${g.goal} (${g.status})`).join('; ')}.
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-gray-200 relative">
          {rendering && (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white/90 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 shadow">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…
            </div>
          )}
          <div ref={previewRef} className="py-6 flex flex-col items-center" />
        </div>
      </div>
    </div>
  );
}
