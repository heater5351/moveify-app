import { useState } from 'react';
import { X, Check, Copy } from 'lucide-react';
import { API_URL } from '../../config';
import { getAuthHeaders } from '../../utils/api';

type InviteClinicianModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

export const InviteClinicianModal = ({ onClose, onSuccess }: InviteClinicianModalProps) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{ invitationUrl: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    setError('');

    if (!name.trim() || !email.trim()) {
      setError('Name and email are required');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/admin/clinicians/invite`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: name.trim(), email: email.trim() })
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessData({ invitationUrl: data.invitationUrl, expiresAt: data.expiresAt });
        onSuccess();
      } else {
        setError(data.error || 'Failed to send invitation');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (successData) {
      navigator.clipboard.writeText(successData.invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Success state
  if (successData) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div className="px-6 py-5 text-center">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-green-500" />
            </div>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">Invitation Sent</h2>
            <p className="text-sm text-slate-500 mb-4">
              An invitation email has been sent to <span className="font-medium text-slate-700">{email}</span>.
              The link expires in 7 days.
            </p>

            <div className="bg-slate-50 rounded-lg p-3 mb-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Invitation Link</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-600 truncate flex-1 font-mono">{successData.invitationUrl}</p>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-1.5 rounded-md hover:bg-slate-200 transition-colors"
                  title="Copy link"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-slate-400" />}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-400 hover:bg-primary-500 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold font-display text-secondary-500">Invite Clinician</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. jane@clinic.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-400 hover:bg-primary-500 rounded-lg transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Sending...' : 'Send Invitation'}
          </button>
        </div>
      </div>
    </div>
  );
};
