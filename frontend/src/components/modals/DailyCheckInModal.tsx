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

const feelingLabels = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Great'];
const energyLabels  = ['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High'];
const sleepLabels   = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];

interface RatingButtonsProps {
  value: number;
  onChange: (v: number) => void;
  activeClass: string;
  lowLabel: string;
  highLabel: string;
}

const RatingButtons = ({ value, onChange, activeClass, lowLabel, highLabel }: RatingButtonsProps) => (
  <div>
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            value === v ? activeClass : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
    <div className="flex justify-between mt-1">
      <span className="text-[10px] text-slate-400">{lowLabel}</span>
      <span className="text-[10px] text-slate-400">{highLabel}</span>
    </div>
  </div>
);

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
      onClose();
    } catch (error) {
      console.error('Failed to submit check-in:', error);
      alert('Failed to submit check-in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const painColor =
    generalPainLevel >= 7 ? 'text-red-500' :
    generalPainLevel >= 4 ? 'text-amber-500' :
    'text-emerald-500';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 max-w-sm w-full">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold font-display text-secondary-500">Daily Check-in</h2>
            <p className="text-xs text-slate-400 mt-0.5">Quick 30-second wellness snapshot</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

          {/* Overall Feeling */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">How are you feeling?</label>
              <span className="text-xs text-slate-400 font-medium">{feelingLabels[overallFeeling]}</span>
            </div>
            <RatingButtons
              value={overallFeeling}
              onChange={setOverallFeeling}
              activeClass="bg-primary-400 text-white"
              lowLabel="Terrible"
              highLabel="Great"
            />
          </div>

          {/* Pain Level */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Pain level</label>
              <span className={`text-sm font-semibold ${painColor}`}>{generalPainLevel}<span className="text-slate-400 font-normal text-xs">/10</span></span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              value={generalPainLevel}
              onChange={(e) => setGeneralPainLevel(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-red-400"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-slate-400">No pain</span>
              <span className="text-[10px] text-slate-400">Worst</span>
            </div>
          </div>

          {/* Energy Level */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Energy level</label>
              <span className="text-xs text-slate-400 font-medium">{energyLabels[energyLevel]}</span>
            </div>
            <RatingButtons
              value={energyLevel}
              onChange={setEnergyLevel}
              activeClass="bg-amber-400 text-white"
              lowLabel="Exhausted"
              highLabel="Energized"
            />
          </div>

          {/* Sleep Quality */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Sleep quality</label>
              <span className="text-xs text-slate-400 font-medium">{sleepLabels[sleepQuality]}</span>
            </div>
            <RatingButtons
              value={sleepQuality}
              onChange={setSleepQuality}
              activeClass="bg-blue-400 text-white"
              lowLabel="Terrible"
              highLabel="Excellent"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth noting today…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 resize-none text-sm text-slate-800 placeholder:text-slate-400 transition-all"
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-primary-400 hover:bg-primary-500 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting…' : 'Submit Check-in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
