import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import type { ProgramExercise, ProgramConfig, CompletionData } from '../../types/index.ts';
import { formatDuration, getExerciseType } from '../../utils/duration.ts';
import { toLocalDateString } from '../../utils/date.ts';

interface ExerciseCompletionModalProps {
  exercise: ProgramExercise;
  patientId: number;
  programConfig: ProgramConfig;
  existingCompletion?: CompletionData | null;
  selectedDate?: Date;
  onComplete: (data: CompletionData) => void;
  onCancel: () => void;
}

export const ExerciseCompletionModal = ({
  exercise,
  programConfig,
  existingCompletion,
  selectedDate,
  onComplete,
  onCancel
}: ExerciseCompletionModalProps) => {
  const exerciseType = getExerciseType(exercise);

  // Initialize with existing data or prescribed values
  const [setsPerformed, setSetsPerformed] = useState<number>(
    existingCompletion?.setsPerformed || exercise.sets
  );
  const [setsInputValue, setSetsInputValue] = useState<string>(
    String(existingCompletion?.setsPerformed || exercise.sets)
  );
  const [repsPerformed, setRepsPerformed] = useState<number>(
    existingCompletion?.repsPerformed || exercise.reps
  );
  const [repsInputValue, setRepsInputValue] = useState<string>(
    String(existingCompletion?.repsPerformed || exercise.reps)
  );
  const [weightPerformed, setWeightPerformed] = useState<number>(
    existingCompletion?.weightPerformed ?? exercise.prescribedWeight ?? 0
  );
  const [weightInputValue, setWeightInputValue] = useState<string>(
    String(existingCompletion?.weightPerformed ?? exercise.prescribedWeight ?? '')
  );
  const [durationPerformed, setDurationPerformed] = useState<number>(
    existingCompletion?.durationPerformed ?? exercise.prescribedDuration ?? 0
  );
  const [durationInputValue, setDurationInputValue] = useState<string>(() => {
    const val = existingCompletion?.durationPerformed ?? exercise.prescribedDuration ?? 0;
    if (exerciseType === 'cardio') return val ? String(Math.round(val / 60)) : '';
    return val ? String(val) : '';
  });
  const [rpeRating, setRpeRating] = useState<number | undefined>(
    existingCompletion?.rpeRating
  );
  const [painLevel, setPainLevel] = useState<number | undefined>(
    existingCompletion?.painLevel
  );
  const [notes, setNotes] = useState<string>(existingCompletion?.notes || '');

  // Keep input values in sync when exercise or completion data changes
  useEffect(() => {
    setSetsInputValue(String(existingCompletion?.setsPerformed || exercise.sets));
    setSetsPerformed(existingCompletion?.setsPerformed || exercise.sets);
  }, [exercise.sets, existingCompletion?.setsPerformed]);

  useEffect(() => {
    setRepsInputValue(String(existingCompletion?.repsPerformed || exercise.reps));
    setRepsPerformed(existingCompletion?.repsPerformed || exercise.reps);
  }, [exercise.reps, existingCompletion?.repsPerformed]);

  useEffect(() => {
    const weight = existingCompletion?.weightPerformed ?? exercise.prescribedWeight ?? 0;
    setWeightInputValue(String(weight || ''));
    setWeightPerformed(weight);
  }, [exercise.prescribedWeight, existingCompletion?.weightPerformed]);

  useEffect(() => {
    const dur = existingCompletion?.durationPerformed ?? exercise.prescribedDuration ?? 0;
    setDurationPerformed(dur);
    if (exerciseType === 'cardio') {
      setDurationInputValue(dur ? String(Math.round(dur / 60)) : '');
    } else {
      setDurationInputValue(dur ? String(dur) : '');
    }
  }, [exercise.prescribedDuration, existingCompletion?.durationPerformed, exerciseType]);

  const prescribedLabel = (() => {
    if (exerciseType === 'cardio') {
      return exercise.prescribedDuration ? formatDuration(exercise.prescribedDuration) : 'As prescribed';
    }
    if (exerciseType === 'duration') {
      const dur = exercise.prescribedDuration ? formatDuration(exercise.prescribedDuration) : '—';
      return `${exercise.sets} sets × ${dur}`;
    }
    // reps
    let label = `${exercise.sets} sets × ${exercise.reps} reps`;
    if ((exercise.prescribedWeight || 0) > 0) label += ` @ ${exercise.prescribedWeight} kg`;
    return label;
  })();

  const handleQuickComplete = () => {
    const data: CompletionData = {
      setsPerformed: exercise.sets,
      repsPerformed: exercise.reps,
      weightPerformed: exercise.prescribedWeight || 0,
      rpeRating,
      painLevel,
      notes: notes || undefined,
      completionDate: selectedDate ? toLocalDateString(selectedDate) : undefined
    };
    if (exerciseType !== 'reps') {
      data.durationPerformed = exercise.prescribedDuration || 0;
    }
    onComplete(data);
  };

  const handleSaveCompletion = () => {
    const data: CompletionData = {
      setsPerformed,
      repsPerformed,
      weightPerformed,
      rpeRating,
      painLevel,
      notes: notes || undefined,
      completionDate: selectedDate ? toLocalDateString(selectedDate) : undefined
    };
    if (exerciseType !== 'reps') {
      data.durationPerformed = durationPerformed;
    }
    onComplete(data);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-bold text-gray-900">Mark Exercise Complete</h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-700 transition-colors hover:bg-white rounded-lg p-1"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-base font-semibold text-gray-700">{exercise.name}</p>
          <p className="text-sm text-gray-600 mt-2 bg-white px-3 py-2 rounded-lg inline-block">
            Prescribed: <span className="font-bold text-moveify-teal">{prescribedLabel}</span>
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Quick Complete Button */}
          <button
            onClick={handleQuickComplete}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-5 rounded-xl hover:from-green-700 hover:to-green-800 font-bold flex items-center justify-center gap-3 text-lg shadow-lg hover:shadow-xl transition-all"
          >
            <Check size={26} />
            Completed as Prescribed
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500 font-medium">Or enter details</span>
            </div>
          </div>

          {/* Performance Details */}
          <div className="space-y-4">
            {/* Sets Performed — not for cardio */}
            {exerciseType !== 'cardio' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Sets Performed
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={setsInputValue}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*$/.test(value)) {
                      setSetsInputValue(value);
                      const numValue = parseInt(value);
                      setSetsPerformed(isNaN(numValue) ? 0 : numValue);
                    }
                  }}
                  onBlur={() => {
                    const numValue = parseInt(setsInputValue);
                    if (isNaN(numValue) || setsInputValue === '') {
                      setSetsInputValue('0');
                      setSetsPerformed(0);
                    } else {
                      setSetsInputValue(String(numValue));
                      setSetsPerformed(numValue);
                    }
                  }}
                  placeholder={String(exercise.sets)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all font-medium text-lg"
                />
              </div>
            )}

            {/* Reps Performed — only for reps type */}
            {exerciseType === 'reps' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Reps Performed
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={repsInputValue}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*$/.test(value)) {
                      setRepsInputValue(value);
                      const numValue = parseInt(value);
                      setRepsPerformed(isNaN(numValue) ? 0 : numValue);
                    }
                  }}
                  onBlur={() => {
                    const numValue = parseInt(repsInputValue);
                    if (isNaN(numValue) || repsInputValue === '') {
                      setRepsInputValue('0');
                      setRepsPerformed(0);
                    } else {
                      setRepsInputValue(String(numValue));
                      setRepsPerformed(numValue);
                    }
                  }}
                  placeholder={String(exercise.reps)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all font-medium text-lg"
                />
              </div>
            )}

            {/* Duration Performed — for duration and cardio types */}
            {exerciseType !== 'reps' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Duration ({exerciseType === 'cardio' ? 'minutes' : 'seconds'})
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={durationInputValue}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*$/.test(value)) {
                      setDurationInputValue(value);
                      const numValue = parseInt(value);
                      const seconds = exerciseType === 'cardio' ? (isNaN(numValue) ? 0 : numValue * 60) : (isNaN(numValue) ? 0 : numValue);
                      setDurationPerformed(seconds);
                    }
                  }}
                  onBlur={() => {
                    const numValue = parseInt(durationInputValue);
                    if (isNaN(numValue) || durationInputValue === '') {
                      setDurationInputValue('0');
                      setDurationPerformed(0);
                    } else {
                      setDurationInputValue(String(numValue));
                    }
                  }}
                  placeholder={exercise.prescribedDuration
                    ? String(exerciseType === 'cardio' ? Math.round(exercise.prescribedDuration / 60) : exercise.prescribedDuration)
                    : '0'
                  }
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all font-medium text-lg"
                />
                {exercise.prescribedDuration && exercise.prescribedDuration > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Prescribed: {formatDuration(exercise.prescribedDuration)}
                  </p>
                )}
              </div>
            )}

            {/* Weight Performed — only for reps type */}
            {exerciseType === 'reps' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Weight Used (kg)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={weightInputValue}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setWeightInputValue(value);
                      const numValue = parseFloat(value);
                      setWeightPerformed(isNaN(numValue) ? 0 : numValue);
                    }
                  }}
                  onBlur={() => {
                    const numValue = parseFloat(weightInputValue);
                    if (isNaN(numValue) || weightInputValue === '') {
                      setWeightInputValue('0');
                      setWeightPerformed(0);
                    } else {
                      setWeightInputValue(String(numValue));
                      setWeightPerformed(numValue);
                    }
                  }}
                  placeholder={exercise.prescribedWeight ? String(exercise.prescribedWeight) : '0'}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all font-medium text-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {exercise.prescribedWeight && exercise.prescribedWeight > 0
                    ? `Prescribed: ${exercise.prescribedWeight} kg (Enter 0 for bodyweight)`
                    : 'Enter 0 for bodyweight exercises'}
                </p>
                {(exercise.prescribedWeight || 0) > 0 && weightPerformed !== (exercise.prescribedWeight || 0) && (
                  <p className={`text-xs mt-1 font-medium ${weightPerformed > (exercise.prescribedWeight || 0) ? 'text-green-600' : 'text-orange-600'}`}>
                    {weightPerformed > (exercise.prescribedWeight || 0)
                      ? `+${(weightPerformed - (exercise.prescribedWeight || 0)).toFixed(1)} kg above prescribed`
                      : `${((exercise.prescribedWeight || 0) - weightPerformed).toFixed(1)} kg below prescribed`}
                  </p>
                )}
              </div>
            )}

            {/* RPE Rating (if enabled) */}
            {programConfig.trackRpe && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Rate of Perceived Exertion (RPE)
                  </label>
                  <span className="text-2xl font-bold text-moveify-teal">
                    {rpeRating || '-'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">Slide: 1 = Very Easy, 10 = Maximum Effort</p>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={rpeRating || 5}
                  onChange={(e) => setRpeRating(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-moveify-teal"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>
            )}

            {/* Pain Level (if enabled) */}
            {programConfig.trackPainLevel && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Pain Level
                  </label>
                  <span className={`text-2xl font-bold ${
                    painLevel === undefined ? 'text-gray-400' :
                    painLevel === 0 ? 'text-green-600' :
                    painLevel <= 3 ? 'text-yellow-600' :
                    painLevel <= 6 ? 'text-orange-600' :
                    'text-red-600'
                  }`}>
                    {painLevel !== undefined ? painLevel : '-'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">Slide: 0 = No Pain, 10 = Worst Pain</p>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={painLevel !== undefined ? painLevel : 0}
                  onChange={(e) => setPainLevel(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional notes about this exercise..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t-2 border-gray-200 flex gap-4 bg-gray-50">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-4 border-2 border-gray-300 rounded-xl hover:bg-white font-semibold text-gray-700 transition-all shadow-sm hover:shadow-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveCompletion}
            className="flex-1 px-6 py-4 bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white rounded-xl hover:from-moveify-teal-dark hover:to-moveify-ocean font-semibold transition-all shadow-md hover:shadow-lg"
          >
            Save Completion
          </button>
        </div>
      </div>
    </div>
  );
};
