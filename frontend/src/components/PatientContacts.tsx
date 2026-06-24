import { useEffect, useRef, useState } from 'react';
import { Plus, Search, Star, ShieldAlert, Trash2, Loader2, Building2, Phone, Mail } from 'lucide-react';
import type { Contact, PatientContactLink } from '../types';
import {
  listContacts, linkContact, updatePatientContact, unlinkContact, CONTACT_TYPE_LABELS,
} from '../utils/contacts-api';
import { ContactModal } from './modals/ContactModal';

interface PatientContactsProps {
  patientId: number;
  contacts: PatientContactLink[];
  onReload: () => Promise<void> | void;
}

const displayName = (c: Contact) => [c.title, c.name].filter(Boolean).join(' ');

export const PatientContacts = ({ patientId, contacts, onReload }: PatientContactsProps) => {
  const [busyLinkId, setBusyLinkId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Link-existing search
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const linkedIds = new Set(contacts.map(l => l.contact.id));

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!search.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await listContacts({ q: search.trim() });
        setResults(found.filter(c => !linkedIds.has(c.id)));
      } catch { /* non-fatal — search just shows nothing */ }
      finally { setSearching(false); }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, contacts]);

  const reload = async () => { await onReload(); };

  // The PUT endpoint replaces all three fields each call, so always send the
  // full current state with the one change applied.
  const saveLink = async (
    link: PatientContactLink,
    patch: Partial<Pick<PatientContactLink, 'relationship' | 'isReportRecipient' | 'isEmergency'>>,
  ) => {
    setBusyLinkId(link.linkId);
    setError('');
    try {
      await updatePatientContact(patientId, link.linkId, {
        relationship: patch.relationship ?? link.relationship,
        isReportRecipient: patch.isReportRecipient ?? link.isReportRecipient,
        isEmergency: patch.isEmergency ?? link.isEmergency,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update contact');
    } finally {
      setBusyLinkId(null);
    }
  };

  const handleLinkExisting = async (contactId: number) => {
    setError('');
    try {
      await linkContact(patientId, { contactId });
      setSearch('');
      setResults([]);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link contact');
    }
  };

  const handleUnlink = async (link: PatientContactLink) => {
    setBusyLinkId(link.linkId);
    setError('');
    try {
      await unlinkContact(patientId, link.linkId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlink contact');
    } finally {
      setBusyLinkId(null);
    }
  };

  // A new contact created from this tab is linked immediately.
  const handleCreated = async (created: Contact) => {
    setShowCreate(false);
    try {
      await linkContact(patientId, { contactId: created.id });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link new contact');
    }
  };

  return (
    <div className="space-y-5">
      {/* Add / link controls */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Link a contact</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-primary-400 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            New contact
          </button>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the directory by name or organisation…"
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
          />
        </div>
        {search.trim() && (
          <div className="mt-2 border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {searching ? (
              <div className="flex items-center justify-center py-4 text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
            ) : results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400">No matching unlinked contacts. Use “New contact” to add one.</div>
            ) : results.map(c => (
              <button
                key={c.id}
                onClick={() => handleLinkExisting(c.id)}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{displayName(c)}</span>
                  <span className="text-xs text-slate-400 ml-2">
                    {c.contactType === 'specialist' && c.specialty ? c.specialty : CONTACT_TYPE_LABELS[c.contactType]}
                    {c.organisation ? ` · ${c.organisation}` : ''}
                  </span>
                </span>
                <Plus size={16} className="text-primary-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Linked contacts */}
      {contacts.length === 0 ? (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-10 text-center text-slate-400 text-sm">
          No contacts linked yet. Search above or create a new contact.
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map(link => {
            const c = link.contact;
            const busy = busyLinkId === link.linkId;
            return (
              <div key={link.linkId} className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800">{displayName(c)}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                        {c.contactType === 'specialist' && c.specialty ? c.specialty : CONTACT_TYPE_LABELS[c.contactType]}
                      </span>
                      {link.isReportRecipient && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-medium">Report recipient</span>
                      )}
                      {link.isEmergency && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium">Emergency</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                      {c.organisation && <span className="flex items-center gap-1"><Building2 size={13} />{c.organisation}</span>}
                      {c.phone && <span className="flex items-center gap-1"><Phone size={13} />{c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail size={13} />{c.email}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnlink(link)}
                    disabled={busy}
                    title="Unlink from this patient"
                    className="text-slate-400 hover:text-red-500 p-1 shrink-0 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <input
                    type="text"
                    defaultValue={link.relationship}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== link.relationship) saveLink(link, { relationship: v });
                    }}
                    placeholder="Relationship (e.g. Referring GP, Mother)"
                    className="flex-1 min-w-[180px] px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
                  />
                  <button
                    onClick={() => saveLink(link, { isReportRecipient: !link.isReportRecipient })}
                    disabled={busy}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                      link.isReportRecipient
                        ? 'bg-primary-50 border-primary-200 text-primary-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <Star size={14} className={link.isReportRecipient ? 'fill-primary-400 text-primary-400' : ''} />
                    Report recipient
                  </button>
                  <button
                    onClick={() => saveLink(link, { isEmergency: !link.isEmergency })}
                    disabled={busy}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                      link.isEmergency
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <ShieldAlert size={14} />
                    Emergency
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <ContactModal
          contact={null}
          onClose={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}
    </div>
  );
};
