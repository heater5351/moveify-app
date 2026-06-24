import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users, Phone, Mail, Building2, Loader2 } from 'lucide-react';
import type { Contact, ContactType } from '../types';
import { listContacts, CONTACT_TYPE_LABELS } from '../utils/contacts-api';
import { ContactModal } from './modals/ContactModal';

interface ContactsDirectoryProps {
  onNotification?: (message: string, type: 'success' | 'error') => void;
}

const TYPE_FILTERS: { value: ContactType | 'all'; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'gp', label: CONTACT_TYPE_LABELS.gp },
  { value: 'specialist', label: CONTACT_TYPE_LABELS.specialist },
  { value: 'support_coordinator', label: CONTACT_TYPE_LABELS.support_coordinator },
  { value: 'guardian', label: CONTACT_TYPE_LABELS.guardian },
  { value: 'other', label: CONTACT_TYPE_LABELS.other },
];

const TYPE_BADGE: Record<ContactType, string> = {
  gp: 'bg-primary-50 text-primary-700',
  specialist: 'bg-violet-50 text-violet-700',
  support_coordinator: 'bg-amber-50 text-amber-700',
  guardian: 'bg-rose-50 text-rose-700',
  other: 'bg-slate-100 text-slate-600',
};

// Compose a "Dr Jane Patel" style display name.
const displayName = (c: Contact) => [c.title, c.name].filter(Boolean).join(' ');

export const ContactsDirectory = ({ onNotification }: ContactsDirectoryProps) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContactType | 'all'>('all');
  const [modal, setModal] = useState<{ open: boolean; contact: Contact | null }>({ open: false, contact: null });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setContacts(await listContacts());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Client-side filter (the directory is small; avoids a round-trip per keystroke).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter(c => {
      if (typeFilter !== 'all' && c.contactType !== typeFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.organisation.toLowerCase().includes(q);
    });
  }, [contacts, query, typeFilter]);

  const handleSaved = (saved: Contact) => {
    setContacts(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx === -1) return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
      const next = [...prev];
      next[idx] = { ...next[idx], ...saved };
      return next;
    });
    setModal({ open: false, contact: null });
    onNotification?.(modal.contact ? 'Contact updated' : 'Contact added', 'success');
  };

  const handleDeleted = (id: number) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    setModal({ open: false, contact: null });
    onNotification?.('Contact deleted', 'success');
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-display text-slate-800">Contacts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Shared directory of GPs, specialists, support coordinators and family contacts.
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, contact: null })}
          className="flex items-center gap-2 bg-primary-400 hover:bg-primary-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={18} />
          Add contact
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or organisation…"
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ContactType | 'all')}
          className="px-4 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
        >
          {TYPE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-500">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          {contacts.length === 0 ? 'No contacts yet. Add your first one.' : 'No contacts match your search.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 divide-y divide-slate-100">
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setModal({ open: true, contact: c })}
              className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-800 truncate">{displayName(c)}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[c.contactType]}`}>
                    {c.contactType === 'specialist' && c.specialty ? c.specialty : CONTACT_TYPE_LABELS[c.contactType]}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                  {c.organisation && <span className="flex items-center gap-1"><Building2 size={13} />{c.organisation}</span>}
                  {c.phone && <span className="flex items-center gap-1"><Phone size={13} />{c.phone}</span>}
                  {c.email && <span className="flex items-center gap-1"><Mail size={13} />{c.email}</span>}
                </div>
              </div>
              {!!c.patientCount && (
                <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                  <Users size={13} />{c.patientCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {modal.open && (
        <ContactModal
          contact={modal.contact}
          onClose={() => setModal({ open: false, contact: null })}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
};
