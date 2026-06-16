import { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { fetchMeasurementSeries, type MeasurementSeries } from '../../utils/scribe-api';

interface AssessmentTrendsProps {
  patientId: number;
}

const UNIT_LABEL: Record<string, string> = {
  degrees: '°', kg: 'kg', seconds: 'sec', reps: 'reps', cm: 'cm',
};
function unitLabel(u: string | null) { return u ? (UNIT_LABEL[u] ?? u) : ''; }

function sideLabel(side: string) {
  return side === 'left' ? 'Left' : side === 'right' ? 'Right' : '';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' });
}

// Lightweight inline sparkline — no chart library. Normalises the series to its
// own min/max so the trajectory is visible regardless of absolute scale.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 120, h = 32, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary-400" />
      <circle cx={lx} cy={ly} r="2.5" className="fill-primary-500" />
    </svg>
  );
}

function DirectionBadge({ direction }: { direction: string | null }) {
  if (direction === 'improved') {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600"><TrendingUp className="w-3.5 h-3.5" /> Improved</span>;
  }
  if (direction === 'declined') {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"><TrendingDown className="w-3.5 h-3.5" /> Declined</span>;
  }
  if (direction === 'maintained') {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400"><Minus className="w-3.5 h-3.5" /> Steady</span>;
  }
  return null;
}

export default function AssessmentTrends({ patientId }: AssessmentTrendsProps) {
  const [series, setSeries] = useState<MeasurementSeries[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchMeasurementSeries(patientId)
      .then(s => { if (active) setSeries(s); })
      .catch(() => { if (active) setError('Could not load assessment trends.'); });
    return () => { active = false; };
  }, [patientId]);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (series === null) {
    return <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading trends…</div>;
  }

  if (series.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No assessments recorded yet.</p>
        <p className="text-xs mt-1">Capture measurements from the Assessments tab inside a progress note.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 mb-1">Assessment Trends</h2>
      <p className="text-xs text-slate-400 mb-5">Objective measures captured in progress notes, graded against age/sex norms.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {series.map(s => {
          const key = `${s.assessmentKey}:${s.measureKey}:${s.side}`;
          const side = sideLabel(s.side);
          return (
            <div key={key} className="border border-slate-200 rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-secondary-700 leading-tight">
                    {s.displayName}{side && <span className="text-slate-400 font-medium"> · {side}</span>}
                  </h3>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-primary-600 font-mono">{s.latestValue}</span>
                    <span className="text-sm text-slate-400">{unitLabel(s.unit)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-primary-400">
                  <Sparkline values={s.points.map(p => p.value)} />
                </div>
              </div>

              {s.change?.direction && (
                <div className="mb-2"><DirectionBadge direction={s.change.direction} /></div>
              )}

              {(s.change?.text || s.latestInterpretation) && (
                <p className="text-xs text-slate-500 leading-relaxed">
                  {s.change?.text || s.latestInterpretation}
                </p>
              )}

              {/* Per-visit values */}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                {s.points.map((p, i) => (
                  <span key={`${p.sessionId}-${i}`} className={i === s.points.length - 1 ? 'text-slate-600 font-semibold' : ''}>
                    {fmtDate(p.date)}: {p.value}{unitLabel(s.unit)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
