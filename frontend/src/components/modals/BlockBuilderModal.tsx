import { useState, useEffect } from 'react';
import { X, ChevronDown, Save, Settings } from 'lucide-react';
import type { ProgramExercise, PeriodizationTemplate, ExerciseWeekPrescription } from '../../types/index.ts';
import { TemplateManagerModal } from './TemplateManagerModal';
import { API_URL } from '../../config';

interface BlockBuilderModalProps {
  programExercises: ProgramExercise[];
  clinicianId: number;
  onClose: () => void;
  onSave: (blockDuration: number, exerciseWeeks: ExerciseWeekPrescription[], saveAsTemplate?: { name: string; description: string }) => void;
  // Pre-existing block data for editing
  initialDuration?: 4 | 6 | 8;
  initialWeeks?: ExerciseWeekPrescription[];
}

type CellKey = `${number}-${number}`; // exerciseIdx-weekNum

interface CellData {
  sets: string;
  reps: string;
  rpe: string;
}

export const BlockBuilderModal = ({
  programExercises,
  clinicianId,
  onClose,
  onSave,
  initialDuration = 4,
  initialWeeks = []
}: BlockBuilderModalProps) => {
  const [blockDuration, setBlockDuration] = useState<4 | 6 | 8>(initialDuration);
  const [cells, setCells] = useState<Record<CellKey, CellData>>({});
  const [templates, setTemplates] = useState<PeriodizationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Initialize cells from initialWeeks or defaults
  useEffect(() => {
    const initial: Record<CellKey, CellData> = {};
    if (initialWeeks.length > 0) {
      // Map programExerciseId to index
      const idToIdx: Record<number, number> = {};
      programExercises.forEach((ex, i) => { if (ex.id) idToIdx[ex.id] = i; });
      initialWeeks.forEach(w => {
        const idx = idToIdx[w.programExerciseId];
        if (idx !== undefined) {
          const key: CellKey = `${idx}-${w.weekNumber}`;
          initial[key] = {
            sets: String(w.sets),
            reps: String(w.reps),
            rpe: w.rpeTarget ? String(w.rpeTarget) : ''
          };
        }
      });
    } else {
      // Pre-fill with exercise baseline sets/reps
      programExercises.forEach((ex, idx) => {
        for (let week = 1; week <= blockDuration; week++) {
          const key: CellKey = `${idx}-${week}`;
          initial[key] = { sets: String(ex.sets || 3), reps: String(ex.reps || 10), rpe: '' };
        }
      });
    }
    setCells(initial);
  }, []);

  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch(`${API_URL}/blocks/templates?clinicianId=${clinicianId}`);
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch {
        // Templates are optional
      }
    };
    fetchTemplates();
  }, [clinicianId]);

  const getCell = (exIdx: number, week: number): CellData => {
    const key: CellKey = `${exIdx}-${week}`;
    return cells[key] || { sets: '', reps: '', rpe: '' };
  };

  const setCell = (exIdx: number, week: number, field: keyof CellData, value: string) => {
    const key: CellKey = `${exIdx}-${week}`;
    setCells(prev => ({
      ...prev,
      [key]: { ...getCell(exIdx, week), [field]: value }
    }));
  };

  const handleDurationChange = (d: 4 | 6 | 8) => {
    setBlockDuration(d);
    // Fill new weeks with defaults for existing exercises
    if (d > blockDuration) {
      const additions: Record<CellKey, CellData> = {};
      programExercises.forEach((ex, idx) => {
        for (let week = blockDuration + 1; week <= d; week++) {
          const key: CellKey = `${idx}-${week}`;
          if (!cells[key]) {
            additions[key] = { sets: String(ex.sets || 3), reps: String(ex.reps || 10), rpe: '' };
          }
        }
      });
      setCells(prev => ({ ...prev, ...additions }));
    }
  };

  const applyTemplate = async () => {
    if (!selectedTemplateId) return;
    try {
      const res = await fetch(`${API_URL}/blocks/templates/${selectedTemplateId}`);
      if (!res.ok) return;
      const template = await res.json();

      if (!template.weeks || template.weeks.length === 0) return;

      // Set duration to match template
      setBlockDuration(template.block_duration as 4 | 6 | 8);

      // Group weeks by exercise_slot
      const slotMap: Record<number, typeof template.weeks> = {};
      template.weeks.forEach((w: { exercise_slot: number; week_number: number; sets: number; reps: number; rpe_target?: number }) => {
        if (!slotMap[w.exercise_slot]) slotMap[w.exercise_slot] = [];
        slotMap[w.exercise_slot].push(w);
      });

      const slots = Object.keys(slotMap).map(Number).sort((a, b) => a - b);
      const newCells: Record<CellKey, CellData> = {};

      slots.forEach((slot, idx) => {
        if (idx >= programExercises.length) return;
        slotMap[slot].forEach((w: { week_number: number; sets: number; reps: number; rpe_target?: number }) => {
          const key: CellKey = `${idx}-${w.week_number}`;
          newCells[key] = {
            sets: String(w.sets),
            reps: String(w.reps),
            rpe: w.rpe_target ? String(w.rpe_target) : ''
          };
        });
      });

      setCells(newCells);
    } catch {
      // Silently ignore template load errors
    }
  };

  const buildExerciseWeeks = (): ExerciseWeekPrescription[] => {
    const weeks: ExerciseWeekPrescription[] = [];
    programExercises.forEach((ex, idx) => {
      for (let week = 1; week <= blockDuration; week++) {
        const cell = getCell(idx, week);
        const sets = parseInt(cell.sets) || ex.sets || 3;
        const reps = parseInt(cell.reps) || ex.reps || 10;
        const rpe = parseInt(cell.rpe) || undefined;
        weeks.push({
          programExerciseId: idx,
          weekNumber: week,
          sets,
          reps,
          rpeTarget: rpe ?? null
        });
      }
    });
    return weeks;
  };

  const handleSave = () => {
    const exerciseWeeks = buildExerciseWeeks();
    const saveTemplate = showSaveTemplate && templateName.trim()
      ? { name: templateName.trim(), description: templateDescription.trim() }
      : undefined;
    onSave(blockDuration, exerciseWeeks, saveTemplate);
  };

  const weeks = Array.from({ length: blockDuration }, (_, i) => i + 1);

  return (
    <>
    {showTemplateManager && (
      <TemplateManagerModal
        clinicianId={clinicianId}
        onClose={() => {
          setShowTemplateManager(false);
          // Refresh templates after managing
          fetch(`${API_URL}/blocks/templates?clinicianId=${clinicianId}`)
            .then(r => r.ok ? r.json() : { templates: [] })
            .then(d => setTemplates(d.templates || []))
            .catch(() => {});
        }}
      />
    )}
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-secondary-500">Configure Periodization Block</h2>
            <p className="text-xs text-slate-500 mt-0.5">Define sets, reps, and RPE target for each week</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap gap-4 items-end">
          {/* Duration picker */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Block Duration</label>
            <div className="flex gap-2">
              {([4, 6, 8] as const).map(d => (
                <button
                  key={d}
                  onClick={() => handleDurationChange(d)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    blockDuration === d
                      ? 'bg-primary-400 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {d} Weeks
                </button>
              ))}
            </div>
          </div>

          {/* Template picker */}
          <div className="flex gap-2 items-end">
            {templates.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Apply Template</label>
                <div className="relative">
                  <select
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value ? Number(e.target.value) : '')}
                    className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 bg-white"
                  >
                    <option value="">-- Select template --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.blockDuration}w){t.isGlobal ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}
            {templates.length > 0 && (
              <button
                onClick={applyTemplate}
                disabled={!selectedTemplateId}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            )}
            <button
              onClick={() => setShowTemplateManager(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
              title="Manage saved templates"
            >
              <Settings size={14} />
              {templates.length === 0 ? 'Templates' : 'Manage'}
            </button>
          </div>
        </div>

        {/* Spreadsheet Grid */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-4 font-medium text-slate-500 text-xs w-40 sticky left-0 bg-white">
                    Exercise
                  </th>
                  {weeks.map(w => (
                    <th key={w} className="text-center pb-2 px-1 font-semibold text-slate-600 text-xs min-w-[100px]">
                      Week {w}
                      <div className="text-[10px] font-normal text-slate-400 mt-0.5">Sets × Reps (RPE)</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {programExercises.map((exercise, exIdx) => (
                  <tr key={exIdx} className={exIdx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                    <td className="py-2 pr-3 sticky left-0 bg-inherit">
                      <div className="text-xs font-medium text-slate-700 truncate max-w-[144px]" title={exercise.name}>
                        {exercise.name}
                      </div>
                      <div className="text-[10px] text-slate-400">{exercise.category}</div>
                    </td>
                    {weeks.map(week => {
                      const cell = getCell(exIdx, week);
                      return (
                        <td key={week} className="py-1.5 px-1">
                          <div className="flex gap-1 items-center">
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={cell.sets}
                              onChange={e => setCell(exIdx, week, 'sets', e.target.value)}
                              placeholder="S"
                              className="w-10 px-1.5 py-1 border border-slate-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
                              title="Sets"
                            />
                            <span className="text-slate-300 text-xs">×</span>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={cell.reps}
                              onChange={e => setCell(exIdx, week, 'reps', e.target.value)}
                              placeholder="R"
                              className="w-10 px-1.5 py-1 border border-slate-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
                              title="Reps"
                            />
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={cell.rpe}
                              onChange={e => setCell(exIdx, week, 'rpe', e.target.value)}
                              placeholder="RPE"
                              className="w-12 px-1.5 py-1 border border-slate-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 text-amber-700"
                              title="RPE Target (1-10)"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Save as Template */}
        <div className="px-6 py-3 border-t border-slate-100">
          <button
            onClick={() => setShowSaveTemplate(!showSaveTemplate)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
          >
            <Save size={13} />
            {showSaveTemplate ? 'Cancel save as template' : 'Save as template for future use'}
          </button>
          {showSaveTemplate && (
            <div className="mt-3 flex gap-3">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name (required)"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400"
              />
              <input
                type="text"
                value={templateDescription}
                onChange={e => setTemplateDescription(e.target.value)}
                placeholder="Description (optional)"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center">
          <p className="text-xs text-slate-400">
            {programExercises.length} exercise{programExercises.length !== 1 ? 's' : ''} × {blockDuration} weeks = {programExercises.length * blockDuration} cells
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-primary-400 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Save Block
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
