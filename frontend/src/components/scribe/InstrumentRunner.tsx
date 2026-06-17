import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, Check, Loader2, ChevronRight } from 'lucide-react';
import { saveInstrument, type AssessmentCatalogEntry, type InstrumentDetail, type InstrumentItem, type Measurement } from '../../utils/scribe-api';

interface InstrumentRunnerProps {
  assessment: AssessmentCatalogEntry; // must have .instrument
  sessionId: number | null;
  ensureSession: () => Promise<number | null>;
  initialDetail?: InstrumentDetail | null;
  onClose: () => void;
  onSaved: (m: Measurement) => void;
}

interface Step { item: InstrumentItem; side: 'left' | 'right' | null; }

// Deterministic running total (display only — the server is authoritative on save).
function runningTotal(items: InstrumentItem[], answers: InstrumentDetail): number {
  let total = 0;
  for (const it of items) {
    const a = answers[it.key];
    if (it.bilateral) {
      const o = (a && typeof a === 'object') ? a : {};
      const vals = [o.left, o.right].filter((v): v is number => typeof v === 'number');
      if (vals.length) total += Math.min(...vals);
    } else if (typeof a === 'number') total += a;
  }
  return total;
}

function isComplete(items: InstrumentItem[], answers: InstrumentDetail): boolean {
  return items.every(it => {
    const a = answers[it.key];
    if (it.bilateral) return a && typeof a === 'object' && typeof a.left === 'number' && typeof a.right === 'number';
    return typeof a === 'number';
  });
}

export default function InstrumentRunner({ assessment, sessionId, ensureSession, initialDetail, onClose, onSaved }: InstrumentRunnerProps) {
  const inst = assessment.instrument!;
  const measureKey = assessment.measures[0].key;

  const steps = useMemo<Step[]>(() => inst.items.flatMap((item): Step[] =>
    item.bilateral
      ? [{ item, side: 'left' }, { item, side: 'right' }]
      : [{ item, side: null }]
  ), [inst.items]);

  const [answers, setAnswers] = useState<InstrumentDetail>(initialDetail ? { ...initialDetail } : {});
  const [stepIdx, setStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reviewing = stepIdx >= steps.length;
  const step = reviewing ? null : steps[stepIdx];
  const total = runningTotal(inst.items, answers);
  const complete = isComplete(inst.items, answers);

  function currentValue(item: InstrumentItem, side: 'left' | 'right' | null): number | undefined {
    const a = answers[item.key];
    if (side) return (a && typeof a === 'object') ? a[side] : undefined;
    return typeof a === 'number' ? a : undefined;
  }

  function choose(value: number) {
    if (!step) return;
    setAnswers(prev => {
      if (step.side) {
        const existing = (prev[step.item.key] && typeof prev[step.item.key] === 'object') ? prev[step.item.key] as { left?: number; right?: number } : {};
        return { ...prev, [step.item.key]: { ...existing, [step.side]: value } };
      }
      return { ...prev, [step.item.key]: value };
    });
    setStepIdx(i => i + 1);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const sid = sessionId ?? (await ensureSession());
      if (!sid) throw new Error('No session');
      const saved = await saveInstrument(sid, { assessmentKey: assessment.key, measureKey, detail: answers });
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  }

  // Label for a recorded item on the review screen.
  function answerLabel(item: InstrumentItem): string {
    const a = answers[item.key];
    if (item.bilateral) {
      const o = (a && typeof a === 'object') ? a : {};
      const fmt = (v?: number) => (typeof v === 'number' ? v : '—');
      return `L ${fmt(o.left)} · R ${fmt(o.right)}`;
    }
    return typeof a === 'number' ? String(a) : '—';
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-white flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => (stepIdx > 0 ? setStepIdx(i => i - 1) : onClose())}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-secondary-700 -ml-1 p-1"
          >
            <ArrowLeft className="w-4 h-4" /> {stepIdx > 0 ? 'Back' : 'Close'}
          </button>
          <div className="text-sm font-semibold text-secondary-700">{assessment.displayName}</div>
          <button onClick={onClose} className="p-1 -mr-1 text-gray-400 hover:text-secondary-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-400 rounded-full transition-all" style={{ width: `${Math.round((Math.min(stepIdx, steps.length) / steps.length) * 100)}%` }} />
          </div>
          <span className="text-xs font-mono font-semibold text-secondary-700 shrink-0">{total} / {inst.maxScore}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 max-w-2xl mx-auto w-full">
        {!reviewing && step ? (
          <>
            {step.item.section && (
              <p className="text-[11px] font-semibold text-primary-500 uppercase tracking-wide mb-1">{step.item.section}</p>
            )}
            <h2 className="text-lg font-bold text-secondary-700 leading-tight">
              {step.item.name}
              {step.side && <span className="text-gray-400 font-semibold"> · {step.side === 'left' ? 'Left' : 'Right'}</span>}
            </h2>
            <p className="text-xs text-gray-400 mb-1">Item {stepIdx + 1} of {steps.length}</p>
            <p className="text-sm text-secondary-600 leading-relaxed bg-gray-50 border border-gray-100 rounded-xl p-3 my-4">{step.item.instruction}</p>

            <div className="space-y-2.5">
              {step.item.options.map(opt => {
                const isCur = currentValue(step.item, step.side) === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => choose(opt.value)}
                    className={`w-full flex items-center gap-3 min-h-14 rounded-xl border-2 px-3 py-2.5 text-left transition active:scale-[0.99] ${
                      isCur ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white hover:border-primary-300'
                    }`}
                  >
                    <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold ${isCur ? 'bg-primary-400 text-white' : 'bg-gray-100 text-secondary-700'}`}>{opt.value}</span>
                    <span className="text-sm font-medium text-secondary-700 leading-snug">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          // Review screen
          <>
            <h2 className="text-lg font-bold text-secondary-700 mb-1">Review &amp; save</h2>
            <p className="text-sm text-gray-400 mb-4">Total <span className="font-bold text-primary-600">{total}</span> / {inst.maxScore}. Tap any item to change it.</p>
            <div className="space-y-1.5">
              {inst.items.map(item => {
                const idx = steps.findIndex(s => s.item.key === item.key);
                const answered = item.bilateral
                  ? (() => { const a = answers[item.key]; return !!a && typeof a === 'object' && typeof a.left === 'number' && typeof a.right === 'number'; })()
                  : typeof answers[item.key] === 'number';
                return (
                  <button
                    key={item.key}
                    onClick={() => setStepIdx(idx)}
                    className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${answered ? 'border-gray-200 bg-white hover:border-primary-300' : 'border-amber-300 bg-amber-50'}`}
                  >
                    <span className="text-sm text-secondary-700 min-w-0 truncate">{item.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-mono font-bold ${answered ? 'text-primary-600' : 'text-amber-500'}`}>{answerLabel(item)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </span>
                  </button>
                );
              })}
            </div>
            {inst.attribution && <p className="text-[11px] text-gray-300 mt-4">{inst.attribution}</p>}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-3 border-t border-gray-100 max-w-2xl mx-auto w-full">
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        {reviewing ? (
          <button
            onClick={handleSave}
            disabled={saving || !complete}
            className="w-full flex items-center justify-center gap-2 bg-primary-400 hover:bg-primary-500 disabled:opacity-40 text-white py-3 rounded-xl font-semibold transition active:scale-[0.99]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {complete ? `Save · ${total} / ${inst.maxScore}` : 'Complete all items to save'}
          </button>
        ) : (
          <button
            onClick={() => setStepIdx(steps.length)}
            className="w-full text-sm font-semibold text-gray-500 hover:text-secondary-700 py-2"
          >
            Skip to review →
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
