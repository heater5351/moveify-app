import { useState, useEffect } from 'react';
import { X, Trash2, Globe, User } from 'lucide-react';
import type { PeriodizationTemplate } from '../../types/index.ts';
import { API_URL } from '../../config';

interface TemplateManagerModalProps {
  clinicianId: number;
  onClose: () => void;
}

export const TemplateManagerModal = ({ clinicianId, onClose }: TemplateManagerModalProps) => {
  const [templates, setTemplates] = useState<PeriodizationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/blocks/templates?clinicianId=${clinicianId}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [clinicianId]);

  const handleDelete = async (templateId: number) => {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    setDeletingId(templateId);
    try {
      const res = await fetch(`${API_URL}/blocks/templates/${templateId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicianId })
      });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== templateId));
      }
    } catch {
      // Ignore
    } finally {
      setDeletingId(null);
    }
  };

  const myTemplates = templates.filter(t => t.createdBy === clinicianId && !t.isGlobal);
  const globalTemplates = templates.filter(t => t.isGlobal);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-secondary-500">Periodization Templates</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading templates...</p>
          ) : (
            <>
              {/* My Templates */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <User size={14} className="text-slate-500" />
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">My Templates</h3>
                </div>
                {myTemplates.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No personal templates yet. Create one via the Block Builder.</p>
                ) : (
                  <div className="space-y-2">
                    {myTemplates.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg ring-1 ring-slate-200">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{t.name}</p>
                          {t.description && <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>}
                          <p className="text-xs text-primary-400 mt-0.5">{t.blockDuration} weeks</p>
                        </div>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deletingId === t.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                          title="Delete template"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Global Templates */}
              {globalTemplates.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Globe size={14} className="text-slate-500" />
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Global Templates</h3>
                  </div>
                  <div className="space-y-2">
                    {globalTemplates.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg ring-1 ring-slate-200">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{t.name}</p>
                          {t.description && <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>}
                          <p className="text-xs text-primary-400 mt-0.5">{t.blockDuration} weeks</p>
                        </div>
                        <span className="text-xs text-slate-400 italic">Global</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {templates.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">
                  No templates yet. Use the Block Builder to create and save your first template.
                </p>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full px-5 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
