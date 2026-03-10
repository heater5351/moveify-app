import { useState, useEffect } from 'react';
import { X, Trash2, Search, FolderOpen, Dumbbell } from 'lucide-react';
import type { ProgramExercise, ProgramTemplate } from '../../types/index.ts';
import { API_URL } from '../../config';
import { getAuthHeaders } from '../../utils/api';

interface ProgramTemplateModalProps {
  onLoad: (exercises: ProgramExercise[]) => void;
  onClose: () => void;
}

type TemplateDetail = ProgramTemplate & {
  exercises: {
    exercise_name: string;
    exercise_category: string | null;
    sets: number;
    reps: number;
    prescribed_weight: number;
    prescribed_duration: number | null;
    rest_duration: number | null;
    hold_time: string | null;
    instructions: string | null;
    image_url: string | null;
    exercise_order: number;
  }[];
};

export const ProgramTemplateModal = ({ onLoad, onClose }: ProgramTemplateModalProps) => {
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/program-templates`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplateDetail = async (id: number) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API_URL}/program-templates/${id}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTemplate(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/program-templates/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
        if (selectedTemplate?.id === id) {
          setSelectedTemplate(null);
        }
      }
    } catch {
      // ignore
    }
    setConfirmDeleteId(null);
  };

  const handleLoad = () => {
    if (!selectedTemplate) return;

    const exercises: ProgramExercise[] = selectedTemplate.exercises.map((ex, i) => ({
      id: -(i + 1), // temporary negative IDs
      name: ex.exercise_name,
      category: ex.exercise_category || '',
      duration: '',
      description: ex.instructions || '',
      sets: ex.sets,
      reps: ex.reps,
      prescribedWeight: ex.prescribed_weight || 0,
      prescribedDuration: ex.prescribed_duration || undefined,
      restDuration: ex.rest_duration || undefined,
      holdTime: ex.hold_time || undefined,
      instructions: ex.instructions || undefined,
      completed: false,
    }));

    onLoad(exercises);
  };

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FolderOpen size={18} className="text-primary-400" />
            <h2 className="text-lg font-semibold font-display text-secondary-500">Load Template</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 transition-all"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Template list */}
          <div className="w-1/2 border-r border-slate-100 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-slate-400">No templates found</p>
                <p className="text-xs text-slate-300 mt-1">Save a program as a template first</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filtered.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => fetchTemplateDetail(template.id)}
                    className={`px-4 py-3 cursor-pointer transition-colors group ${
                      selectedTemplate?.id === template.id
                        ? 'bg-primary-50 border-l-2 border-primary-400'
                        : 'hover:bg-slate-50 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{template.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
                          {' · '}
                          {new Date(template.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {confirmDeleteId === template.id ? (
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                            className="text-xs text-red-600 font-medium hover:text-red-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="text-xs text-slate-400 hover:text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(template.id); }}
                          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exercise preview */}
          <div className="w-1/2 overflow-y-auto">
            {loadingDetail ? (
              <div className="p-6 text-center text-sm text-slate-400">Loading...</div>
            ) : selectedTemplate ? (
              <div className="p-4 space-y-2">
                <h3 className="text-sm font-medium text-slate-700 mb-3">Exercises</h3>
                {selectedTemplate.exercises.map((ex, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg">
                    <Dumbbell size={14} className="text-slate-300 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 truncate">{ex.exercise_name}</p>
                      <p className="text-xs text-slate-400">
                        {ex.sets}×{ex.reps}
                        {ex.prescribed_weight ? ` · ${ex.prescribed_weight}kg` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-slate-300">
                Select a template to preview
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            disabled={!selectedTemplate}
            className="px-5 py-2 bg-primary-400 hover:bg-primary-500 text-white rounded-lg text-sm font-medium disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            Load Template
          </button>
        </div>
      </div>
    </div>
  );
};
