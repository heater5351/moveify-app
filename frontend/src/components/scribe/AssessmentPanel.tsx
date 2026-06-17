import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, X, AlertCircle, Delete, ArrowRight, ClipboardList, ClipboardCheck } from 'lucide-react';
import {
  fetchAssessmentCatalog, fetchMeasurements, saveMeasurement, deleteMeasurement,
  fetchPromCatalog, fetchSessionOutcomes, getKioskPinSet, setKioskPin,
  type AssessmentCatalogEntry, type CatalogMeasure, type Measurement, type MeasurementSide,
  type PromCatalogEntry, type OutcomeResult,
} from '../../utils/scribe-api';
import InstrumentRunner from './InstrumentRunner';
import PromKiosk from './PromKiosk';

interface AssessmentPanelProps {
  sessionId: number | null;
  readOnly?: boolean;
  ensureSession: () => Promise<number | null>;
  onCountChange?: (count: number) => void;
}

type SaveState = 'saving' | 'error';
interface FieldRef { measureKey: string; side: MeasurementSide; }

const UNIT_LABEL: Record<string, string> = {
  degrees: '°', kg: 'kg', seconds: 'sec', reps: 'reps', cm: 'cm',
  m_s: 'm/s', bpm: 'bpm', mmol_L: 'mmol/L', metres: 'm', points: 'pts', mmHg: 'mmHg',
};
function unitLabel(u: string) { return UNIT_LABEL[u] ?? u; }

function valueKey(a: string, m: string, side: MeasurementSide) { return `${a}:${m}:${side}`; }
function fmtVal(v: number) { return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); }
function inputMode(m: CatalogMeasure) { return m.input ?? 'keypad'; }
function sidesOf(a: AssessmentCatalogEntry, m: CatalogMeasure): MeasurementSide[] {
  return (m.laterality ?? a.laterality) === 'bilateral' ? ['left', 'right'] : ['bilateral'];
}

export default function AssessmentPanel({ sessionId, readOnly = false, ensureSession, onCountChange }: AssessmentPanelProps) {
  const [catalog, setCatalog] = useState<AssessmentCatalogEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Record<string, Measurement>>({});
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const [focused, setFocused] = useState<FieldRef | null>(null);
  const [buffer, setBuffer] = useState('');
  const [runnerKey, setRunnerKey] = useState<string | null>(null);
  // PROMs (patient-completed outcome measures)
  const [proms, setProms] = useState<PromCatalogEntry[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeResult[]>([]);
  const [kioskProm, setKioskProm] = useState<PromCatalogEntry | null>(null);
  const [pendingProm, setPendingProm] = useState<PromCatalogEntry | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const sessionIdRef = useRef<number | null>(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => { fetchAssessmentCatalog().then(setCatalog).catch(() => setCatalog([])); }, []);
  useEffect(() => { fetchPromCatalog().then(setProms).catch(() => setProms([])); }, []);
  useEffect(() => {
    if (!sessionId) return;
    fetchSessionOutcomes(sessionId).then(setOutcomes).catch(() => {});
  }, [sessionId]);

  async function launchProm(p: PromCatalogEntry) {
    try {
      if (await getKioskPinSet()) setKioskProm(p);
      else { setPendingProm(p); setPinValue(''); setPinError(''); }
    } catch { setPendingProm(p); }
  }
  async function createPinAndLaunch() {
    setPinError('');
    try {
      await setKioskPin(pinValue);
      const p = pendingProm;
      setPendingProm(null);
      if (p) setKioskProm(p);
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Failed to set PIN');
    }
  }

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

  // Group the picker by category, preserving catalog order.
  const byCategory = new Map<string, AssessmentCatalogEntry[]>();
  for (const a of catalog) {
    const list = byCategory.get(a.category) ?? [];
    list.push(a);
    byCategory.set(a.category, list);
  }
  const categories = [...byCategory.keys()];

  const committedRow = (measureKey: string, side: MeasurementSide): Measurement | null =>
    (selected ? recorded[valueKey(selected.key, measureKey, side)] : null) ?? null;

  function fieldOrder(a: AssessmentCatalogEntry): FieldRef[] {
    return a.measures.flatMap(m => sidesOf(a, m).map(side => ({ measureKey: m.key, side })));
  }

  async function save(m: CatalogMeasure, side: MeasurementSide, value: number, value2: number | null = null) {
    if (!selected) return;
    const k = valueKey(selected.key, m.key, side);
    setStatus(st => ({ ...st, [k]: 'saving' }));
    try {
      const sid = sessionIdRef.current ?? (await ensureSession());
      if (!sid) throw new Error('No session');
      const saved = await saveMeasurement(sid, { assessmentKey: selected.key, measureKey: m.key, side, value, value2 });
      setRecorded(r => ({ ...r, [k]: saved }));
      setStatus(st => { const n = { ...st }; delete n[k]; return n; });
    } catch {
      setStatus(st => ({ ...st, [k]: 'error' }));
    }
  }

  function commitFocused() {
    if (!selected || !focused || buffer === '') return;
    const m = selected.measures.find(x => x.key === focused.measureKey);
    if (!m) return;
    if (inputMode(m) === 'compound') {
      const [s, d] = buffer.split('/');
      const sys = Number(s), dia = Number(d);
      if (Number.isFinite(sys) && Number.isFinite(dia)) {
        save(m, focused.side, Math.min(m.max, Math.max(m.min, sys)),
          Math.min(m.max2 ?? m.max, Math.max(m.min2 ?? m.min, dia)));
      }
    } else {
      const n = Number(buffer);
      if (Number.isFinite(n)) save(m, focused.side, Math.min(m.max, Math.max(m.min, n)));
    }
  }

  function focusField(field: FieldRef) { commitFocused(); setFocused(field); setBuffer(''); }
  function advanceFrom(field: FieldRef) {
    if (!selected) { setFocused(null); setBuffer(''); return; }
    const order = fieldOrder(selected);
    const idx = order.findIndex(f => f.measureKey === field.measureKey && f.side === field.side);
    setFocused(order[idx + 1] ?? null);
    setBuffer('');
  }

  async function clear(measureKey: string, side: MeasurementSide) {
    if (!selected) return;
    const k = valueKey(selected.key, measureKey, side);
    const row = recorded[k];
    setRecorded(r => { const n = { ...r }; delete n[k]; return n; });
    setStatus(st => { const n = { ...st }; delete n[k]; return n; });
    const sid = sessionIdRef.current;
    if (row && sid) { try { await deleteMeasurement(sid, row.id); } catch { /* best-effort */ } }
  }

  // ── Keypad / preset / toggle actions ────────────────────────────────────────
  const focusedMeasure = selected && focused ? selected.measures.find(m => m.key === focused.measureKey) ?? null : null;
  const mode = focusedMeasure ? inputMode(focusedMeasure) : 'keypad';
  const allowDecimal = !!focusedMeasure && mode === 'keypad' && focusedMeasure.step % 1 !== 0;

  const pressDigit = (d: string) => setBuffer(b => (b.replace(/[^0-9]/g, '').length >= 5 ? b : b + d));
  const pressDot = () => setBuffer(b => (allowDecimal && !b.includes('.') ? (b === '' ? '0.' : b + '.') : b));
  const pressSlash = () => setBuffer(b => (mode === 'compound' && b !== '' && !b.includes('/') ? b + '/' : b));
  const pressBackspace = () => setBuffer(b => b.slice(0, -1));
  const pressNext = () => { if (!focused) return; commitFocused(); advanceFrom(focused); };
  const pressDone = () => { commitFocused(); setFocused(null); setBuffer(''); };

  const pickPreset = (value: number) => {
    if (!focusedMeasure || !focused) return;
    save(focusedMeasure, focused.side, value);
    advanceFrom(focused);
  };
  const pickToggle = (value: number) => {
    if (!focusedMeasure || !focused) return;
    save(focusedMeasure, focused.side, value);
    advanceFrom(focused);
  };

  const presetValues: number[] = [];
  if (focusedMeasure && mode === 'presets') {
    const ps = focusedMeasure.presetStep ?? 10;
    for (let v = focusedMeasure.min; v <= focusedMeasure.max + 1e-9; v += ps) presetValues.push(Math.round(v * 100) / 100);
  }

  // Sheet header context + the large live value shown in the overlay.
  const fieldList = selected ? fieldOrder(selected) : [];
  const fieldIdx = focused ? fieldList.findIndex(f => f.measureKey === focused.measureKey && f.side === focused.side) : -1;
  const focusedRow = (selected && focused) ? committedRow(focused.measureKey, focused.side) : null;
  let bigDisplay = '';
  if (focusedMeasure) {
    if (mode === 'compound') bigDisplay = buffer !== '' ? buffer : (focusedRow ? `${fmtVal(focusedRow.value)}/${focusedRow.value2 != null ? fmtVal(focusedRow.value2) : ''}` : '');
    else if (mode !== 'toggle') bigDisplay = buffer !== '' ? buffer : (focusedRow ? fmtVal(focusedRow.value) : '');
  }

  const recordedList = Object.values(recorded);
  const recordedCount = recordedList.length;
  useEffect(() => { onCountChange?.(recordedCount); }, [recordedCount, onCountChange]);

  function chipLabel(row: Measurement): string {
    const a = catalog.find(c => c.key === row.assessment_key);
    const m = a?.measures.find(x => x.key === row.measure_key);
    const md = m ? inputMode(m) : 'keypad';
    const sideTag = row.side === 'left' ? ' L' : row.side === 'right' ? ' R' : '';
    if (md === 'toggle') {
      const opt = (m?.options ?? []).find(o => o.value === row.value);
      return `${a?.displayName}${sideTag}: ${opt ? opt.label : row.value}`;
    }
    if (md === 'compound') {
      return `${a?.displayName}${sideTag}: ${fmtVal(row.value)}/${row.value2 != null ? fmtVal(row.value2) : '?'}`;
    }
    if (md === 'instrument') {
      return `${a?.displayName}: ${fmtVal(row.value)}/${a?.instrument?.maxScore ?? '?'}`;
    }
    const name = m ? `${a?.displayName} ${m.label}` : row.assessment_key;
    return `${name}${sideTag}: ${fmtVal(row.value)}${row.unit ? unitLabel(row.unit) : ''}`;
  }

  function valueField(m: CatalogMeasure, side: MeasurementSide, showSideLabel: boolean) {
    const md = inputMode(m);
    const k = valueKey(selected!.key, m.key, side);
    const isFocused = !!focused && focused.measureKey === m.key && focused.side === side;
    const row = committedRow(m.key, side);
    const st = status[k];

    let display = '';
    if (md === 'toggle') {
      const opt = row ? (m.options ?? []).find(o => o.value === row.value) : null;
      display = opt ? opt.label : '';
    } else if (md === 'compound') {
      display = isFocused && buffer !== '' ? buffer : (row ? `${fmtVal(row.value)}/${row.value2 != null ? fmtVal(row.value2) : ''}` : '');
    } else {
      display = isFocused && buffer !== '' ? buffer : (row ? fmtVal(row.value) : '');
    }
    const showUnit = md !== 'toggle' && (display !== '' || (isFocused && md !== 'compound'));

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
          {!st && row != null && <Check className="w-3.5 h-3.5 text-green-500" />}
        </span>
        {md === 'toggle' ? (
          <span className={`block text-sm font-semibold mt-0.5 leading-tight ${display ? 'text-secondary-700' : 'text-gray-300'}`}>
            {display || 'Tap to set'}
          </span>
        ) : (
          <span className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold font-mono ${display ? 'text-secondary-700' : 'text-gray-300'}`}>{display || '—'}</span>
            {showUnit && <span className="text-sm text-gray-400">{unitLabel(m.unit)}</span>}
            {isFocused && <span className="w-0.5 h-6 bg-primary-400 animate-pulse ml-0.5" />}
          </span>
        )}
      </button>
    );
  }

  // Compact tappable cell for the ROM table — opens the same centred picker.
  function romCell(m: CatalogMeasure, side: MeasurementSide) {
    const k = valueKey(selected!.key, m.key, side);
    const row = committedRow(m.key, side);
    const isFocused = !!focused && focused.measureKey === m.key && focused.side === side;
    const st = status[k];
    return (
      <button
        type="button"
        onClick={() => focusField({ measureKey: m.key, side })}
        className={`w-full h-11 rounded-lg border-2 text-base font-mono font-semibold flex items-center justify-center gap-1 transition active:scale-95 ${
          isFocused ? 'border-primary-400 bg-primary-50 text-secondary-700'
            : row != null ? 'border-gray-200 bg-white text-secondary-700'
            : 'border-dashed border-gray-200 bg-white text-gray-300'
        }`}
      >
        {row != null ? `${fmtVal(row.value)}${unitLabel(m.unit)}` : '—'}
        {st === 'saving' && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
        {st === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
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
                <button onClick={() => clear(row.measure_key, row.side)} className="p-0.5 rounded-full hover:bg-primary-100 text-primary-400" aria-label="Remove">
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Completed outcome-measure chips (both modes) */}
      {outcomes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
          {outcomes.map(o => {
            const p = proms.find(x => x.key === o.promKey);
            const label = o.subscales && o.subscales.length
              ? `${p?.shortName || o.promKey}: ${o.subscales.map(s => `${s.name.slice(0, 1)}${s.score}`).join('/')}`
              : `${p?.shortName || o.promKey}: ${o.score}${o.band ? ` (${o.band})` : ''}`;
            return (
              <span key={o.promKey} className="inline-flex items-center gap-1 text-xs bg-secondary-500/10 text-secondary-700 rounded-full px-2.5 py-1">
                <ClipboardCheck className="w-3 h-3" /> {label}
              </span>
            );
          })}
        </div>
      )}

      {readOnly && recordedCount === 0 && outcomes.length === 0 && (
        <p className="text-xs text-gray-400">No measurements were recorded for this session.</p>
      )}

      {!readOnly && (
        <>
          {/* Patient outcome measures — launch the kiosk */}
          {proms.length > 0 && (
            <div className="mb-4 shrink-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Patient Outcome Measures</p>
              <div className="grid grid-cols-2 gap-2.5">
                {proms.map(p => {
                  const done = outcomes.find(o => o.promKey === p.key);
                  return (
                    <button
                      key={p.key}
                      onClick={() => launchProm(p)}
                      className="min-h-20 rounded-2xl px-4 py-3 border-2 border-gray-200 bg-white text-secondary-700 hover:border-primary-300 transition text-left flex flex-col justify-center active:scale-[0.98]"
                    >
                      <span className="text-base font-bold leading-tight flex items-center gap-1.5">
                        {done ? <ClipboardCheck className="w-4 h-4 text-green-500 shrink-0" /> : <ClipboardList className="w-4 h-4 shrink-0 opacity-70" />}
                        {p.shortName || p.name}
                      </span>
                      <span className="text-xs font-medium opacity-70 mt-0.5">{done ? (done.subscales && done.subscales.length ? 'Completed' : `${done.score} (${done.band})`) : 'Tap to hand to patient'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assessment picker — large cards grouped by category */}
          <div className="mb-4 shrink-0 space-y-4">
            {categories.map(cat => (
              <div key={cat}>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{cat}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {byCategory.get(cat)!.map(a => (
                    <button
                      key={a.key}
                      onClick={() => {
                        if (a.instrument) { setRunnerKey(a.key); setSelectedKey(null); setFocused(null); }
                        else if (a.layout === 'table') {
                          // ROM table is the overview — show it first, tap a cell to enter.
                          setSelectedKey(a.key); setFocused(null); setBuffer('');
                        } else {
                          // Open the input sheet immediately on the first field — no
                          // scrolling down past the picker to find it.
                          setSelectedKey(a.key);
                          setBuffer('');
                          const m = a.measures[0];
                          setFocused({ measureKey: m.key, side: sidesOf(a, m)[0] });
                        }
                      }}
                      className={`min-h-20 rounded-2xl px-4 py-3 border-2 transition text-left flex flex-col justify-center active:scale-[0.98] ${
                        selectedKey === a.key ? 'bg-primary-400 border-primary-400 text-white shadow-sm' : 'bg-white border-gray-200 text-secondary-700 hover:border-primary-300'
                      }`}
                    >
                      <span className="text-base font-bold leading-tight flex items-center gap-1.5">
                        {a.instrument && <ClipboardList className="w-4 h-4 shrink-0 opacity-70" />}
                        {a.displayName}
                      </span>
                      <span className="text-xs font-medium opacity-70 mt-0.5">{a.instrument ? `${a.instrument.items.length}-item test` : a.region}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ROM table — movement × Left/Right grid */}
          {selected && selected.layout === 'table' && (
            <div className="shrink-0 rounded-xl border border-gray-200 overflow-hidden">
              {selected.measures.some(m => sidesOf(selected, m).length === 2) && (
                <div className="flex items-center bg-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  <div className="flex-1 px-3 py-2">Movement</div>
                  <div className="w-20 px-2 py-2 text-center">Left</div>
                  <div className="w-20 px-2 py-2 text-center">Right</div>
                </div>
              )}
              {selected.measures.map(m => {
                const sides = sidesOf(selected, m);
                const bilateral = sides.length === 2;
                return (
                  <div key={m.key} className="flex items-center border-t border-gray-100">
                    <div className="flex-1 px-3 py-2 text-sm font-medium text-secondary-700">{m.label}</div>
                    {bilateral ? (
                      <>
                        <div className="w-20 p-1.5">{romCell(m, 'left')}</div>
                        <div className="w-20 p-1.5">{romCell(m, 'right')}</div>
                      </>
                    ) : (
                      <div className="w-40 p-1.5">{romCell(m, 'bilateral')}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Stacked fields for non-table assessments */}
          {selected && selected.layout !== 'table' && (
            <div className="shrink-0">
              <div className="space-y-2.5">
                {selected.measures.map(m => {
                  const sides = sidesOf(selected, m);
                  const bilateral = sides.length === 2;
                  return (
                    <div key={m.key}>
                      {bilateral && <p className="text-xs font-semibold text-secondary-700 mb-1">{m.label}</p>}
                      <div className="flex gap-2">
                        {sides.map(side => (
                          <div key={side} className="flex-1 flex">{valueField(m, side, bilateral)}</div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!selected && <p className="text-xs text-gray-400 shrink-0">Pick an assessment to record values.</p>}

          {/* Patient-facing PROM kiosk */}
          {kioskProm && (
            <PromKiosk
              prom={kioskProm}
              sessionId={sessionId}
              ensureSession={ensureSession}
              onComplete={(r) => setOutcomes(prev => [...prev.filter(o => o.promKey !== r.promKey), r])}
              onExit={() => setKioskProm(null)}
            />
          )}

          {/* First-use PIN setup before handing the iPad to a patient */}
          {pendingProm && createPortal(
            <div className="fixed inset-0 z-[80] bg-secondary-900/50 flex items-center justify-center px-6" onClick={() => setPendingProm(null)}>
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-bold text-secondary-700 mb-1">Set a clinician PIN</h3>
                <p className="text-xs text-gray-500 mb-4">Before handing the device to a patient, set a 4–6 digit PIN. You'll use it to exit the kiosk.</p>
                <input
                  value={pinValue}
                  onChange={e => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder="••••"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:border-primary-400"
                />
                {pinError && <p className="text-xs text-red-500 mt-2">{pinError}</p>}
                <button onClick={createPinAndLaunch} disabled={pinValue.length < 4} className="mt-4 w-full bg-primary-400 disabled:opacity-40 text-white py-3 rounded-xl font-semibold transition">Set PIN &amp; start</button>
              </div>
            </div>,
            document.body,
          )}

          {/* Guided runner for multi-item instruments (Berg, Mini-BEST) */}
          {runnerKey && (() => {
            const a = catalog.find(c => c.key === runnerKey);
            if (!a || !a.instrument) return null;
            const mKey = a.measures[0].key;
            const existing = recorded[valueKey(a.key, mKey, 'bilateral')];
            return (
              <InstrumentRunner
                assessment={a}
                sessionId={sessionId}
                ensureSession={ensureSession}
                initialDetail={existing?.detail ?? null}
                onClose={() => setRunnerKey(null)}
                onSaved={(m) => setRecorded(r => ({ ...r, [valueKey(m.assessment_key, m.measure_key, m.side)]: m }))}
              />
            );
          })()}

          {/* Input picker — centred modal (shared by ROM cells and every other
              measure). "Next" cycles the fields/cells. */}
          {focused && focusedMeasure && selected && createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-secondary-900/40" onClick={pressDone} />
              <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl px-4 pt-4 pb-5 max-h-[85vh] overflow-y-auto">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-secondary-700 leading-tight">{selected.displayName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {focusedMeasure.label}
                      {sidesOf(selected, focusedMeasure).length === 2 && ` · ${focused.side === 'left' ? 'Left' : 'Right'}`}
                      {fieldList.length > 1 && ` · ${fieldIdx + 1} of ${fieldList.length}`}
                    </p>
                  </div>
                  <button onClick={pressDone} className="p-2 -mr-1 -mt-1 text-gray-400 hover:text-secondary-700 rounded-lg" aria-label="Done">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {mode !== 'toggle' && (
                  <div className="text-center mb-1">
                    <span className="text-4xl font-bold font-mono text-secondary-700">{bigDisplay || '—'}</span>
                    <span className="text-lg text-gray-400 ml-1.5">{unitLabel(focusedMeasure.unit)}</span>
                  </div>
                )}
                <p className="text-[11px] text-gray-400 text-center mb-3">
                  {mode === 'presets' ? 'Tap a value'
                    : mode === 'toggle' ? 'Tap a result'
                    : mode === 'compound' ? 'Type systolic · / · diastolic'
                    : `Range ${focusedMeasure.min}–${focusedMeasure.max}${unitLabel(focusedMeasure.unit)}`}
                </p>

                {mode === 'toggle' ? (
                  <div className="grid grid-cols-1 gap-2.5">
                    {(focusedMeasure.options ?? []).map(opt => {
                      const isCur = committedRow(focusedMeasure.key, focused.side)?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => pickToggle(opt.value)}
                          className={`min-h-14 rounded-xl text-base font-semibold border-2 px-4 transition active:scale-[0.98] ${
                            isCur ? 'bg-primary-400 border-primary-400 text-white' : 'bg-white border-gray-200 text-secondary-700 hover:border-primary-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : mode === 'presets' ? (
                  <div className="grid grid-cols-5 gap-2">
                    {presetValues.map(v => {
                      const isCur = committedRow(focused.measureKey, focused.side)?.value === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => pickPreset(v)}
                          className={`h-14 rounded-xl text-lg font-semibold border-2 transition active:scale-95 ${
                            isCur ? 'bg-primary-400 border-primary-400 text-white' : 'bg-white border-gray-200 text-secondary-700 hover:border-primary-300'
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                    <button type="button" onClick={pressDone} className="h-14 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition active:scale-95 col-span-2">Done</button>
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
                    {mode === 'compound'
                      ? keypadKey('/', pressSlash)
                      : keypadKey(allowDecimal ? '.' : '', allowDecimal ? pressDot : () => {}, allowDecimal ? '' : 'invisible')}
                    {keypadKey('0', () => pressDigit('0'))}
                    {keypadKey('Done', pressDone, 'bg-primary-400 text-white hover:bg-primary-500 text-base')}
                  </div>
                )}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
