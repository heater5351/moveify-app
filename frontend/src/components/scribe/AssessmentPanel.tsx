import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Loader2, X, AlertCircle, Delete, ArrowRight } from 'lucide-react';
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
  /** Bubble the recorded-measurement count up so the parent tab can badge it. */
  onCountChange?: (count: number) => void;
}

type SaveState = 'saving' | 'error';
interface FieldRef { measureKey: string; side: MeasurementSide; }

const UNIT_LABEL: Record<string, string> = {
  degrees: '°', kg: 'kg', seconds: 'sec', reps: 'reps', cm: 'cm',
};
function unitLabel(u: string) { return UNIT_LABEL[u] ?? u; }

function valueKey(assessmentKey: string, measureKey: string, side: MeasurementSide) {
  return `${assessmentKey}:${measureKey}:${side}`;
}

function fmtVal(v: number) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export default function AssessmentPanel({ sessionId, readOnly = false, ensureSession, onCountChange }: AssessmentPanelProps) {
  const [catalog, setCatalog] = useState<AssessmentCatalogEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Source of truth from the server, keyed by valueKey.
  const [recorded, setRecorded] = useState<Record<string, Measurement>>({});
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  // Direct numeric entry: which field the keypad types into, and the typing buffer.
  const [focused, setFocused] = useState<FieldRef | null>(null);
  const [buffer, setBuffer] = useState('');
  const sessionIdRef = useRef<number | null>(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    fetchAssessmentCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

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

  // Ordered list of capturable fields for the selected assessment (measure-major,
  // Left then Right) — drives the keypad's "Next" advance.
  const fieldOrder = useCallback((a: AssessmentCatalogEntry): FieldRef[] => {
    const sides: MeasurementSide[] = a.laterality === 'bilateral' ? ['left', 'right'] : ['bilateral'];
    return a.measures.flatMap(m => sides.map(side => ({ measureKey: m.key, side })));
  }, []);

  const committedValue = useCallback((measureKey: string, side: MeasurementSide): number | null => {
    if (!selected) return null;
    const row = recorded[valueKey(selected.key, measureKey, side)];
    return row ? row.value : null;
  }, [recorded, selected]);

  const save = useCallback(async (a: AssessmentCatalogEntry, m: CatalogMeasure, side: MeasurementSide, raw: string) => {
    const parsed = Number(raw);
    if (raw === '' || !Number.isFinite(parsed)) return;
    const clamped = Math.min(m.max, Math.max(m.min, parsed));
    const k = valueKey(a.key, m.key, side);
    setStatus(st => ({ ...st, [k]: 'saving' }));
    try {
      const sid = sessionIdRef.current ?? (await ensureSession());
      if (!sid) throw new Error('No session');
      const saved = await saveMeasurement(sid, { assessmentKey: a.key, measureKey: m.key, side, value: clamped });
      setRecorded(r => ({ ...r, [k]: saved }));
      setStatus(st => { const n = { ...st }; delete n[k]; return n; });
    } catch {
      setStatus(st => ({ ...st, [k]: 'error' }));
    }
  }, [ensureSession]);

  // Commit the current buffer to the focused field (if anything was typed).
  const commitFocused = useCallback(() => {
    if (!selected || !focused || buffer === '') return;
    const m = selected.measures.find(x => x.key === focused.measureKey);
    if (m) save(selected, m, focused.side, buffer);
  }, [selected, focused, buffer, save]);

  const focusField = useCallback((field: FieldRef) => {
    commitFocused();
    setFocused(field);
    setBuffer('');
  }, [commitFocused]);

  const clear = useCallback(async (a: AssessmentCatalogEntry, measureKey: string, side: MeasurementSide) => {
    const k = valueKey(a.key, measureKey, side);
    const row = recorded[k];
    setRecorded(r => { const n = { ...r }; delete n[k]; return n; });
    setStatus(st => { const n = { ...st }; delete n[k]; return n; });
    const sid = sessionIdRef.current;
    if (row && sid) { try { await deleteMeasurement(sid, row.id); } catch { /* best-effort */ } }
  }, [recorded]);

  // Keypad actions ──────────────────────────────────────────────────────────
  const focusedMeasure = selected && focused ? selected.measures.find(m => m.key === focused.measureKey) ?? null : null;
  const allowDecimal = !!focusedMeasure && focusedMeasure.step % 1 !== 0;

  const pressDigit = (d: string) => setBuffer(b => (b.length >= 5 ? b : b + d));
  const pressDot = () => setBuffer(b => (allowDecimal && !b.includes('.') ? (b === '' ? '0.' : b + '.') : b));
  const pressBackspace = () => setBuffer(b => b.slice(0, -1));
  // Advance focus to the next field in the assessment (or dismiss after the last).
  const advanceFrom = (field: FieldRef) => {
    if (!selected) { setFocused(null); setBuffer(''); return; }
    const order = fieldOrder(selected);
    const idx = order.findIndex(f => f.measureKey === field.measureKey && f.side === field.side);
    setFocused(order[idx + 1] ?? null);
    setBuffer('');
  };
  const pressNext = () => { if (!focused) return; commitFocused(); advanceFrom(focused); };
  const pressDone = () => { commitFocused(); setFocused(null); setBuffer(''); };
  // Preset tap (ROM): commit the value directly and jump to the next field.
  const pickPreset = (value: number) => {
    if (!selected || !focused) return;
    const m = selected.measures.find(x => x.key === focused.measureKey);
    if (m) save(selected, m, focused.side, String(value));
    advanceFrom(focused);
  };

  // Input mode + preset values for the focused field.
  const inputMode: 'presets' | 'keypad' = focusedMeasure?.input ?? 'keypad';
  const presetValues: number[] = [];
  if (focusedMeasure && inputMode === 'presets') {
    const ps = focusedMeasure.presetStep ?? 10;
    for (let v = focusedMeasure.min; v <= focusedMeasure.max + 1e-9; v += ps) presetValues.push(Math.round(v * 100) / 100);
  }

  const recordedList = Object.values(recorded);
  const recordedCount = recordedList.length;
  useEffect(() => { onCountChange?.(recordedCount); }, [recordedCount, onCountChange]);

  function chipLabel(row: Measurement): string {
    const a = catalog.find(c => c.key === row.assessment_key);
    const m = a?.measures.find(x => x.key === row.measure_key);
    const sideTag = row.side === 'left' ? ' L' : row.side === 'right' ? ' R' : '';
    const name = m ? `${a?.displayName} ${m.label}` : row.assessment_key;
    return `${name}${sideTag}: ${fmtVal(row.value)}${row.unit ? unitLabel(row.unit) : ''}`;
  }

  // Render one tappable value field.
  function valueField(m: CatalogMeasure, side: MeasurementSide, showSideLabel: boolean) {
    const k = valueKey(selected!.key, m.key, side);
    const isFocused = !!focused && focused.measureKey === m.key && focused.side === side;
    const committed = committedValue(m.key, side);
    const display = isFocused && buffer !== '' ? buffer : (committed != null ? fmtVal(committed) : '');
    const st = status[k];
    return (
      <button
        type="button"
        onClick={() => focusField({ measureKey: m.key, side })}
        className={`flex-1 min-h-16 rounded-xl border-2 px-3 py-2 text-left transition ${
          isFocused ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {showSideLabel ? (side === 'left' ? 'Left' : 'Right') : m.label}
          {st === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
          {st === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
          {!st && committed != null && <Check className="w-3.5 h-3.5 text-green-500" />}
        </span>
        <span className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold font-mono ${display ? 'text-secondary-700' : 'text-gray-300'}`}>
            {display || '—'}
          </span>
          {(display || isFocused) && <span className="text-sm text-gray-400">{unitLabel(m.unit)}</span>}
          {isFocused && <span className="w-0.5 h-6 bg-primary-400 animate-pulse ml-0.5" />}
        </span>
      </button>
    );
  }

  function keypadKey(label: React.ReactNode, onClick: () => void, extra = '') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`h-14 rounded-xl text-xl font-semibold flex items-center justify-center transition active:scale-95 ${extra || 'bg-white border border-gray-200 text-secondary-700 hover:bg-gray-50'}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full overflow-y-auto">
      {/* Recorded summary */}
      {recordedCount > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
          {recordedList.map(row => (
            <span key={row.id} className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 rounded-full pl-2.5 pr-1 py-1">
              {chipLabel(row)}
              {!readOnly && (
                <button
                  onClick={() => {
                    const a = catalog.find(c => c.key === row.assessment_key);
                    if (a) clear(a, row.measure_key, row.side);
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
          {/* Assessment picker — large tap targets */}
          <div className="grid grid-cols-2 gap-2 mb-3 shrink-0">
            {catalog.map(a => (
              <button
                key={a.key}
                onClick={() => { setSelectedKey(a.key); setFocused(null); setBuffer(''); }}
                className={`min-h-12 text-sm font-semibold rounded-xl px-3 py-2.5 border-2 transition text-left leading-tight ${
                  selectedKey === a.key
                    ? 'bg-primary-400 border-primary-400 text-white'
                    : 'bg-white border-gray-200 text-secondary-700 hover:border-primary-300'
                }`}
              >
                {a.displayName}
              </button>
            ))}
          </div>

          {/* Fields for the selected assessment */}
          {selected && (
            <div className="shrink-0">
              <div className="space-y-2.5">
                {selected.measures.map(m => (
                  <div key={m.key}>
                    {selected.laterality === 'bilateral' && (
                      <p className="text-xs font-semibold text-secondary-700 mb-1">{m.label}</p>
                    )}
                    <div className="flex gap-2">
                      {selected.laterality === 'bilateral'
                        ? (['left', 'right'] as const).map(side => (
                            <div key={side} className="flex-1 flex">{valueField(m, side, true)}</div>
                          ))
                        : <div className="flex-1 flex">{valueField(m, 'bilateral', false)}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Sticky input zone — preset grid (ROM) or numeric keypad — appears once a field is focused */}
              {focused && focusedMeasure && (
                <div className="sticky bottom-0 bg-white pt-3 mt-3 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400 mb-2 text-center">
                    {inputMode === 'presets' ? 'Tap a value' : `Range ${focusedMeasure.min}–${focusedMeasure.max}${unitLabel(focusedMeasure.unit)}`} · saves automatically
                  </p>

                  {inputMode === 'presets' ? (
                    <div className="grid grid-cols-5 gap-2">
                      {presetValues.map(v => {
                        const isCur = committedValue(focused.measureKey, focused.side) === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => pickPreset(v)}
                            className={`h-12 rounded-xl text-base font-semibold border-2 transition active:scale-95 ${
                              isCur ? 'bg-primary-400 border-primary-400 text-white' : 'bg-white border-gray-200 text-secondary-700 hover:border-primary-300'
                            }`}
                          >
                            {v}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={pressDone}
                        className="h-12 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition active:scale-95 col-span-2"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {keypadKey('7', () => pressDigit('7'))}
                      {keypadKey('8', () => pressDigit('8'))}
                      {keypadKey('9', () => pressDigit('9'))}
                      {keypadKey(<Delete className="w-5 h-5" />, pressBackspace, 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                      {keypadKey('4', () => pressDigit('4'))}
                      {keypadKey('5', () => pressDigit('5'))}
                      {keypadKey('6', () => pressDigit('6'))}
                      {keypadKey(<span className="flex items-center gap-1 text-sm"><ArrowRight className="w-4 h-4" />Next</span>, pressNext, 'bg-secondary-500 text-white hover:bg-secondary-600 row-span-2')}
                      {keypadKey('1', () => pressDigit('1'))}
                      {keypadKey('2', () => pressDigit('2'))}
                      {keypadKey('3', () => pressDigit('3'))}
                      {keypadKey(allowDecimal ? '.' : '', allowDecimal ? pressDot : () => {}, allowDecimal ? '' : 'invisible')}
                      {keypadKey('0', () => pressDigit('0'))}
                      {keypadKey('Done', pressDone, 'bg-primary-400 text-white hover:bg-primary-500 text-base')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!selected && (
            <p className="text-xs text-gray-400 shrink-0">Pick an assessment to record values.</p>
          )}
        </>
      )}
    </div>
  );
}
