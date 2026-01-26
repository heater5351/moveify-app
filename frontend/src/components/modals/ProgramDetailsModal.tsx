import { X, Check } from 'lucide-react';
import type { AssignedProgram } from '../../types/index.ts';

interface ProgramDetailsModalProps {
  program: AssignedProgram;
  patientName: string;
  onClose: () => void;
}

export const ProgramDetailsModal = ({ program, patientName, onClose }: ProgramDetailsModalProps) => {
  const completedCount = program.exercises.filter(e => e.completed).length;
  const totalExercises = program.exercises.length;
  const completionPercentage = Math.round((completedCount / totalExercises) * 100);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">{program.config.name}</h3>
            <p className="text-sm text-gray-600 mt-1">
              {patientName} · {completedCount} of {totalExercises} exercises completed ({completionPercentage}%)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Program Details */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Start Date</p>
              <p className="font-medium text-gray-900">{program.config.startDate}</p>
            </div>
            <div>
              <p className="text-gray-600">Duration</p>
              <p className="font-medium text-gray-900">{program.config.duration}</p>
            </div>
            <div>
              <p className="text-gray-600">Frequency</p>
              <p className="font-medium text-gray-900">
                {program.config.frequency.length > 0
                  ? program.config.frequency.join(', ')
                  : 'As needed'}
              </p>
            </div>
          </div>
        </div>

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto p-6">
          <h4 className="font-semibold text-gray-900 mb-4">Exercises</h4>
          <div className="space-y-3">
            {program.exercises.map((exercise, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 ${
                  exercise.completed
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h5 className="font-semibold text-gray-900">{exercise.name}</h5>
                      {exercise.completed && (
                        <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
                          <Check size={14} />
                          Completed
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>{exercise.sets} sets × {exercise.reps} reps</strong>
                      {exercise.holdTime && ` · Hold ${exercise.holdTime}`}
                    </p>
                    {exercise.instructions && (
                      <p className="text-sm text-gray-600 italic">{exercise.instructions}</p>
                    )}
                  </div>
                  <span className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded ml-4">
                    {exercise.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full bg-moveify-teal text-white py-3 rounded-lg hover:bg-moveify-teal-dark font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
