import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Globe, Save, ArrowLeft } from 'lucide-react';
import { getAiProtocols, createAiProtocol, updateAiProtocol, deleteAiProtocol } from '../../utils/ai';
import type { AiProtocol } from '../../utils/ai';

type AiProtocolModalProps = {
  show: boolean;
  onClose: () => void;
  isAdmin: boolean;
};

const CATEGORIES = ['ACL Rehabilitation', 'Shoulder', 'Lower Limb', 'Upper Limb', 'Post-Surgical', 'Tendinopathy', 'General Strength', 'Return to Sport', 'Other'];

type EditState = {
  id?: number;
  name: string;
  content: string;
  category: string;
  isGlobal: boolean;
};

const emptyEdit: EditState = { name: '', content: '', category: '', isGlobal: false };

export function AiProtocolModal({ show, onClose, isAdmin }: AiProtocolModalProps) {
  const [protocols, setProtocols] = useState<AiProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (show) {
      setLoading(true);
      getAiProtocols()
        .then(setProtocols)
        .catch(() => setError('Failed to load protocols'))
        .finally(() => setLoading(false));
    }
  }, [show]);

  const handleSave = async () => {
    if (!editing || !editing.name.trim() || !editing.content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editing.id) {
        const updated = await updateAiProtocol(editing.id, {
          name: editing.name,
          content: editing.content,
          category: editing.category || undefined,
          isGlobal: editing.isGlobal,
        });
        setProtocols(prev => prev.map(p => p.id === updated.id ? updated : p));
      } else {
        const created = await createAiProtocol({
          name: editing.name,
          content: editing.content,
          category: editing.category || undefined,
          isGlobal: editing.isGlobal,
        });
        setProtocols(prev => [...prev, created]);
      }
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this protocol?')) return;
    try {
      await deleteAiProtocol(id);
      setProtocols(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {editing && (
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-slate-100 rounded-lg mr-1">
                <ArrowLeft className="w-4 h-4 text-slate-500" />
              </button>
            )}
            <h2 className="font-display font-semibold text-secondary-600">
              {editing ? (editing.id ? 'Edit Protocol' : 'New Protocol') : 'Clinical Protocols'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {editing ? (
            /* Edit/Create form */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g., ACL Rehab Phase 2 Protocol"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                >
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Protocol Content
                  <span className="text-slate-400 font-normal ml-1">(guidelines, progressions, contraindications)</span>
                </label>
                <textarea
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  placeholder="Paste or type your clinical protocol here. Include exercise selection criteria, progression guidelines, weekly targets, contraindications, etc."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 min-h-[200px] resize-y"
                  rows={10}
                />
              </div>

              {isAdmin && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.isGlobal}
                    onChange={(e) => setEditing({ ...editing, isGlobal: e.target.checked })}
                    className="rounded border-slate-300 text-primary-400 focus:ring-primary-300"
                  />
                  <Globe className="w-3.5 h-3.5 text-slate-500" />
                  Share with all clinicians (global)
                </label>
              )}
            </div>
          ) : loading ? (
            <div className="text-center text-slate-400 py-12">Loading protocols...</div>
          ) : protocols.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              <p className="text-sm mb-2">No protocols yet</p>
              <p className="text-xs">Add clinical protocols to guide the AI assistant's exercise recommendations.</p>
            </div>
          ) : (
            /* Protocol list */
            <div className="space-y-2">
              {protocols.map(p => (
                <div key={p.id} className="border border-slate-200 rounded-lg p-3 hover:border-primary-200 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm text-secondary-600 truncate">{p.name}</h3>
                        {p.is_global && (
                          <span className="flex items-center gap-0.5 text-xs text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded">
                            <Globe className="w-3 h-3" /> Global
                          </span>
                        )}
                      </div>
                      {p.category && <span className="text-xs text-slate-400">{p.category}</span>}
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.content}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditing({
                          id: p.id,
                          name: p.name,
                          content: p.content,
                          category: p.category || '',
                          isGlobal: p.is_global,
                        })}
                        className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-between">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editing.name.trim() || !editing.content.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary-400 hover:bg-primary-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm rounded-lg font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Protocol'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setEditing({ ...emptyEdit })}
                className="flex items-center gap-2 px-4 py-2 bg-primary-400 hover:bg-primary-500 text-white text-sm rounded-lg font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Protocol
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
