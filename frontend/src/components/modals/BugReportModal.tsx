import { useState } from 'react';
import { X, Bug, Lightbulb, MessageSquare } from 'lucide-react';
import { API_URL } from '../../config';
import { getAuthHeaders } from '../../utils/api';

type BugReportModalProps = {
  onClose: () => void;
  onSuccess: () => void;
  currentPage?: string;
};

const CATEGORIES = [
  { value: 'bug', label: 'Bug', icon: Bug, color: 'text-red-500 bg-red-50 border-red-200' },
  { value: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'text-amber-500 bg-amber-50 border-amber-200' },
  { value: 'other', label: 'Other', icon: MessageSquare, color: 'text-blue-500 bg-blue-50 border-blue-200' },
] as const;

export const BugReportModal = ({ onClose, onSuccess, currentPage }: BugReportModalProps) => {
  const [category, setCategory] = useState<'bug' | 'feature' | 'other'>('bug');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (description.trim().length < 10) {
      setError('Please provide at least 10 characters of detail');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ category, description: description.trim(), page: currentPage || null })
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setError(data.error || 'Failed to submit report');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold font-display text-secondary-500">Report an Issue</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Category selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
            <div className="flex gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      isSelected
                        ? cat.color + ' ring-2 ring-offset-1 ring-primary-400/30'
                        : 'text-slate-500 bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={14} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {category === 'bug' ? 'What happened?' : category === 'feature' ? 'What would you like?' : 'Tell us more'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                category === 'bug'
                  ? 'Describe what went wrong and what you expected to happen...'
                  : category === 'feature'
                  ? 'Describe the feature you would like to see...'
                  : 'Share your feedback...'
              }
              rows={4}
              maxLength={2000}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{description.length}/2000</p>
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
            disabled={isSubmitting || description.trim().length < 10}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-400 hover:bg-primary-500 rounded-lg transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
};
