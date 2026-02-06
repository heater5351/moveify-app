import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { ProgramExercise, ProgramConfig, CompletionData } from '../../types/index.ts';

interface ExerciseCompletionModalProps {
  exercise: ProgramExercise;
  patientId: number;
  programConfig: ProgramConfig;
  existingCompletion?: CompletionData | null;
  onComplete: (data: CompletionData) => void;
  onCancel: () => void;
}

export const ExerciseCompletionModal = ({
  exercise,
  programConfig,
  existingCompletion,
  onComplete,
  onCancel
}: ExerciseCompletionModalProps) => {
  // Initialize with existing data or prescribed values
  const [setsPerformed, setSetsPerformed] = useState<number>(
    existingCompletion?.setsPerformed || exercise.sets
  );
  const [repsPerformed, setRepsPerformed] = useState<number>(
    existingCompletion?.repsPerformed || exercise.reps
  );
  const [weightPerformed, setWeightPerformed] = useState<number>(
    existingCompletion?.weightPerformed ?? exercise.prescribedWeight ?? 0
  );
  const [weightInputValue, setWeightInputValue] = useState<string>(
    String(existingCompletion?.weightPerformed ?? exercise.prescribedWeight ?? '')
  );
  const [rpeRating, setRpeRating] = useState<number | undefined>(
    existingCompletion?.rpeRating
  );
  const [painLevel, setPainLevel] = useState<number | undefined>(
    existingCompletion?.painLevel
  );
  const [notes, setNotes] = useState<string>(existingCompletion?.notes || '');

  const handleQuickComplete = () => {
    // "Completed as Prescribed" - use prescribed values
    onComplete({
      setsPerformed: exercise.sets,
      repsPerformed: exercise.reps,
      weightPerformed: exercise.prescribedWeight || 0,
      rpeRating,
      painLevel,
      notes: notes || undefined
    });
  };

  const handleSaveCompletion = () => {
    onComplete({
      setsPerformed,
      repsPerformed,
      weightPerformed,
      rpeRating,
      painLevel,
      notes: notes || undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100">
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
            Prescribed: <span className="font-bold text-moveify-teal">
              {exercise.sets} sets × {exercise.reps} reps
              {(exercise.prescribedWeight || 0) > 0 && ` @ ${exercise.prescribedWeight} kg`}
            </span>
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
            {/* Sets Performed */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Sets Performed
              </label>
              <input
                type="number"
                min="0"
                value={setsPerformed}
                onChange={(e) => setSetsPerformed(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all font-medium text-lg"
              />
            </div>

            {/* Reps Performed */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Reps Performed
              </label>
              <input
                type="number"
                min="0"
                value={repsPerformed}
                onChange={(e) => setRepsPerformed(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all font-medium text-lg"
              />
            </div>

            {/* Weight Performed */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Weight Used (kg)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={weightInputValue}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty string, numbers, and decimal point
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setWeightInputValue(value);
                    // Update the actual weight value
                    const numValue = parseFloat(value);
                    setWeightPerformed(isNaN(numValue) ? 0 : numValue);
                  }
                }}
                onBlur={() => {
                  // Format on blur to ensure valid number
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
