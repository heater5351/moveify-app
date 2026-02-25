import { X } from 'lucide-react';
import type { Patient } from '../../types/index.ts';

interface PatientSelectionModalProps {
  patients: Patient[];
  selectedPatient: Patient | null;
  onSelect: (patient: Patient) => void;
  onNext: () => void;
  onClose: () => void;
}

export const PatientSelectionModal = ({
  patients,
  selectedPatient,
  onSelect,
  onNext,
  onClose
}: PatientSelectionModalProps) => {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold font-display text-slate-800">Select Patient</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {patients.map(patient => (
            <button
              key={patient.id}
              onClick={() => onSelect(patient)}
              className={`w-full text-left p-4 rounded-lg transition-all ${selectedPatient?.id === patient.id
                ? 'ring-2 ring-primary-400 bg-primary-50'
                : 'ring-1 ring-slate-200 hover:ring-primary-300'
                }`}
            >
              <p className="font-semibold text-slate-800">{patient.name}</p>
              <p className="text-sm text-slate-500">{patient.condition}</p>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onNext}
            disabled={!selectedPatient}
            className={`flex-1 px-4 py-2 rounded-lg font-medium ${selectedPatient
              ? 'bg-primary-400 text-white hover:bg-primary-500'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
