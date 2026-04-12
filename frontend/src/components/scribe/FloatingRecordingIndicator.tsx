import { Mic, X } from 'lucide-react';

interface FloatingRecordingIndicatorProps {
  patientName: string;
  elapsedSecs: number;
  onReturn: () => void;
  onStop: () => void;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function FloatingRecordingIndicator({ patientName, elapsedSecs, onReturn, onStop }: FloatingRecordingIndicatorProps) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-secondary-700 text-white rounded-2xl shadow-2xl px-4 py-3 cursor-pointer hover:bg-secondary-600 transition-colors"
      style={{ minWidth: '220px' }}
      onClick={onReturn}
    >
      {/* Pulsing mic dot */}
      <div className="relative flex-shrink-0">
        <span className="absolute inline-flex w-5 h-5 rounded-full bg-red-400 opacity-60 animate-ping" />
        <Mic className="relative w-5 h-5 text-red-400" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white/80 uppercase tracking-wide leading-none mb-0.5">Recording</p>
        <p className="text-sm font-bold truncate">{patientName}</p>
      </div>

      {/* Timer */}
      <span className="font-mono text-sm text-red-300 flex-shrink-0">{formatTime(elapsedSecs)}</span>

      {/* Stop */}
      <button
        onClick={(e) => { e.stopPropagation(); onStop(); }}
        className="p-1 rounded-lg hover:bg-white/10 transition flex-shrink-0"
        title="Stop recording"
      >
        <X className="w-4 h-4 text-white/60" />
      </button>
    </div>
  );
}
