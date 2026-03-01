import { useState } from 'react';
import { X, Mail } from 'lucide-react';
import type { NewPatient } from '../../types/index.ts';
import { API_URL } from '../../config';

interface AddPatientModalProps {
  newPatient: NewPatient;
  onUpdate: (patient: NewPatient) => void;
  onClose: () => void;
  onSuccess?: () => void; // Called after successful invitation generation
}

export const AddPatientModal = ({ newPatient, onUpdate, onClose, onSuccess }: AddPatientModalProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [invitationSent, setInvitationSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');

  const handleGenerateInvitation = async () => {
    setError('');

    // Validation
    if (!newPatient.name || !newPatient.email) {
      setError('Name and email are required');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch(`${API_URL}/invitations/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPatient.name,
          email: newPatient.email,
          role: 'patient',
          dob: newPatient.dob,
          phone: newPatient.phone,
          address: newPatient.address,
          condition: newPatient.condition
        })
      });

      const data = await response.json();

      if (response.ok) {
        setInvitationSent(true);
        setExpiresAt(data.expiresAt);
        // Call onSuccess to refresh patient list
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(data.error || 'Failed to create invitation');
      }
    } catch (err) {
      setError('Connection error. Please make sure the server is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  // If invitation was generated, show success screen
  if (invitationSent) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold font-display text-secondary-500">Invitation Sent</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Mail size={24} className="text-green-600" />
            </div>
            <p className="text-gray-900 font-medium mb-1">
              A setup email has been sent to
            </p>
            <p className="text-primary-400 font-semibold">{newPatient.email}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600 space-y-1">
            <p><strong>{newPatient.name}</strong> will receive a link to set their password and access their account.</p>
            <p>The link expires on <strong>{new Date(expiresAt).toLocaleDateString()}</strong>.</p>
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Default form view
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Invite New Patient</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newPatient.name}
              onChange={(e) => onUpdate({ ...newPatient, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date of Birth <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={newPatient.dob}
              onChange={(e) => onUpdate({ ...newPatient, dob: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Condition
            </label>
            <input
              type="text"
              value={newPatient.condition}
              onChange={(e) => onUpdate({ ...newPatient, condition: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              placeholder="e.g., Post-op ACL"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={newPatient.email}
              onChange={(e) => onUpdate({ ...newPatient, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              placeholder="john@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone
            </label>
            <input
              type="tel"
              value={newPatient.phone}
              onChange={(e) => onUpdate({ ...newPatient, phone: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Address
            </label>
            <input
              type="text"
              value={newPatient.address}
              onChange={(e) => onUpdate({ ...newPatient, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              placeholder="123 Main Street, Sydney NSW 2000"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerateInvitation}
            disabled={isGenerating || !newPatient.name || !newPatient.email}
            className="flex-1 px-4 py-2 bg-moveify-teal text-white rounded-lg hover:bg-moveify-teal-dark font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Sending...' : 'Send Invitation'}
          </button>
        </div>
      </div>
    </div>
  );
};
