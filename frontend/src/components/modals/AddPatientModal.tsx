import { useState, useEffect, useRef } from 'react';
import { X, Mail, Search, User, ChevronRight } from 'lucide-react';
import type { NewPatient } from '../../types/index.ts';
import { API_URL } from '../../config';
import { getAuthHeaders } from '../../utils/api';

const toDisplayDate = (isoDate: string): string => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
};

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

const formatDobInput = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
};

interface ClinikoPatient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
  patient_phone_numbers: { number: string }[];
}

interface AddPatientModalProps {
  newPatient: NewPatient;
  onUpdate: (patient: NewPatient) => void;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AddPatientModal = ({ newPatient, onUpdate, onClose, onSuccess }: AddPatientModalProps) => {
  const [mode, setMode] = useState<'manual' | 'cliniko'>('manual');
  const [isGenerating, setIsGenerating] = useState(false);
  const [invitationSent, setInvitationSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [dobDisplay, setDobDisplay] = useState(toDisplayDate(newPatient.dob));
  const [dobError, setDobError] = useState('');

  // Cliniko search state
  const [clinikoSearch, setClinikoSearch] = useState('');
  const [clinikoResults, setClinikoResults] = useState<ClinikoPatient[]>([]);
  const [clinikoLoading, setClinikoLoading] = useState(false);
  const [clinikoError, setClinikoError] = useState('');
  const [selectedClinikoId, setSelectedClinikoId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode === 'cliniko' && clinikoSearch.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setClinikoLoading(true);
        setClinikoError('');
        try {
          const res = await fetch(`${API_URL}/cliniko/patients?q=${encodeURIComponent(clinikoSearch.trim())}`, {
            headers: getAuthHeaders()
          });
          const data = await res.json();
          if (res.ok) {
            setClinikoResults(data.patients || []);
          } else {
            setClinikoError(data.error || 'Could not search Cliniko');
          }
        } catch {
          setClinikoError('Connection error');
        } finally {
          setClinikoLoading(false);
        }
      }, 350);
    } else {
      setClinikoResults([]);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [clinikoSearch, mode]);

  const handleSelectClinikoPatient = (cp: ClinikoPatient) => {
    setSelectedClinikoId(cp.id);
    const dob = cp.date_of_birth || '';
    onUpdate({
      ...newPatient,
      name: `${cp.first_name} ${cp.last_name}`.trim(),
      email: cp.email || '',
      dob,
      phone: cp.patient_phone_numbers?.[0]?.number || '',
    });
    setDobDisplay(toDisplayDate(dob));
    setClinikoResults([]);
    setClinikoSearch('');
  };

  const handleGenerateInvitation = async () => {
    setError('');

    if (mode === 'cliniko' && !selectedClinikoId) {
      setError('Please select a patient from Cliniko');
      return;
    }
    if (!newPatient.name || !newPatient.email) {
      setError('Name and email are required');
      return;
    }

    setIsGenerating(true);
    try {
      const body: Record<string, unknown> = {
        name: newPatient.name,
        email: newPatient.email,
        dob: newPatient.dob,
        phone: newPatient.phone,
        address: newPatient.address,
      };
      if (selectedClinikoId) body.clinikoPatientId = selectedClinikoId;

      const response = await fetch(`${API_URL}/invitations/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (response.ok) {
        setInvitationSent(true);
        setExpiresAt(data.expiresAt);
        if (onSuccess) onSuccess();
      } else {
        setError(data.error || 'Failed to create invitation');
      }
    } catch {
      setError('Connection error. Please make sure the server is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (invitationSent) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold font-display text-secondary-500">Invitation Sent</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
          </div>
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Mail size={24} className="text-green-600" />
            </div>
            <p className="text-gray-900 font-medium mb-1">A setup email has been sent to</p>
            <p className="text-primary-400 font-semibold">{newPatient.email}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600 space-y-1">
            <p><strong>{newPatient.name}</strong> will receive a link to set their password and access their account.</p>
            <p>The link expires on <strong>{new Date(expiresAt).toLocaleDateString()}</strong>.</p>
          </div>
          <button onClick={onClose} className="w-full px-4 py-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-2xl font-bold text-gray-900">Invite New Patient</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-6">
          <button
            onClick={() => { setMode('manual'); setSelectedClinikoId(null); }}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Enter manually
          </button>
          <button
            onClick={() => setMode('cliniko')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${mode === 'cliniko' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Import from Cliniko
          </button>
        </div>

        {/* Cliniko search */}
        {mode === 'cliniko' && !selectedClinikoId && (
          <div className="mb-5">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={clinikoSearch}
                onChange={(e) => setClinikoSearch(e.target.value)}
                placeholder="Search Cliniko by name..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                autoFocus
              />
            </div>
            {clinikoLoading && <p className="text-sm text-slate-400 mt-2">Searching...</p>}
            {clinikoError && <p className="text-sm text-red-500 mt-2">{clinikoError}</p>}
            {clinikoResults.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                {clinikoResults.map((cp) => (
                  <button
                    key={cp.id}
                    onClick={() => handleSelectClinikoPatient(cp)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                  >
                    <div className="w-8 h-8 bg-primary-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800">{cp.first_name} {cp.last_name}</p>
                      <p className="text-xs text-slate-400">{cp.email || 'No email'}{cp.date_of_birth ? ` · DOB: ${cp.date_of_birth}` : ''}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300" />
                  </button>
                ))}
              </div>
            )}
            {clinikoSearch.trim().length >= 2 && !clinikoLoading && clinikoResults.length === 0 && !clinikoError && (
              <p className="text-sm text-slate-400 mt-2">No patients found in Cliniko</p>
            )}
          </div>
        )}

        {/* Selected Cliniko patient banner */}
        {mode === 'cliniko' && selectedClinikoId && (
          <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-lg px-4 py-2.5 mb-5">
            <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User size={12} className="text-primary-500" />
            </div>
            <p className="text-sm text-primary-700 font-medium flex-1">{newPatient.name} — imported from Cliniko</p>
            <button
              onClick={() => { setSelectedClinikoId(null); onUpdate({ ...newPatient, name: '', email: '', dob: '', phone: '' }); setDobDisplay(''); }}
              className="text-primary-400 hover:text-primary-600 text-xs"
            >
              Change
            </button>
          </div>
        )}

        {/* Form fields — shown when: manual mode always, cliniko mode after selection */}
        {(mode === 'manual' || selectedClinikoId) && (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={newPatient.name}
                onChange={(e) => onUpdate({ ...newPatient, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
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
                    if (iso) { onUpdate({ ...newPatient, dob: iso }); setDobError(''); }
                    else { onUpdate({ ...newPatient, dob: '' }); setDobError('Invalid date'); }
                  } else {
                    onUpdate({ ...newPatient, dob: '' });
                  }
                }}
                onBlur={() => { if (dobDisplay && !newPatient.dob) setDobError('Invalid date'); }}
                maxLength={10}
                placeholder="DD/MM/YYYY"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent ${dobError ? 'border-red-400' : 'border-gray-300'}`}
              />
              {dobError && <p className="text-red-500 text-sm mt-1">{dobError}</p>}
            </div>


            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={newPatient.email}
                onChange={(e) => onUpdate({ ...newPatient, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                placeholder="john@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input
                type="tel"
                value={newPatient.phone}
                onChange={(e) => onUpdate({ ...newPatient, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                placeholder="0400 000 000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <input
                type="text"
                value={newPatient.address}
                onChange={(e) => onUpdate({ ...newPatient, address: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                placeholder="123 Main Street, Sydney NSW 2000"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleGenerateInvitation}
            disabled={isGenerating || (mode === 'manual' && (!newPatient.name || !newPatient.email)) || (mode === 'cliniko' && !selectedClinikoId)}
            className="flex-1 px-4 py-2 bg-moveify-teal text-white rounded-lg hover:bg-moveify-teal-dark font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Sending...' : 'Send Invitation'}
          </button>
        </div>
      </div>
    </div>
  );
};
