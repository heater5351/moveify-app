import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Download, RefreshCw, Loader2 } from 'lucide-react';
import type { ReassessmentData, HandoutGrounding } from '../../types';
import { fetchReassessmentDocx, saveBlob } from '../../utils/scribe-api';

interface ReassessmentPreviewProps {
  data: ReassessmentData;
  patientFirstName: string;
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
    .replace(/^[-•·]\s*/gm, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

// Merge the "new this visit" findings into the comparison block as extra rows
// (Baseline shown as "—", Change as "New") so a test only done at reassessment
// still appears in the table.
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

const TEAL = '#46c1c0';

export default function ReassessmentPreview({
  data,
  patientFirstName,
  baselineDate,
  latestDate,
  sessionId,
  grounding,
  onClose,
  onRegenerate,
}: ReassessmentPreviewProps) {
  const normsSkipped = !!grounding && grounding.hasFindings && (grounding.missingSex || grounding.missingAge);
  const missingFields = grounding
    ? [grounding.missingSex && 'sex', grounding.missingAge && 'date of birth'].filter(Boolean).join(' and ')
    : '';

  const [progress, setProgress] = useState(() => cleanText(data.progress));
  const [nextSteps, setNextSteps] = useState(() => cleanText(data.nextSteps));
  const [comparison, setComparison] = useState(() => mergeComparison(data.comparison, data.newFindings));
  const [resultsSummary, setResultsSummary] = useState(() => cleanText(data.resultsSummary || ''));

  const [blob, setBlob] = useState<Blob | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  const previewRef = useRef<HTMLDivElement>(null);

  // Reset the fields if a fresh result arrives (e.g. after Regenerate).
  useEffect(() => {
    setProgress(cleanText(data.progress));
    setNextSteps(cleanText(data.nextSteps));
    setComparison(mergeComparison(data.comparison, data.newFindings));
    setResultsSummary(cleanText(data.resultsSummary || ''));
  }, [data]);

  const generateAndRender = useCallback(async () => {
    setRendering(true);
    setError('');
    try {
      const docx = await fetchReassessmentDocx(sessionId, {
        patientFirstName,
        baselineDate,
        latestDate,
        progress,
        nextSteps,
        comparison,
        resultsSummary,
      });
      setBlob(docx);
      if (previewRef.current) {
        const { renderAsync } = await import('docx-preview');
        previewRef.current.innerHTML = '';
        await renderAsync(docx, previewRef.current, undefined, {
          className: 'docx-render',
          inWrapper: true,
          breakPages: false,
          ignoreLastRenderedPageBreak: true,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setRendering(false);
    }
  }, [sessionId, patientFirstName, baselineDate, latestDate, progress, nextSteps, comparison, resultsSummary]);

  // Debounced regenerate whenever the editable content changes (and on mount).
  useEffect(() => {
    const t = setTimeout(generateAndRender, 700);
    return () => clearTimeout(t);
  }, [generateAndRender]);

  function handleDownload() {
    if (blob) saveBlob(blob, `Reassessment_${patientFirstName || 'Patient'}.docx`);
  }

  const fieldLabel = 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1';
  const textarea = 'w-full border border-gray-200 rounded-lg p-2.5 text-sm text-secondary-700 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary-300';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h2 className="font-display font-bold text-secondary-700 text-base">Reassessment Summary</h2>
          <p className="text-xs text-gray-400 mt-0.5">Edit the text on the left — the preview is the exact document you'll download</p>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-500">{error}</span>}
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate AI
          </button>
          <button
            onClick={handleDownload}
            disabled={!blob || rendering}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-semibold transition disabled:opacity-50"
            style={{ background: TEAL }}
          >
            <Download className="w-3.5 h-3.5" /> Download DOCX
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Norm-grounding warning: age/sex missing → results show baselines, not graded norms */}
      {normsSkipped && (
        <div className="shrink-0 px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-[13px] text-amber-800 flex items-start gap-2">
          <span className="font-semibold shrink-0">Norms not applied:</span>
          <span>
            This patient's {missingFields} {grounding && grounding.missingSex && grounding.missingAge ? 'are' : 'is'} missing,
            so the comparison shows neutral baselines instead of age/sex-graded results. Add it in Cliniko (or Moveify) and
            click <span className="font-semibold">Regenerate AI</span> for graded interpretations.
          </span>
        </div>
      )}

      {/* Body: editor + live docx preview */}
      <div className="flex flex-1 min-h-0">
        {/* Editor panel */}
        <div className="w-[360px] shrink-0 bg-white border-r border-gray-200 overflow-y-auto p-4 space-y-4">
          <div>
            <p className={fieldLabel}>Your Progress</p>
            <textarea value={progress} onChange={e => setProgress(e.target.value)} rows={5} className={textarea} />
          </div>
          <div>
            <p className={fieldLabel}>Where We Go Next</p>
            <textarea value={nextSteps} onChange={e => setNextSteps(e.target.value)} rows={4} className={textarea} />
          </div>
          <div>
            <p className={fieldLabel}>Before &amp; After</p>
            <p className="text-[11px] text-gray-400 mb-1">One per line: Test | Baseline | Latest | Change | What it means</p>
            <textarea
              value={comparison}
              onChange={e => setComparison(e.target.value)}
              rows={6}
              className={`${textarea} font-mono text-xs`}
            />
          </div>
          <div>
            <p className={fieldLabel}>What Your Progress Means</p>
            <textarea value={resultsSummary} onChange={e => setResultsSummary(e.target.value)} rows={6} className={textarea} />
          </div>
          {data.notRepeated.length > 0 && (
            <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
              <span className="font-semibold text-gray-500">Measured at baseline but not repeated this visit:</span>{' '}
              {data.notRepeated.map(r => r.test).join(', ')}. These are not shown in the patient document.
            </div>
          )}
        </div>

        {/* Preview panel */}
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
