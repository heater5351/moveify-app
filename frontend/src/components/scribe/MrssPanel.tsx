import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Download, AlertTriangle, Check, Trophy } from 'lucide-react';
import { generateMrss, fetchMrssDocx, saveBlob, type MrssResult } from '../../utils/scribe-api';

interface MrssPanelProps {
  sessionId: number;
  patientName: string;
  assessmentDate: string;
  onClose: () => void;
}

// Catalog option labels for the Part A graded exam toggles, indexed by stored value
// (matches assessment-catalog.json acl_knee_exam). Kept here so the panel needn't
// re-fetch the catalog just to label three findings.
const GRADE_LABELS: Record<string, string[]> = {
  effusion: ['Absent', 'Trace', '1+', '2+', '3+'],
  lachman: ['Nil', 'Mild (0–5 mm)', 'Mod–severe (6 mm+)'],
  pivot: ['Nil', 'Grade I', 'Grade II', 'Grade III–IV'],
};

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function partAFinding(c: MrssResult['partA']['components'][number]): string {
  if (c.value == null) return 'Not recorded';
  if (c.key === 'flexion') return `${fmt(c.deficit)}° deficit (inv ${fmt(c.involved)}° / oth ${fmt(c.uninvolved)}°)`;
  if (c.key === 'extension') return `${fmt(c.value)} cm deficit`;
  const labels = GRADE_LABELS[c.key];
  return labels?.[c.value] ?? fmt(c.value);
}

export default function MrssPanel({ sessionId, patientName, assessmentDate, onClose }: MrssPanelProps) {
  const [involvedSide, setInvolvedSide] = useState<'left' | 'right' | null>(null);
  const [involvedIsDominant, setInvolvedIsDominant] = useState(false);
  const [confidentEager, setConfidentEager] = useState(false);
  const [preventionPlan, setPreventionPlan] = useState(false);
  const [result, setResult] = useState<MrssResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  async function score() {
    if (!involvedSide) return;
    setLoading(true);
    setError('');
    try {
      setResult(await generateMrss(sessionId, { involvedSide, involvedIsDominant }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scoring failed');
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (!involvedSide) return;
    setDownloading(true);
    setError('');
    try {
      const blob = await fetchMrssDocx(sessionId, {
        involvedSide, involvedIsDominant, patientName, assessmentDate, confidentEager, preventionPlan,
      });
      saveBlob(blob, `MRSS_${patientName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Patient'}.docx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  const cleared = !!result && result.scorePass && confidentEager && preventionPlan;

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-secondary-900/50 flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3.5 flex items-start justify-between z-10">
          <div>
            <h2 className="text-base sm:text-lg font-display font-bold text-secondary-700">Melbourne ACL Return-to-Sport Score</h2>
            <p className="text-xs text-gray-500 mt-0.5">{patientName}{assessmentDate ? ` · ${assessmentDate}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-1 text-gray-400 hover:text-secondary-700" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Setup: involved limb */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Involved limb</p>
            <div className="flex gap-2">
              {(['left', 'right'] as const).map(side => (
                <button
                  key={side}
                  onClick={() => { setInvolvedSide(side); setResult(null); }}
                  className={`flex-1 min-h-11 rounded-xl border-2 text-sm font-semibold capitalize transition active:scale-[0.98] ${
                    involvedSide === side ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-secondary-700 hover:border-primary-300'
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2.5 text-sm text-secondary-700 cursor-pointer">
              <input
                type="checkbox"
                checked={involvedIsDominant}
                onChange={e => { setInvolvedIsDominant(e.target.checked); setResult(null); }}
                className="w-4 h-4 rounded accent-primary-500"
              />
              The involved leg is the patient's <strong>dominant</strong> leg
            </label>
            <button
              onClick={score}
              disabled={!involvedSide || loading}
              className="w-full flex items-center justify-center gap-2 bg-primary-400 hover:bg-primary-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.99]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              {result ? 'Re-score' : 'Score MRSS'}
            </button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {result && (
            <>
              {/* Total + score-gate verdict */}
              <div className={`rounded-xl border-2 p-4 text-center ${result.scorePass ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className={`text-4xl font-bold ${result.scorePass ? 'text-green-700' : 'text-amber-700'}`}>{fmt(result.total)}<span className="text-xl text-gray-400"> / 100</span></p>
                <p className={`text-sm font-semibold mt-1 ${result.scorePass ? 'text-green-700' : 'text-amber-700'}`}>
                  {result.scorePass ? 'Score gate met (> 95)' : `Below the ${result.passThreshold} gate`}
                </p>
              </div>

              {!result.complete && (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span><strong>Incomplete.</strong> Not yet captured: {result.missing.join('; ')}. The total counts only recorded tests — capture the rest in the Assessment tab and re-score.</span>
                </div>
              )}

              {/* Part A */}
              <Section title="Part A — Clinical examination" points={result.partA.points} max={result.partA.max}>
                <table className="w-full text-sm">
                  <tbody>
                    {result.partA.components.map(c => (
                      <tr key={c.key} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 pr-2 text-secondary-700">{c.label}</td>
                        <td className={`py-1.5 px-2 text-right ${c.value == null ? 'text-amber-600' : 'text-gray-500'}`}>{partAFinding(c)}</td>
                        <td className="py-1.5 pl-2 text-right font-mono font-semibold text-secondary-700 w-14">{c.points}/{c.max}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              {/* Part B */}
              <Section title="Part B — IKDC Subjective" points={result.partB.points} max={result.partB.max}>
                <p className="text-sm text-gray-600">
                  {result.partB.available
                    ? <>IKDC raw <strong>{fmt(result.partB.ikdcRaw)}</strong> / 100 × 0.25 = <strong>{fmt(result.partB.points)}</strong></>
                    : <span className="text-amber-600">Not captured — hand the IKDC form to the patient via the kiosk in the Assessment tab.</span>}
                </p>
              </Section>

              {/* Part C */}
              <Section title="Part C — Functional testing" points={result.partC.points} max={result.partC.max}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                      <th className="text-left font-semibold py-1">Test</th>
                      <th className="text-right font-semibold py-1">Inv</th>
                      <th className="text-right font-semibold py-1">Unv</th>
                      <th className="text-right font-semibold py-1">LSI</th>
                      <th className="text-right font-semibold py-1 w-14">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.partC.components.map(c => (
                      <tr key={c.key} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 pr-2 text-secondary-700">{c.label}</td>
                        <td className="py-1.5 px-1 text-right text-gray-500 font-mono">{c.type === 'direct' ? `${fmt(c.value)}/${c.max}` : fmt(c.involved)}</td>
                        <td className="py-1.5 px-1 text-right text-gray-500 font-mono">{c.type === 'direct' ? '—' : fmt(c.uninvolved)}</td>
                        <td className="py-1.5 px-1 text-right text-gray-500 font-mono">{c.lsi == null ? '—' : `${fmt(c.lsi)}%`}</td>
                        <td className="py-1.5 pl-1 text-right font-mono font-semibold text-secondary-700">{c.points}/{c.max}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              {/* Clinician-attested clearance criteria */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Clearance criteria (clinician attested)</p>
                <label className="flex items-start gap-2.5 text-sm text-secondary-700 cursor-pointer">
                  <input type="checkbox" checked={confidentEager} onChange={e => setConfidentEager(e.target.checked)} className="w-4 h-4 mt-0.5 rounded accent-primary-500" />
                  Athlete is comfortable, confident and eager to return to sport
                </label>
                <label className="flex items-start gap-2.5 text-sm text-secondary-700 cursor-pointer">
                  <input type="checkbox" checked={preventionPlan} onChange={e => setPreventionPlan(e.target.checked)} className="w-4 h-4 mt-0.5 rounded accent-primary-500" />
                  ACL injury-prevention program discussed, implemented and ongoing
                </label>
                <div className={`flex items-center gap-2 text-sm font-semibold pt-1 ${cleared ? 'text-green-700' : 'text-gray-500'}`}>
                  {cleared ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {cleared ? 'All three criteria met — cleared to return to sport.' : 'Not all criteria met — not yet cleared.'}
                </div>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                A clinical decision aid, not a substitute for clinical judgement. Minimum ~9 months post-op before clearance. Source: Cooper, ACL Rehabilitation Guide 2.0.
              </p>

              <div className="flex justify-end">
                <button
                  onClick={download}
                  disabled={downloading}
                  className="flex items-center gap-2 bg-secondary-500 hover:bg-secondary-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.98]"
                >
                  {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download score sheet (DOCX)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, points, max, children }: { title: string; points: number; max: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-sm font-bold text-secondary-700">{title}</h3>
        <span className="text-sm font-bold text-primary-600">{fmt(points)} / {max}</span>
      </div>
      <div className="bg-white border border-gray-100 rounded-xl px-3 py-2">{children}</div>
    </div>
  );
}
