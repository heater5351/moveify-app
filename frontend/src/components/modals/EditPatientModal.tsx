import { X, Trash2 } from 'lucide-react';
import type { Patient } from '../../types/index.ts';

interface EditPatientModalProps {
  patient: Patient;
  onUpdate: (patient: Patient) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const EditPatientModal = ({ patient, onUpdate, onSave, onDelete, onClose }: EditPatientModalProps) => {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold font-display text-slate-800">Edit Patient</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={patient.name}
              onChange={(e) => onUpdate({ ...patient, name: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Date of Birth <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={patient.dob}
              onChange={(e) => onUpdate({ ...patient, dob: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Condition
            </label>
            <input
              type="text"
              value={patient.condition}
              onChange={(e) => onUpdate({ ...patient, condition: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={patient.email}
              onChange={(e) => onUpdate({ ...patient, email: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Phone
            </label>
            <input
              type="tel"
              value={patient.phone}
              onChange={(e) => onUpdate({ ...patient, phone: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Address
            </label>
            <input
              type="text"
              value={patient.address}
              onChange={(e) => onUpdate({ ...patient, address: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
            />
          </div>
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
            onClick={onDelete}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium flex items-center gap-2"
          >
            <Trash2 size={18} />
            Delete
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-4 py-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
