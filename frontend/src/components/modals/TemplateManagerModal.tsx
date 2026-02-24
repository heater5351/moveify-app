import { useState, useEffect } from 'react';
import { X, Trash2, Globe, User, Plus, Pencil, ChevronDown, ChevronRight, Check } from 'lucide-react';
import type { PeriodizationTemplate } from '../../types/index.ts';
import { API_URL } from '../../config';

interface TemplateManagerModalProps {
  clinicianId: number;
  onClose: () => void;
}

interface WeekData {
  sets: string;
  reps: string;
  rpe: string;
}

interface TemplateFormData {
  name: string;
  description: string;
  blockDuration: 4 | 6 | 8;
  weeks: WeekData[];
}

interface TemplateWithWeeksData extends PeriodizationTemplate {
  weeks?: { week_number: number; sets: number; reps: number; rpe_target?: number | null }[];
}

const emptyWeek = (): WeekData => ({ sets: '3', reps: '10', rpe: '' });

const makeEmptyForm = (duration: 4 | 6 | 8 = 4): TemplateFormData => ({
  name: '',
  description: '',
  blockDuration: duration,
  weeks: Array.from({ length: duration }, emptyWeek)
});

export const TemplateManagerModal = ({ clinicianId, onClose }: TemplateManagerModalProps) => {
  const [templates, setTemplates] = useState<TemplateWithWeeksData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TemplateFormData | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<TemplateFormData>(makeEmptyForm());
  const [saving, setSaving] = useState(false);

  // Map snake_case API response to camelCase frontend types
  const mapTemplate = (t: Record<string, unknown>): TemplateWithWeeksData => ({
    id: t.id as number,
    name: t.name as string,
    description: (t.description as string) || null,
    blockDuration: (t.block_duration || t.blockDuration) as 4 | 6 | 8,
    createdBy: (t.created_by || t.createdBy) as number,
    isGlobal: (t.is_global ?? t.isGlobal ?? false) as boolean,
    createdAt: (t.created_at || t.createdAt || '') as string,
    updatedAt: (t.updated_at || t.updatedAt || '') as string,
  });

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/blocks/templates?clinicianId=${clinicianId}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates((data.templates || []).map(mapTemplate));
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

  const fetchTemplateWeeks = async (templateId: number) => {
    try {
      const res = await fetch(`${API_URL}/blocks/templates/${templateId}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(prev => prev.map(t =>
          t.id === templateId ? { ...t, weeks: data.weeks || [] } : t
        ));
        return data.weeks || [];
      }
    } catch {
      // Ignore
    }
    return [];
  };

  const handleExpand = async (templateId: number) => {
    if (expandedId === templateId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(templateId);
    const t = templates.find(t => t.id === templateId);
    if (!t?.weeks) {
      await fetchTemplateWeeks(templateId);
    }
  };

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
        if (expandedId === templateId) setExpandedId(null);
        if (editingId === templateId) { setEditingId(null); setEditForm(null); }
      }
    } catch {
      // Ignore
    } finally {
      setDeletingId(null);
    }
  };

  const startEditing = async (template: TemplateWithWeeksData) => {
    let weeks = template.weeks;
    if (!weeks) {
      weeks = await fetchTemplateWeeks(template.id);
    }
    setExpandedId(template.id);
    setEditingId(template.id);
    setEditForm({
      name: template.name,
      description: template.description || '',
      blockDuration: template.blockDuration,
      weeks: Array.from({ length: template.blockDuration }, (_, i) => {
        const w = weeks!.find((wk: { week_number: number }) => wk.week_number === i + 1);
        return w ? { sets: String(w.sets), reps: String(w.reps), rpe: w.rpe_target ? String(w.rpe_target) : '' } : emptyWeek();
      })
    });
  };

  const handleEditDurationChange = (d: 4 | 6 | 8) => {
    if (!editForm) return;
    const newWeeks = Array.from({ length: d }, (_, i) =>
      i < editForm.weeks.length ? editForm.weeks[i] : emptyWeek()
    );
    setEditForm({ ...editForm, blockDuration: d, weeks: newWeeks });
  };

  const handleCreateDurationChange = (d: 4 | 6 | 8) => {
    const newWeeks = Array.from({ length: d }, (_, i) =>
      i < createForm.weeks.length ? createForm.weeks[i] : emptyWeek()
    );
    setCreateForm({ ...createForm, blockDuration: d, weeks: newWeeks });
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editingId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const weeks = editForm.weeks.map((w, i) => ({
        weekNumber: i + 1,
        sets: parseInt(w.sets) || 3,
        reps: parseInt(w.reps) || 10,
        rpeTarget: parseInt(w.rpe) || null
      }));
      const res = await fetch(`${API_URL}/blocks/templates/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          blockDuration: editForm.blockDuration,
          weeks,
          clinicianId
        })
      });
      if (res.ok) {
        setEditingId(null);
        setEditForm(null);
        await fetchTemplates();
        // Re-expand to show updated data
        setExpandedId(editingId);
        await fetchTemplateWeeks(editingId);
      }
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setSaving(true);
    try {
      const weeks = createForm.weeks.map((w, i) => ({
        weekNumber: i + 1,
        sets: parseInt(w.sets) || 3,
        reps: parseInt(w.reps) || 10,
        rpeTarget: parseInt(w.rpe) || null
      }));
      const res = await fetch(`${API_URL}/blocks/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
          blockDuration: createForm.blockDuration,
          weeks,
          clinicianId
        })
      });
      if (res.ok) {
        setCreating(false);
        setCreateForm(makeEmptyForm());
        await fetchTemplates();
      }
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  const updateWeekField = (
    form: TemplateFormData,
    setForm: (f: TemplateFormData) => void,
    weekIdx: number,
    field: keyof WeekData,
    value: string
  ) => {
    const newWeeks = [...form.weeks];
    newWeeks[weekIdx] = { ...newWeeks[weekIdx], [field]: value };
    setForm({ ...form, weeks: newWeeks });
  };

  const renderWeekInputs = (form: TemplateFormData, setForm: (f: TemplateFormData) => void) => (
    <div className="mt-3 overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        {form.weeks.map((w, i) => (
          <div key={i} className="flex flex-col items-center gap-1 min-w-[80px]">
            <span className="text-[10px] font-semibold text-slate-500 uppercase">W{i + 1}</span>
            <div className="flex flex-col gap-1">
              <input
                type="number" min="1" max="20" value={w.sets}
                onChange={e => updateWeekField(form, setForm, i, 'sets', e.target.value)}
                placeholder="S" title="Sets"
                className="w-14 px-1.5 py-1 border border-slate-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
              />
              <input
                type="number" min="1" max="50" value={w.reps}
                onChange={e => updateWeekField(form, setForm, i, 'reps', e.target.value)}
                placeholder="R" title="Reps"
                className="w-14 px-1.5 py-1 border border-slate-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
              />
              <input
                type="number" min="1" max="10" value={w.rpe}
                onChange={e => updateWeekField(form, setForm, i, 'rpe', e.target.value)}
                placeholder="RPE" title="RPE Target"
                className="w-14 px-1.5 py-1 border border-slate-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 text-amber-700"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-1 text-[10px] text-slate-400">
        <span>Sets</span><span>Reps</span><span>RPE</span>
      </div>
    </div>
  );

  const renderDurationPicker = (
    current: 4 | 6 | 8,
    onChange: (d: 4 | 6 | 8) => void
  ) => (
    <div className="flex gap-1.5">
      {([4, 6, 8] as const).map(d => (
        <button
          key={d} onClick={() => onChange(d)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            current === d ? 'bg-primary-400 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {d}w
        </button>
      ))}
    </div>
  );

  const formatWeekSummary = (weeks: { week_number: number; sets: number; reps: number; rpe_target?: number | null }[]) => {
    return weeks
      .sort((a, b) => a.week_number - b.week_number)
      .map(w => {
        const rpe = w.rpe_target ? ` @${w.rpe_target}` : '';
        return `W${w.week_number}: ${w.sets}x${w.reps}${rpe}`;
      })
      .join('  |  ');
  };

  const myTemplates = templates.filter(t => t.createdBy === clinicianId && !t.isGlobal);
  const globalTemplates = templates.filter(t => t.isGlobal);

  const renderTemplateCard = (t: TemplateWithWeeksData, canEdit: boolean) => {
    const isExpanded = expandedId === t.id;
    const isEditing = editingId === t.id;

    return (
      <div key={t.id} className="bg-slate-50 rounded-lg ring-1 ring-slate-200 overflow-hidden">
        {/* Header row */}
        <div
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-100 transition-colors"
          onClick={() => handleExpand(t.id)}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isExpanded ? <ChevronDown size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{t.name}</p>
              {t.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{t.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-medium">
              {t.blockDuration}w
            </span>
            {canEdit && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); startEditing(t); }}
                  className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                  title="Edit template"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                  disabled={deletingId === t.id}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                  title="Delete template"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
            {!canEdit && <span className="text-xs text-slate-400 italic">Global</span>}
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-4 pb-3 border-t border-slate-200">
            {isEditing && editForm ? (
              // Edit mode
              <div className="pt-3 space-y-3">
                <div className="flex gap-3">
                  <input
                    type="text" value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Template name"
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400"
                  />
                  <input
                    type="text" value={editForm.description}
                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Description (optional)"
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500">Duration:</span>
                  {renderDurationPicker(editForm.blockDuration, handleEditDurationChange)}
                </div>
                {renderWeekInputs(editForm, (f) => setEditForm(f))}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editForm.name.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-400 hover:bg-primary-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                  >
                    <Check size={13} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditForm(null); }}
                    className="px-4 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // View mode — show week breakdown
              <div className="pt-3">
                {t.weeks ? (
                  <p className="text-xs text-slate-600 font-mono leading-relaxed">
                    {formatWeekSummary(t.weeks)}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic">Loading...</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-secondary-500">Progression Templates</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Create New Template */}
          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-600 rounded-lg text-sm font-medium transition-colors w-full justify-center"
            >
              <Plus size={16} />
              Create New Template
            </button>
          ) : (
            <div className="bg-primary-50/50 rounded-lg ring-1 ring-primary-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">New Progression Template</h3>
              <div className="flex gap-3">
                <input
                  type="text" value={createForm.name}
                  onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Template name (e.g. Linear Strength 3-6)"
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 bg-white"
                  autoFocus
                />
                <input
                  type="text" value={createForm.description}
                  onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Description (optional)"
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 bg-white"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-500">Duration:</span>
                {renderDurationPicker(createForm.blockDuration, handleCreateDurationChange)}
              </div>
              {renderWeekInputs(createForm, setCreateForm)}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={saving || !createForm.name.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-400 hover:bg-primary-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <Check size={13} />
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
                <button
                  onClick={() => { setCreating(false); setCreateForm(makeEmptyForm()); }}
                  className="px-4 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

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
                  <p className="text-sm text-slate-400 italic">No personal templates yet. Click "Create New Template" above.</p>
                ) : (
                  <div className="space-y-2">
                    {myTemplates.map(t => renderTemplateCard(t, true))}
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
                    {globalTemplates.map(t => renderTemplateCard(t, false))}
                  </div>
                </div>
              )}

              {templates.length === 0 && !creating && (
                <p className="text-sm text-slate-400 text-center py-4">
                  No templates yet. Create your first progression template above.
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
