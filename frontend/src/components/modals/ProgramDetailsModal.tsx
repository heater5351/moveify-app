import { useState, useEffect } from 'react';
import { X, Check, ChevronLeft, ChevronRight, Pause } from 'lucide-react';
import type { AssignedProgram, BlockStatusResponse, BlockWeekRow } from '../../types/index.ts';
import { API_URL } from '../../config';
import { getAuthHeaders } from '../../utils/api';

interface ProgramDetailsModalProps {
  program: AssignedProgram;
  patientName: string;
  onClose: () => void;
}

export const ProgramDetailsModal = ({ program, patientName, onClose }: ProgramDetailsModalProps) => {
  const completedCount = program.exercises.filter(e => e.completed).length;
  const totalExercises = program.exercises.length;
  const completionPercentage = Math.round((completedCount / totalExercises) * 100);

  const [blockData, setBlockData] = useState<BlockStatusResponse | null>(null);
  const [overrideLoading, setOverrideLoading] = useState(false);

  const fetchBlockData = async () => {
    const pid = program.config.id;
    if (!pid) return;
    try {
      const res = await fetch(`${API_URL}/blocks/${pid}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      const weeks: BlockWeekRow[] = (data.weeks || []).map((w: Record<string, unknown>) => ({
        programExerciseId: w.program_exercise_id ?? w.programExerciseId,
        exerciseName: w.exercise_name ?? w.exerciseName,
        weekNumber: w.week_number ?? w.weekNumber,
        sets: w.sets,
        reps: w.reps,
        rpeTarget: w.rpe_target ?? w.rpeTarget ?? null,
        weight: w.weight ?? null,
        notes: w.notes ?? null,
      }));
      setBlockData({
        hasBlock: data.has_block ?? data.hasBlock ?? false,
        id: data.id,
        programId: data.program_id ?? data.programId,
        blockDuration: data.block_duration ?? data.blockDuration,
        startDate: data.start_date ?? data.startDate,
        currentWeek: data.current_week ?? data.currentWeek,
        status: data.status,
        weeks,
      });
    } catch {
      // Silent — block section won't render
    }
  };

  useEffect(() => {
    fetchBlockData();
  }, [program.config.id]);

  const handleOverride = async (action: 'regress' | 'hold' | 'advance') => {
    const pid = program.config.id;
    if (!pid) return;
    setOverrideLoading(true);
    try {
      await fetch(`${API_URL}/blocks/${pid}/override`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action }),
      });
      await fetchBlockData();
    } catch {
      // Silent
    } finally {
      setOverrideLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold font-display text-slate-800">{program.config.name}</h3>
            <p className="text-sm text-slate-500 mt-1">
              {patientName} · {completedCount} of {totalExercises} exercises completed ({completionPercentage}%)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-primary-400 h-2 rounded-full transition-all"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Program Details */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Start Date</p>
              <p className="font-medium text-slate-800">{program.config.startDate}</p>
            </div>
            <div>
              <p className="text-slate-400">Duration</p>
              <p className="font-medium text-slate-800">{program.config.duration}</p>
            </div>
            <div>
              <p className="text-slate-400">Frequency</p>
              <p className="font-medium text-slate-800">
                {program.config.frequency.length > 0
                  ? program.config.frequency.join(', ')
                  : 'As needed'}
              </p>
            </div>
          </div>
        </div>

        {/* Block Periodization Section */}
        {blockData?.hasBlock && (
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-slate-800 text-sm">Block Periodization</h4>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  blockData.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : blockData.status === 'paused'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {blockData.status && blockData.status.charAt(0).toUpperCase() + blockData.status.slice(1)}
                </span>
              </div>
              <span className="text-sm font-medium text-slate-600">
                Week {blockData.currentWeek} / {blockData.blockDuration}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
              <div
                className="bg-primary-400 h-2 rounded-full transition-all"
                style={{ width: `${((blockData.currentWeek || 1) / (blockData.blockDuration || 1)) * 100}%` }}
              />
            </div>

            {/* Override buttons */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => handleOverride('regress')}
                disabled={overrideLoading || blockData.currentWeek === 1}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-red-200 text-red-600 hover:bg-red-50"
              >
                <ChevronLeft size={14} />
                Regress Week
              </button>
              <button
                onClick={() => handleOverride('hold')}
                disabled={overrideLoading}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-amber-200 text-amber-600 hover:bg-amber-50"
              >
                <Pause size={14} />
                Hold Week
              </button>
              <button
                onClick={() => handleOverride('advance')}
                disabled={overrideLoading || blockData.currentWeek === blockData.blockDuration}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-emerald-200 text-emerald-600 hover:bg-emerald-50"
              >
                Advance Week
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Week-by-week grid */}
            {blockData.weeks && blockData.weeks.length > 0 && (() => {
              const uniqueExercises = [...new Map(
                blockData.weeks!.map(w => [w.programExerciseId, w.exerciseName])
              )];
              const weekCount = blockData.blockDuration || 1;
              const weeksByExercise = new Map<number, Map<number, BlockWeekRow>>();
              for (const w of blockData.weeks!) {
                if (!weeksByExercise.has(w.programExerciseId)) {
                  weeksByExercise.set(w.programExerciseId, new Map());
                }
                weeksByExercise.get(w.programExerciseId)!.set(w.weekNumber, w);
              }

              return (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-2 font-semibold text-slate-600 min-w-[140px]">Exercise</th>
                        {Array.from({ length: weekCount }, (_, i) => (
                          <th
                            key={i + 1}
                            className={`text-center py-2 px-2 font-semibold min-w-[60px] ${
                              i + 1 === blockData.currentWeek
                                ? 'bg-primary-50 text-primary-600'
                                : 'text-slate-500'
                            }`}
                          >
                            Wk {i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueExercises.map(([exId, exName]) => (
                        <tr key={exId} className="border-b border-slate-100">
                          <td className="py-2 px-2 font-medium text-slate-700 truncate max-w-[140px]">{exName}</td>
                          {Array.from({ length: weekCount }, (_, i) => {
                            const week = weeksByExercise.get(exId)?.get(i + 1);
                            const isCurrent = i + 1 === blockData.currentWeek;
                            return (
                              <td
                                key={i + 1}
                                className={`text-center py-2 px-2 ${
                                  isCurrent ? 'bg-primary-50 font-bold text-primary-700' : 'text-slate-600'
                                }`}
                              >
                                {week ? `${week.sets}×${week.reps}` : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto p-6">
          <h4 className="font-semibold text-slate-800 mb-4">Exercises</h4>
          <div className="space-y-3">
            {program.exercises.map((exercise, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg ${
                  exercise.completed
                    ? 'bg-emerald-50 ring-1 ring-emerald-200'
                    : 'bg-slate-50 ring-1 ring-slate-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h5 className="font-semibold text-slate-800">{exercise.name}</h5>
                      {exercise.completed && (
                        <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
                          <Check size={14} />
                          Completed
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mb-2">
                      <strong>{exercise.sets} sets × {exercise.reps} reps</strong>
                      {exercise.holdTime && ` · Hold ${exercise.holdTime}`}
                    </p>
                    {exercise.instructions && (
                      <p className="text-sm text-slate-500 italic">{exercise.instructions}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full bg-primary-400 text-white py-3 rounded-lg hover:bg-primary-500 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
