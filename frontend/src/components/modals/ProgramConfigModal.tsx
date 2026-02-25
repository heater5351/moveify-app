import { X } from 'lucide-react';
import type { ProgramConfig } from '../../types/index.ts';

interface ProgramConfigModalProps {
  config: ProgramConfig;
  onUpdate: (config: ProgramConfig) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export const ProgramConfigModal = ({ config, onUpdate, onConfirm, onBack }: ProgramConfigModalProps) => {
  const toggleFrequencyDay = (day: string) => {
    if (config.frequency.includes(day)) {
      onUpdate({
        ...config,
        frequency: config.frequency.filter(d => d !== day)
      });
    } else {
      onUpdate({
        ...config,
        frequency: [...config.frequency, day]
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold font-display text-slate-800">Configure Program</h3>
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Start Date */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3">When do you want this program to start?</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['today', 'tomorrow', 'nextweek', 'custom'].map(option => (
                <button
                  key={option}
                  onClick={() => onUpdate({ ...config, startDate: option as any })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${config.startDate === option
                    ? 'bg-primary-400 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {option === 'today' && 'Today'}
                  {option === 'tomorrow' && 'Tomorrow'}
                  {option === 'nextweek' && '+1 Week'}
                  {option === 'custom' && 'Custom'}
                </button>
              ))}
            </div>
            {config.startDate === 'custom' && (
              <input
                type="date"
                value={config.customStartDate}
                onChange={(e) => onUpdate({ ...config, customStartDate: e.target.value })}
                className="mt-3 w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
              />
            )}
          </div>

          {/* Frequency */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Program Frequency</h4>
            <p className="text-sm text-slate-500 mb-3">How often do you want them to perform this exercise program?</p>
            <p className="text-xs font-medium text-slate-500 mb-2">On specific days:</p>
            <div className="grid grid-cols-7 gap-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <button
                  key={day}
                  onClick={() => toggleFrequencyDay(day)}
                  className={`px-3 py-3 rounded-lg font-medium transition-colors ${config.frequency.includes(day)
                    ? 'bg-primary-400 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Program Duration</h4>
            <p className="text-sm text-slate-500 mb-3">When do you want this program to end?</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['1week', '2weeks', '4weeks', '6weeks', 'ongoing', 'custom'].map(option => (
                <button
                  key={option}
                  onClick={() => onUpdate({ ...config, duration: option as any })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${config.duration === option
                    ? 'bg-primary-400 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {option === '1week' && '1 Week'}
                  {option === '2weeks' && '2 Weeks'}
                  {option === '4weeks' && '4 Weeks'}
                  {option === '6weeks' && '6 Weeks'}
                  {option === 'ongoing' && 'Ongoing'}
                  {option === 'custom' && 'Custom Date'}
                </button>
              ))}
            </div>
            {config.duration === 'custom' && (
              <input
                type="date"
                value={config.customEndDate}
                onChange={(e) => onUpdate({ ...config, customEndDate: e.target.value })}
                className="mt-3 w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
              />
            )}
          </div>

          {/* Data Collection Settings */}
          <div className="p-4 bg-slate-50 rounded-lg ring-1 ring-slate-200">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Data Collection Settings</h4>
            <p className="text-sm text-slate-500 mb-3">
              Choose what data patients should record when completing exercises
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.trackRpe || false}
                  onChange={(e) => onUpdate({ ...config, trackRpe: e.target.checked })}
                  className="w-4 h-4 text-primary-400 border-slate-300 rounded focus:ring-primary-400"
                />
                <span className="text-sm font-medium text-slate-700">Track RPE (Rate of Perceived Exertion)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.trackPainLevel || false}
                  onChange={(e) => onUpdate({ ...config, trackPainLevel: e.target.checked })}
                  className="w-4 h-4 text-primary-400 border-slate-300 rounded focus:ring-primary-400"
                />
                <span className="text-sm font-medium text-slate-700">Track Pain Level</span>
              </label>
            </div>

            <p className="text-xs text-slate-500 mt-3 flex items-start gap-1">
              <span>ℹ️</span>
              <span>Actual sets/reps performed are always tracked</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onBack}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
          >
            Back
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium"
          >
            Confirm Assignment
          </button>
        </div>
      </div>
    </div>
  );
};
