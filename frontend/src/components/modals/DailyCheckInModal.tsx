import React, { useState } from 'react';
import { X } from 'lucide-react';

type CheckInData = {
  patientId: number;
  checkInDate: string;
  overallFeeling: number;
  generalPainLevel: number;
  energyLevel: number;
  sleepQuality: number;
  notes?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (checkIn: CheckInData) => Promise<void>;
  patientId: number;
};

export default function DailyCheckInModal({ isOpen, onClose, onSubmit, patientId }: Props) {
  const [overallFeeling, setOverallFeeling] = useState(3);
  const [generalPainLevel, setGeneralPainLevel] = useState(0);
  const [energyLevel, setEnergyLevel] = useState(3);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      await onSubmit({
        patientId,
        checkInDate: today,
        overallFeeling,
        generalPainLevel,
        energyLevel,
        sleepQuality,
        notes: notes || undefined
      });

      // Close immediately - data will silently inform progression algorithm
      onClose();
    } catch (error) {
      console.error('Failed to submit check-in:', error);
      alert('Failed to submit check-in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFeelingEmoji = (value: number) => {
    if (value <= 2) return '😢';
    if (value === 3) return '😐';
    if (value === 4) return '🙂';
    return '😊';
  };

  const getEnergyIcons = (value: number) => {
    return '⚡'.repeat(value);
  };

  const getSleepIcons = (value: number) => {
    if (value <= 2) return '😴';
    if (value === 3) return '😌';
    return '😁';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-moveify-navy">Daily Check-in</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <p className="text-gray-600 mb-6">
          Take 30 seconds to let us know how you're feeling today. This helps us personalize your program.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Overall Feeling */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              How are you feeling today? <span className="text-3xl ml-2">{getFeelingEmoji(overallFeeling)}</span>
            </label>
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-gray-500">Terrible</span>
              <input
                type="range"
                min="1"
                max="5"
                value={overallFeeling}
                onChange={(e) => setOverallFeeling(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-moveify-teal"
              />
              <span className="text-xs text-gray-500">Great</span>
            </div>
            <div className="text-center mt-2">
              <span className="text-sm font-medium text-gray-700">
                {overallFeeling === 1 && 'Terrible'}
                {overallFeeling === 2 && 'Poor'}
                {overallFeeling === 3 && 'Okay'}
                {overallFeeling === 4 && 'Good'}
                {overallFeeling === 5 && 'Great'}
              </span>
            </div>
          </div>

          {/* Pain Level */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Any pain right now? <span className="text-moveify-teal font-bold">{generalPainLevel}/10</span>
            </label>
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-gray-500">No pain</span>
              <input
                type="range"
                min="0"
                max="10"
                value={generalPainLevel}
                onChange={(e) => setGeneralPainLevel(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <span className="text-xs text-gray-500">Worst pain</span>
            </div>
          </div>

          {/* Energy Level */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Energy level? <span className="text-2xl ml-2">{getEnergyIcons(energyLevel)}</span>
            </label>
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-gray-500">Exhausted</span>
              <input
                type="range"
                min="1"
                max="5"
                value={energyLevel}
                onChange={(e) => setEnergyLevel(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-yellow-500"
              />
              <span className="text-xs text-gray-500">Energized</span>
            </div>
          </div>

          {/* Sleep Quality */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              How did you sleep? <span className="text-2xl ml-2">{getSleepIcons(sleepQuality)}</span>
            </label>
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-gray-500">Terrible</span>
              <input
                type="range"
                min="1"
                max="5"
                value={sleepQuality}
                onChange={(e) => setSleepQuality(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-xs text-gray-500">Excellent</span>
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Anything else to note? (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Feeling stressed, had a long day..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent resize-none"
              rows={2}
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-moveify-teal text-white rounded-lg hover:bg-moveify-teal-dark transition-colors font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
