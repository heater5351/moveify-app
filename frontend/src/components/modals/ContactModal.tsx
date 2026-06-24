import { useState } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import type { Contact, ContactType } from '../../types';
import {
  createContact, updateContact, deleteContact,
  CONTACT_TYPE_LABELS, type ContactInput,
} from '../../utils/contacts-api';

interface ContactModalProps {
  contact: Contact | null;        // null → create mode
  onClose: () => void;
  onSaved: (contact: Contact) => void;
  onDeleted?: (id: number) => void;
}

const TYPE_ORDER: ContactType[] = ['gp', 'specialist', 'support_coordinator', 'guardian', 'other'];

const inputCls = "w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none";
const labelCls = "block text-xs font-medium text-slate-500 mb-1.5";

export const ContactModal = ({ contact, onClose, onSaved, onDeleted }: ContactModalProps) => {
  const editing = !!contact;
  const [form, setForm] = useState<ContactInput>({
    contactType: contact?.contactType || 'gp',
    title: contact?.title || '',
    name: contact?.name || '',
    organisation: contact?.organisation || '',
    specialty: contact?.specialty || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    address: contact?.address || '',
    notes: contact?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<ContactInput>) => setForm(f => ({ ...f, ...patch }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = editing
        ? await updateContact(contact!.id, form)
        : await createContact(form);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save contact');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setDeleting(true);
    setError('');
    try {
      await deleteContact(contact!.id);
      onDeleted?.(contact!.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete contact');
      setDeleting(false);
    }
  };

  // Organisation label adapts to the contact type (practice vs NDIS org).
  const orgLabel = form.contactType === 'support_coordinator' ? 'Organisation / plan manager'
    : form.contactType === 'guardian' || form.contactType === 'other' ? 'Organisation'
    : 'Practice name';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold font-display text-slate-800">
            {editing ? 'Edit Contact' : 'New Contact'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type</label>
              <select
                value={form.contactType}
                onChange={(e) => set({ contactType: e.target.value as ContactType })}
                className={`${inputCls} bg-white`}
              >
                {TYPE_ORDER.map(t => <option key={t} value={t}>{CONTACT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Title</label>
              <input
                type="text" value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="e.g. Dr" className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Name <span className="text-red-400">*</span></label>
            <input
              type="text" value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Full name or surname" className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{orgLabel}</label>
              <input
                type="text" value={form.organisation}
                onChange={(e) => set({ organisation: e.target.value })}
                className={inputCls}
              />
            </div>
            {form.contactType === 'specialist' && (
              <div>
                <label className={labelCls}>Specialty</label>
                <input
                  type="text" value={form.specialty}
                  onChange={(e) => set({ specialty: e.target.value })}
                  placeholder="e.g. Orthopaedic surgeon" className={inputCls}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Address</label>
            <input type="text" value={form.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes} onChange={(e) => set({ notes: e.target.value })}
              rows={2} className={`${inputCls} resize-y`}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
          >
            Cancel
          </button>
          {editing && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium flex items-center gap-2 disabled:opacity-60"
            >
              {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 px-4 py-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 size={18} className="animate-spin" />}
            {editing ? 'Save Changes' : 'Create Contact'}
          </button>
        </div>
      </div>
    </div>
  );
};
