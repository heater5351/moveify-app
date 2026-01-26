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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Select Patient</h3>
        <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
          {patients.map(patient => (
            <button
              key={patient.id}
              onClick={() => onSelect(patient)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedPatient?.id === patient.id
                ? 'border-blue-500 bg-primary-50'
                : 'border-gray-200 hover:border-primary-300'
                }`}
            >
              <p className="font-semibold text-gray-900">{patient.name}</p>
              <p className="text-sm text-gray-600">{patient.condition}</p>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onNext}
            disabled={!selectedPatient}
            className={`flex-1 px-4 py-2 rounded-lg font-medium ${selectedPatient
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
