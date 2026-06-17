import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Lock, ArrowLeft, Check, Loader2, Plus, X, Pencil } from 'lucide-react';
import { submitOutcome, verifyKioskPin, type PromCatalogEntry, type PromItem, type PromResponses, type OutcomeResult } from '../../utils/scribe-api';

interface PromKioskProps {
  prom: PromCatalogEntry;
  sessionId: number | null;
  ensureSession: () => Promise<number | null>;
  onComplete: (result: OutcomeResult) => void;
  onExit: () => void; // called after PIN-verified exit
}

interface Question { key: string; text: string; item: PromItem; }

export default function PromKiosk({ prom, sessionId, ensureSession, onComplete, onExit }: PromKioskProps) {
  const isPsfs = prom.scoring === 'average' && !!prom.activities?.clinicianEntered;

  const [phase, setPhase] = useState<'setup' | 'intro' | 'question' | 'review' | 'thanks'>(isPsfs ? 'setup' : 'intro');
  const [activities, setActivities] = useState<string[]>(['', '', '']);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [qIdx, setQIdx] = useState(0);
  const [returnToReview, setReturnToReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // PIN exit overlay
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const questions: Question[] = useMemo(() => {
    if (isPsfs) {
      const sc = prom.activities!.scale;
      return activities.map((name, i) => ({ key: `act_${i}`, text: name, item: { key: `act_${i}`, text: name, scale: sc } }));
    }
    return (prom.items ?? []).map(it => ({ key: it.key, text: it.text, item: it }));
  }, [isPsfs, activities, prom]);

  function pick(value: number) {
    const q = questions[qIdx];
    setAnswers(prev => ({ ...prev, [q.key]: value }));
    if (returnToReview) { setReturnToReview(false); setPhase('review'); }
    else if (qIdx < questions.length - 1) setQIdx(qIdx + 1);
    else setPhase('review');
  }

  function editQuestion(i: number) { setQIdx(i); setReturnToReview(true); setPhase('question'); }

  // Plain-language version of a chosen answer, for the review screen.
  function answerText(q: Question): string {
    const v = answers[q.key];
    if (v === undefined) return '—';
    const item = q.item;
    if (item.type === 'yesno') return v === 1 ? 'Yes' : 'No';
    if (item.options) return item.options.find(o => o.value === v)?.label ?? String(v);
    return String(v);
  }

  const allAnswered = questions.every(q => answers[q.key] !== undefined);

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const sid = sessionId ?? (await ensureSession());
      if (!sid) throw new Error('No session');
      let responses: PromResponses;
      if (isPsfs) responses = { activities: questions.map(q => ({ name: q.text, score: answers[q.key] })) };
      else responses = Object.fromEntries(questions.map(q => [q.key, answers[q.key]]));
      const result = await submitOutcome(sid, prom.key, responses);
      onComplete(result);
      setPhase('thanks');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function tryExit() {
    setPinError('');
    if (await verifyKioskPin(pin)) { setShowPin(false); onExit(); }
    else { setPinError('Incorrect PIN'); setPin(''); }
  }

  const validActivities = activities.map(a => a.trim()).filter(Boolean);

  const ExitButton = (
    <button onClick={() => { setShowPin(true); setPin(''); setPinError(''); }} className="absolute top-4 right-4 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 px-3 py-2 rounded-lg">
      <Lock className="w-4 h-4" /> Clinician exit
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-white flex flex-col">
      {ExitButton}

      {/* SETUP (clinician enters PSFS activities) */}
      {phase === 'setup' && (
        <div className="flex-1 overflow-y-auto px-6 py-10 max-w-xl mx-auto w-full">
          <h1 className="text-2xl font-bold text-secondary-700 mb-1">{prom.name}</h1>
          <p className="text-base text-gray-500 mb-6">Enter the activities the patient finds difficult, then hand them the device to rate each one.</p>
          <div className="space-y-3">
            {activities.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={a}
                  onChange={e => setActivities(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={prom.activities?.prompt || 'Activity'}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3.5 text-lg focus:outline-none focus:border-primary-400"
                />
                {activities.length > 1 && (
                  <button onClick={() => setActivities(prev => prev.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-500"><X className="w-5 h-5" /></button>
                )}
              </div>
            ))}
          </div>
          {activities.length < (prom.activities?.max ?? 5) && (
            <button onClick={() => setActivities(prev => [...prev, ''])} className="mt-3 flex items-center gap-1.5 text-base font-semibold text-primary-500 hover:text-primary-600">
              <Plus className="w-5 h-5" /> Add activity
            </button>
          )}
          <button
            onClick={() => { setActivities(validActivities); setPhase('intro'); }}
            disabled={validActivities.length < (prom.activities?.min ?? 1)}
            className="mt-8 w-full bg-primary-400 hover:bg-primary-500 disabled:opacity-40 text-white py-4 rounded-xl text-lg font-semibold transition"
          >
            Hand to patient →
          </button>
        </div>
      )}

      {/* INTRO (patient) */}
      {phase === 'intro' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold text-secondary-700 mb-4 leading-tight">{prom.name}</h1>
          <p className="text-2xl text-gray-600 mb-12 leading-relaxed">{prom.patientIntro}</p>
          <button onClick={() => { setQIdx(0); setPhase('question'); }} className="bg-primary-400 hover:bg-primary-500 text-white text-2xl font-bold px-14 py-5 rounded-2xl transition active:scale-[0.98]">
            Start
          </button>
        </div>
      )}

      {/* QUESTION (patient, one per screen) — large targets for older patients */}
      {phase === 'question' && questions[qIdx] && (
        <div className="flex-1 flex flex-col px-6 py-8 max-w-3xl mx-auto w-full">
          <div className="shrink-0 mb-8">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-primary-400 rounded-full transition-all" style={{ width: `${((qIdx + 1) / questions.length) * 100}%` }} />
            </div>
            <p className="text-base text-gray-400">Question {qIdx + 1} of {questions.length}</p>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-3xl font-bold text-secondary-700 mb-10 leading-snug text-center">{questions[qIdx].text}</h2>

            {(() => {
              const item = questions[qIdx].item;
              const cur = answers[questions[qIdx].key];
              if (item.type === 'yesno') {
                return (
                  <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto w-full">
                    {[{ v: 1, l: 'Yes' }, { v: 0, l: 'No' }].map(o => (
                      <button key={o.v} onClick={() => pick(o.v)} disabled={saving}
                        className={`min-h-24 rounded-2xl text-2xl font-bold border-2 transition active:scale-95 ${cur === o.v ? 'bg-primary-400 border-primary-400 text-white' : 'bg-white border-gray-200 text-secondary-700 hover:border-primary-300'}`}>{o.l}</button>
                    ))}
                  </div>
                );
              }
              if (item.options) {
                return (
                  <div className="space-y-3 max-w-2xl mx-auto w-full">
                    {item.options.map(o => (
                      <button key={o.value} onClick={() => pick(o.value)} disabled={saving}
                        className={`w-full flex items-center gap-4 min-h-20 rounded-2xl border-2 px-5 py-4 text-left transition active:scale-[0.99] ${cur === o.value ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white hover:border-primary-300'}`}>
                        <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold ${cur === o.value ? 'bg-primary-400 text-white' : 'bg-gray-100 text-secondary-700'}`}>{o.value}</span>
                        <span className="text-xl font-medium text-secondary-700 leading-snug">{o.label}</span>
                      </button>
                    ))}
                  </div>
                );
              }
              const sc = item.scale!;
              const count = sc.max - sc.min + 1;
              // Columns = number of options so a 0-3 spreads across the full width
              // (big buttons) just like a 0-10, instead of bunching to the left.
              const maxW = count <= 5 ? 'max-w-xl' : 'max-w-3xl';
              return (
                <>
                  <div className={`grid gap-2.5 ${maxW} mx-auto w-full`} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
                    {Array.from({ length: count }, (_, n) => sc.min + n).map(v => (
                      <button key={v} onClick={() => pick(v)} disabled={saving}
                        className={`h-16 sm:h-20 rounded-2xl text-2xl font-bold border-2 transition active:scale-95 ${cur === v ? 'bg-primary-400 border-primary-400 text-white' : 'bg-white border-gray-200 text-secondary-700 hover:border-primary-300'}`}>{v}</button>
                    ))}
                  </div>
                  <div className={`flex justify-between text-lg text-gray-500 mt-4 px-1 ${maxW} mx-auto w-full`}>
                    <span>{sc.minLabel}</span>
                    <span className="text-right">{sc.maxLabel}</span>
                  </div>
                </>
              );
            })()}
            {error && <p className="text-base text-red-500 text-center mt-6">{error}</p>}
          </div>

          <button
            onClick={() => (returnToReview ? (setReturnToReview(false), setPhase('review')) : qIdx > 0 ? setQIdx(qIdx - 1) : undefined)}
            className={`shrink-0 self-start mt-6 flex items-center gap-1.5 text-base text-gray-400 hover:text-secondary-700 ${(returnToReview || qIdx > 0) ? '' : 'invisible'}`}
          >
            <ArrowLeft className="w-5 h-5" /> {returnToReview ? 'Back to review' : 'Back'}
          </button>
        </div>
      )}

      {/* REVIEW (patient checks answers before submitting) */}
      {phase === 'review' && (
        <div className="flex-1 flex flex-col min-h-0 max-w-3xl mx-auto w-full">
          <div className="shrink-0 px-6 pt-10 pb-4 text-center">
            <h1 className="text-3xl font-bold text-secondary-700 mb-1">Please check your answers</h1>
            <p className="text-lg text-gray-500">Tap any answer to change it, then submit.</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6">
            <div className="divide-y divide-gray-100 border-y border-gray-100">
              {questions.map((q, i) => (
                <button key={q.key} onClick={() => editQuestion(i)} className="w-full flex items-start gap-4 py-4 text-left hover:bg-gray-50 transition">
                  <span className="flex-1 text-lg text-secondary-700 leading-snug">{q.text}</span>
                  <span className={`shrink-0 flex items-center gap-2 text-lg font-bold ${answers[q.key] === undefined ? 'text-amber-500' : 'text-primary-600'}`}>
                    {answerText(q)}
                    <Pencil className="w-4 h-4 text-gray-300" />
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="shrink-0 px-6 py-4 border-t border-gray-100">
            {error && <p className="text-base text-red-500 mb-2 text-center">{error}</p>}
            <button onClick={submit} disabled={saving || !allAnswered}
              className="w-full flex items-center justify-center gap-2 bg-primary-400 hover:bg-primary-500 disabled:opacity-40 text-white py-4 rounded-xl text-xl font-bold transition active:scale-[0.99]">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {allAnswered ? 'Submit my answers' : 'Please answer every question'}
            </button>
          </div>
        </div>
      )}

      {/* THANKS (handback) */}
      {phase === 'thanks' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-6"><Check className="w-10 h-10 text-green-500" /></div>
          <h1 className="text-3xl font-bold text-secondary-700 mb-3">All done — thank you</h1>
          <p className="text-xl text-gray-500 mb-12">Please hand the device back to your clinician.</p>
          <button onClick={() => { setShowPin(true); setPin(''); setPinError(''); }} className="bg-secondary-500 hover:bg-secondary-600 text-white text-lg font-semibold px-10 py-4 rounded-xl transition">
            Clinician: tap to finish
          </button>
        </div>
      )}

      {/* PIN pad overlay */}
      {showPin && (
        <div className="absolute inset-0 z-10 bg-secondary-900/50 flex items-center justify-center px-6" onClick={() => setShowPin(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <p className="text-center text-sm font-semibold text-secondary-700 mb-1">Clinician PIN</p>
            <div className="flex justify-center gap-2 my-4">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className={`w-3 h-3 rounded-full ${i < pin.length ? 'bg-primary-400' : 'bg-gray-200'}`} />
              ))}
            </div>
            {pinError && <p className="text-center text-xs text-red-500 mb-2">{pinError}</p>}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                <button key={d} onClick={() => setPin(p => (p.length < 6 ? p + d : p))} className="h-14 rounded-xl text-xl font-semibold bg-gray-50 hover:bg-gray-100 active:scale-95">{d}</button>
              ))}
              <button onClick={() => setPin('')} className="h-14 rounded-xl text-sm font-semibold text-gray-400 hover:bg-gray-100">Clear</button>
              <button onClick={() => setPin(p => (p.length < 6 ? p + '0' : p))} className="h-14 rounded-xl text-xl font-semibold bg-gray-50 hover:bg-gray-100 active:scale-95">0</button>
              <button onClick={tryExit} disabled={pin.length < 4} className="h-14 rounded-xl text-sm font-semibold bg-primary-400 disabled:opacity-40 text-white hover:bg-primary-500">Enter</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
