import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { Patient } from '../../types/index.ts';

// Convert YYYY-MM-DD to DD/MM/YYYY for display
const toDisplayDate = (isoDate: string): string => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
};

// Validate and convert DD/MM/YYYY to YYYY-MM-DD, returns null if invalid
const parseDisplayDate = (display: string): string | null => {
  const cleaned = display.replace(/\D/g, '');
  if (cleaned.length !== 8) return null;
  const day = parseInt(cleaned.slice(0, 2), 10);
  const month = parseInt(cleaned.slice(2, 4), 10);
  const year = parseInt(cleaned.slice(4, 8), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > new Date().getFullYear()) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  if (date > new Date()) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Auto-format input as DD/MM/YYYY while typing
const formatDobInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
};

interface EditPatientModalProps {
  patient: Patient;
  onUpdate: (patient: Patient) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const EditPatientModal = ({ patient, onUpdate, onSave, onDelete, onClose }: EditPatientModalProps) => {
  const [dobDisplay, setDobDisplay] = useState(toDisplayDate(patient.dob));
  const [dobError, setDobError] = useState('');

  const inputCls = "w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none";
  const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

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
              type="text"
              inputMode="numeric"
              value={dobDisplay}
              onChange={(e) => {
                const formatted = formatDobInput(e.target.value);
                setDobDisplay(formatted);
                setDobError('');
                if (formatted.replace(/\D/g, '').length === 8) {
                  const iso = parseDisplayDate(formatted);
                  if (iso) {
                    onUpdate({ ...patient, dob: iso });
                    setDobError('');
                  } else {
                    onUpdate({ ...patient, dob: '' });
                    setDobError('Invalid date');
                  }
                } else {
                  onUpdate({ ...patient, dob: '' });
                }
              }}
              onBlur={() => {
                if (dobDisplay && !patient.dob) {
                  setDobError('Invalid date');
                }
              }}
              maxLength={10}
              placeholder="DD/MM/YYYY"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none ${
                dobError ? 'border-red-400' : 'border-slate-200'
              }`}
            />
            {dobError && (
              <p className="text-red-500 text-xs mt-1">{dobError}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Sex
            </label>
            <select
              value={patient.sex || ''}
              onChange={(e) => onUpdate({ ...patient, sex: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none bg-white"
            >
              <option value="">Not specified</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Used to compare assessment results against age- and sex-matched normative data.</p>
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

          {/* Demographics */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Demographics</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Title</label>
                <select
                  value={patient.title || ''}
                  onChange={(e) => onUpdate({ ...patient, title: e.target.value })}
                  className={`${inputCls} bg-white`}
                >
                  <option value="">—</option>
                  <option>Mr</option>
                  <option>Mrs</option>
                  <option>Ms</option>
                  <option>Miss</option>
                  <option>Mx</option>
                  <option>Dr</option>
                  <option>Prof</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Preferred name</label>
                <input
                  type="text"
                  value={patient.preferredName || ''}
                  onChange={(e) => onUpdate({ ...patient, preferredName: e.target.value })}
                  placeholder="Known as…"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Pronouns</label>
                <input
                  type="text"
                  value={patient.pronouns || ''}
                  onChange={(e) => onUpdate({ ...patient, pronouns: e.target.value })}
                  placeholder="e.g. she/her"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Occupation</label>
                <input
                  type="text"
                  value={patient.occupation || ''}
                  onChange={(e) => onUpdate({ ...patient, occupation: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Emergency contacts, GPs, specialists and support coordinators are
              managed in the shared Contacts directory (Contacts tab on the
              patient profile), not here. */}

          {/* Referral & funding */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Referral &amp; funding</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Referral source</label>
                <input
                  type="text"
                  value={patient.referralSource || ''}
                  onChange={(e) => onUpdate({ ...patient, referralSource: e.target.value })}
                  placeholder="e.g. GP referral, word of mouth"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Medicare number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={patient.medicareNumber || ''}
                  onChange={(e) => onUpdate({ ...patient, medicareNumber: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>DVA number</label>
                <input
                  type="text"
                  value={patient.dvaNumber || ''}
                  onChange={(e) => onUpdate({ ...patient, dvaNumber: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Private health fund</label>
                <input
                  type="text"
                  value={patient.privateHealthFund || ''}
                  onChange={(e) => onUpdate({ ...patient, privateHealthFund: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Member number</label>
                <input
                  type="text"
                  value={patient.privateHealthMemberNumber || ''}
                  onChange={(e) => onUpdate({ ...patient, privateHealthMemberNumber: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
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
