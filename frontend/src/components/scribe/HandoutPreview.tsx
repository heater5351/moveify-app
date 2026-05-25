import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Download, RefreshCw, Loader2 } from 'lucide-react';
import type { HandoutSections } from '../../types';
import { fetchHandoutDocx, saveBlob } from '../../utils/scribe-api';

interface HandoutPreviewProps {
  sections: HandoutSections;
  patientFirstName: string;
  assessmentDate: string;
  sessionId: number;
  onClose: () => void;
  onRegenerate: () => void;
}

// Strip markdown, brackets, emojis and leading bullets so the text drops cleanly
// into the editable fields.
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

const TEAL = '#46c1c0';

export default function HandoutPreview({
  sections,
  patientFirstName,
  assessmentDate,
  sessionId,
  onClose,
  onRegenerate,
}: HandoutPreviewProps) {
  const [foundText, setFoundText] = useState(() => cleanText(sections.found));
  const [focusText, setFocusText] = useState(() => cleanText(sections.focus));
  const [contextText, setContextText] = useState(() => cleanText(sections.clinicalContext || ''));

  const [blob, setBlob] = useState<Blob | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  const previewRef = useRef<HTMLDivElement>(null);

  // Reset the fields if a fresh set of sections arrives (e.g. after Regenerate).
  useEffect(() => {
    setFoundText(cleanText(sections.found));
    setFocusText(cleanText(sections.focus));
    setContextText(cleanText(sections.clinicalContext || ''));
  }, [sections]);

  const generateAndRender = useCallback(async () => {
    setRendering(true);
    setError('');
    try {
      const docx = await fetchHandoutDocx(sessionId, {
        patientFirstName,
        assessmentDate,
        found: foundText,
        focus: focusText,
        clinicalContext: contextText,
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
  }, [sessionId, patientFirstName, assessmentDate, foundText, focusText, contextText]);

  // Debounced regenerate whenever the editable content changes (and on mount).
  useEffect(() => {
    const t = setTimeout(generateAndRender, 700);
    return () => clearTimeout(t);
  }, [generateAndRender]);

  function handleDownload() {
    if (blob) saveBlob(blob, `Handout_${patientFirstName || 'Patient'}.docx`);
  }

  const fieldLabel = 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1';
  const textarea = 'w-full border border-gray-200 rounded-lg p-2.5 text-sm text-secondary-700 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary-300';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h2 className="font-display font-bold text-secondary-700 text-base">Patient Handout</h2>
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

      {/* Body: editor + live docx preview */}
      <div className="flex flex-1 min-h-0">
        {/* Editor panel */}
        <div className="w-[360px] shrink-0 bg-white border-r border-gray-200 overflow-y-auto p-4 space-y-4">
          <div>
            <p className={fieldLabel}>What We Found</p>
            <textarea
              value={foundText}
              onChange={e => setFoundText(e.target.value)}
              rows={7}
              className={textarea}
            />
          </div>
          <div>
            <p className={fieldLabel}>What We'll Focus On</p>
            <textarea
              value={focusText}
              onChange={e => setFocusText(e.target.value)}
              rows={6}
              className={textarea}
            />
          </div>
          <div>
            <p className={fieldLabel}>Assessment Results</p>
            <p className="text-[11px] text-gray-400 mb-1">One per line: Test | Result | Interpretation</p>
            <textarea
              value={contextText}
              onChange={e => setContextText(e.target.value)}
              rows={5}
              className={`${textarea} font-mono text-xs`}
            />
          </div>
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
