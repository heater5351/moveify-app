import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, ChevronDown, Plus, Minus, Check, Loader2, X, AlertCircle } from 'lucide-react';
import {
  fetchAssessmentCatalog, fetchMeasurements, saveMeasurement, deleteMeasurement,
  type AssessmentCatalogEntry, type CatalogMeasure, type Measurement, type MeasurementSide,
} from '../../utils/scribe-api';

interface AssessmentPanelProps {
  sessionId: number | null;
  /** When true the session is locked (completed) — values are read-only. */
  readOnly?: boolean;
  /** Ensure a session exists before the first save (mirrors the recorder). */
  ensureSession: () => Promise<number | null>;
}

type SaveState = 'saving' | 'error';

const UNIT_LABEL: Record<string, string> = {
  degrees: '°', kg: 'kg', seconds: 'sec', reps: 'reps', cm: 'cm',
};
function unitLabel(u: string) { return UNIT_LABEL[u] ?? u; }

function valueKey(assessmentKey: string, measureKey: string, side: MeasurementSide) {
  return `${assessmentKey}:${measureKey}:${side}`;
}

function midpoint(m: CatalogMeasure) {
  const mid = (m.min + m.max) / 2;
  return Math.round(mid / m.step) * m.step;
}

function fmtVal(v: number) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export default function AssessmentPanel({ sessionId, readOnly = false, ensureSession }: AssessmentPanelProps) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<AssessmentCatalogEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [side, setSide] = useState<MeasurementSide>('left');
  // Source of truth from the server, keyed by valueKey.
  const [recorded, setRecorded] = useState<Record<string, Measurement>>({});
  // Live slider/stepper position before/around commit.
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const sessionIdRef = useRef<number | null>(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    fetchAssessmentCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  // Load any already-captured measurements for this session.
  useEffect(() => {
    if (!sessionId) return;
    fetchMeasurements(sessionId)
      .then(rows => {
        const map: Record<string, Measurement> = {};
        for (const r of rows) map[valueKey(r.assessment_key, r.measure_key, r.side)] = r;
        setRecorded(map);
      })
      .catch(() => {});
  }, [sessionId]);

  const selected = catalog.find(a => a.key === selectedKey) ?? null;
  // Single-sided assessments store under 'bilateral'; bilateral ones use the toggle.
  const effSide: MeasurementSide = selected?.laterality === 'bilateral' ? side : 'bilateral';

  const displayValue = useCallback((a: AssessmentCatalogEntry, m: CatalogMeasure, s: MeasurementSide) => {
    const k = valueKey(a.key, m.key, s);
    if (draft[k] !== undefined) return draft[k];
    if (recorded[k] !== undefined) return recorded[k].value;
    return midpoint(m);
  }, [draft, recorded]);

  const commit = useCallback(async (a: AssessmentCatalogEntry, m: CatalogMeasure, s: MeasurementSide, value: number) => {
    const k = valueKey(a.key, m.key, s);
    const clamped = Math.min(m.max, Math.max(m.min, value));
    setDraft(d => ({ ...d, [k]: clamped }));
    setStatus(st => ({ ...st, [k]: 'saving' }));
    try {
      const sid = sessionIdRef.current ?? (await ensureSession());
      if (!sid) throw new Error('No session');
      const saved = await saveMeasurement(sid, { assessmentKey: a.key, measureKey: m.key, side: s, value: clamped });
      setRecorded(r => ({ ...r, [k]: saved }));
      setStatus(st => { const n = { ...st }; delete n[k]; return n; });
    } catch {
      setStatus(st => ({ ...st, [k]: 'error' }));
    }
  }, [ensureSession]);

  const clear = useCallback(async (a: AssessmentCatalogEntry, m: CatalogMeasure, s: MeasurementSide) => {
    const k = valueKey(a.key, m.key, s);
    const row = recorded[k];
    setRecorded(r => { const n = { ...r }; delete n[k]; return n; });
    setDraft(d => { const n = { ...d }; delete n[k]; return n; });
    setStatus(st => { const n = { ...st }; delete n[k]; return n; });
    const sid = sessionIdRef.current;
    if (row && sid) { try { await deleteMeasurement(sid, row.id); } catch { /* best-effort */ } }
  }, [recorded]);

  const recordedList = Object.values(recorded);
  const recordedCount = recordedList.length;

  // Build a compact human label for a recorded chip.
  function chipLabel(row: Measurement): string {
    const a = catalog.find(c => c.key === row.assessment_key);
    const m = a?.measures.find(x => x.key === row.measure_key);
    const sideTag = row.side === 'left' ? ' L' : row.side === 'right' ? ' R' : '';
    const name = m ? `${a?.displayName} ${m.label}` : row.assessment_key;
    return `${name}${sideTag}: ${fmtVal(row.value)}${row.unit ? unitLabel(row.unit) : ''}`;
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white shrink-0">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <Activity className="w-4 h-4 text-primary-500 shrink-0" />
        <span className="text-sm font-semibold text-secondary-700">Assessments</span>
        {recordedCount > 0 && (
          <span className="text-xs font-semibold text-white bg-primary-400 rounded-full px-2 py-0.5">{recordedCount}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3">
          {/* Recorded chips */}
          {recordedCount > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {recordedList.map(row => (
                <span key={row.id} className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 rounded-full pl-2.5 pr-1 py-1">
                  {chipLabel(row)}
                  {!readOnly && (
                    <button
                      onClick={() => {
                        const a = catalog.find(c => c.key === row.assessment_key);
                        const m = a?.measures.find(x => x.key === row.measure_key);
                        if (a && m) clear(a, m, row.side);
                      }}
                      className="p-0.5 rounded-full hover:bg-primary-100 text-primary-400"
                      aria-label="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {readOnly && recordedCount === 0 && (
            <p className="text-xs text-gray-400">No measurements were recorded for this session.</p>
          )}

          {!readOnly && (
            <>
              {/* Assessment picker grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-3">
                {catalog.map(a => (
                  <button
                    key={a.key}
                    onClick={() => { setSelectedKey(k => (k === a.key ? null : a.key)); setSide('left'); }}
                    className={`text-xs font-medium rounded-lg px-2 py-2 border transition text-left leading-tight ${
                      selectedKey === a.key
                        ? 'bg-primary-400 border-primary-400 text-white'
                        : 'bg-white border-gray-200 text-secondary-700 hover:border-primary-300'
                    }`}
                  >
                    {a.displayName}
                  </button>
                ))}
              </div>

              {/* Capture controls for the selected assessment */}
              {selected && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  {/* Side toggle for bilateral assessments */}
                  {selected.laterality === 'bilateral' && (
                    <div className="flex gap-1.5 mb-3">
                      {(['left', 'right'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setSide(s)}
                          className={`flex-1 text-sm font-semibold rounded-lg py-1.5 border transition ${
                            side === s
                              ? 'bg-secondary-500 border-secondary-500 text-white'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {s === 'left' ? 'Left' : 'Right'}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-4">
                    {selected.measures.map(m => {
                      const k = valueKey(selected.key, m.key, effSide);
                      const val = displayValue(selected, m, effSide);
                      const isSet = recorded[k] !== undefined;
                      const st = status[k];
                      return (
                        <div key={m.key}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-secondary-700">{m.label}</span>
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className={`font-mono font-semibold ${isSet ? 'text-primary-600' : 'text-gray-400'}`}>
                                {fmtVal(val)}{unitLabel(m.unit)}
                              </span>
                              {st === 'saving' && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
                              {st === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                              {!st && isSet && <Check className="w-3 h-3 text-green-500" />}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => commit(selected, m, effSide, val - m.step)}
                              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 active:scale-95 shrink-0"
                              aria-label="Decrease"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="range"
                              min={m.min}
                              max={m.max}
                              step={m.step}
                              value={val}
                              onChange={e => setDraft(d => ({ ...d, [k]: Number(e.target.value) }))}
                              onPointerUp={e => commit(selected, m, effSide, Number((e.target as HTMLInputElement).value))}
                              onKeyUp={e => commit(selected, m, effSide, Number((e.target as HTMLInputElement).value))}
                              className="flex-1 accent-primary-400 h-2"
                            />
                            <button
                              onClick={() => commit(selected, m, effSide, val + m.step)}
                              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 active:scale-95 shrink-0"
                              aria-label="Increase"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-300 mt-0.5 px-9">
                            <span>{m.min}</span>
                            <span>{m.max}{unitLabel(m.unit)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-3">
                    Values save automatically and feed the note's Objective section, graded against age/sex norms.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
