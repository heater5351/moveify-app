import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
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
  const [invitationUrl, setInvitationUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

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
        setInvitationUrl(data.invitationUrl);
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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(invitationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // If invitation was generated, show success screen
  if (invitationUrl) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900">Invitation Created!</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800 font-medium mb-2">✓ Invitation sent successfully</p>
            <p className="text-sm text-green-700">
              Patient: <strong>{newPatient.name}</strong> ({newPatient.email})
            </p>
            <p className="text-sm text-green-700">
              Expires: <strong>{new Date(expiresAt).toLocaleDateString()}</strong>
            </p>
          </div>

          <div className="bg-primary-50 border border-blue-200 rounded-lg p-4 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Invitation Link (share this with the patient)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={invitationUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 bg-moveify-teal text-white rounded-lg hover:bg-moveify-teal-dark flex items-center gap-2"
              >
                {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
              </button>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">
              📧 <strong>Next steps:</strong> Send this link to the patient via email or SMS.
              They will use it to set their password and create their account.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
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
            {isGenerating ? 'Generating...' : 'Generate Invitation'}
          </button>
        </div>
      </div>
    </div>
  );
};
