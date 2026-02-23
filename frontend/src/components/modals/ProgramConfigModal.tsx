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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Configure Program</h3>

        {/* Start Date */}
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-3">When do you want this program to start?</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['today', 'tomorrow', 'nextweek', 'custom'].map(option => (
              <button
                key={option}
                onClick={() => onUpdate({ ...config, startDate: option as any })}
                className={`px-4 py-3 rounded-lg font-medium transition-colors ${config.startDate === option
                  ? 'bg-moveify-teal text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
              className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          )}
        </div>

        {/* Frequency */}
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Program Frequency</h4>
          <p className="text-sm text-gray-600 mb-3">How often do you want them to perform this exercise program?</p>
          <p className="text-sm font-medium text-gray-700 mb-2">On specific days:</p>
          <div className="grid grid-cols-7 gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <button
                key={day}
                onClick={() => toggleFrequencyDay(day)}
                className={`px-3 py-3 rounded-lg font-medium transition-colors ${config.frequency.includes(day)
                  ? 'bg-moveify-teal text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-3">Program Duration</h4>
          <p className="text-sm text-gray-600 mb-3">When do you want this program to end?</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {['1week', '2weeks', '4weeks', '6weeks', 'ongoing', 'custom'].map(option => (
              <button
                key={option}
                onClick={() => onUpdate({ ...config, duration: option as any })}
                className={`px-4 py-3 rounded-lg font-medium transition-colors ${config.duration === option
                  ? 'bg-moveify-teal text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
              className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          )}
        </div>

        {/* Data Collection Settings */}
        <div className="mb-6 p-4 bg-primary-50 rounded-lg border border-blue-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Data Collection Settings</h4>
          <p className="text-sm text-gray-600 mb-3">
            Choose what data patients should record when completing exercises
          </p>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.trackRpe || false}
                onChange={(e) => onUpdate({ ...config, trackRpe: e.target.checked })}
                className="w-4 h-4 text-moveify-teal border-gray-300 rounded focus:ring-moveify-teal"
              />
              <span className="text-sm font-medium text-gray-900">Track RPE (Rate of Perceived Exertion)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.trackPainLevel || false}
                onChange={(e) => onUpdate({ ...config, trackPainLevel: e.target.checked })}
                className="w-4 h-4 text-moveify-teal border-gray-300 rounded focus:ring-moveify-teal"
              />
              <span className="text-sm font-medium text-gray-900">Track Pain Level</span>
            </label>
          </div>

          <p className="text-xs text-gray-600 mt-3 flex items-start gap-1">
            <span>ℹ️</span>
            <span>Actual sets/reps performed are always tracked</span>
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            Confirm Assignment
          </button>
        </div>
      </div>
    </div>
  );
};
