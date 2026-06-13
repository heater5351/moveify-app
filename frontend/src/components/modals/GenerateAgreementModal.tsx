import { useState, useEffect, useRef } from 'react';
import { X, Search, User, ChevronRight, Copy, Check } from 'lucide-react';
import { API_URL } from '../../config';
import { getAuthHeaders } from '../../utils/api';

interface ClinikoPatient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
}

type ProgramType = 'block_standard' | 'block_post_casual' | 'continuity' | 'ndis';

const BLOCK_TIERS = [
  { value: 'T1', label: 'Tier 1 — Foundation' },
  { value: 'T2', label: 'Tier 2 — Progress' },
  { value: 'T3', label: 'Tier 3 — Performance' },
];

const CONTINUITY_TIERS = [
  'Independent', 'Maintain', 'Evolve', 'Elite', 'Remote Weekly', 'Remote Fortnightly', 'App-Only',
].map((t) => ({ value: t, label: t }));

// NDIS line items + management types (mirror backend lib/ndis-agreement-content.js).
const NDIS_LINE_ITEMS = [
  { value: '15_200_0126_1_3', label: 'Improved Daily Living — EP (15_200_0126_1_3)' },
  { value: '12_027_0128_3_3', label: 'Improved Health & Wellbeing — EP advice (12_027_0128_3_3)' },
];
const NDIS_MGMT = [
  { value: 'plan_managed', label: 'Plan-managed' },
  { value: 'self_managed', label: 'Self-managed' },
];
const NDIS_RATE_CAP = 166.99;

const emptyNdis = {
  ndisNumber: '', planStart: '', planEnd: '',
  lineItem: '15_200_0126_1_3', rate: '166.99', managementType: 'plan_managed',
  delivery: 'In clinic', frequency: '1 × 60 min / week',
  travelApplicable: 'no', nonFaceToFace: 'yes',
  planManagerName: '', planManagerContact: '',
  scName: '', scOrg: '', scContact: '',
  repName: '', repRelationship: '', repAuthority: '',
  goals: '',
};

// Maps the UI program-type selection to the backend { tier, path } pair.
function resolvePathTier(programType: ProgramType, tier: string): { tier: string; path: string } {
  if (programType === 'continuity') return { tier, path: 'continuity' };
  return { tier, path: programType === 'block_post_casual' ? 'post_casual' : 'standard' };
}

interface GenerateAgreementModalProps {
  onClose: () => void;
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent text-sm';

// NDIS-specific generate fields. Participant name/DOB come from the linked Cliniko
// record at sign time, so they aren't entered here.
const NdisFields = ({ ndis, upd }: { ndis: typeof emptyNdis; upd: (k: keyof typeof emptyNdis, v: string) => void }) => (
  <div className="space-y-4 border-t border-slate-100 pt-4">
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Plan start</label>
        <input type="date" value={ndis.planStart} onChange={(e) => upd('planStart', e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Plan end</label>
        <input type="date" value={ndis.planEnd} onChange={(e) => upd('planEnd', e.target.value)} className={inputCls} />
      </div>
    </div>

    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">NDIS number</label>
      <input type="text" value={ndis.ndisNumber} onChange={(e) => upd('ndisNumber', e.target.value)} placeholder="43xxxxxxx" className={inputCls} />
    </div>

    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Line item</label>
      <select value={ndis.lineItem} onChange={(e) => upd('lineItem', e.target.value)} className={inputCls}>
        {NDIS_LINE_ITEMS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Rate ($/hr, cap ${NDIS_RATE_CAP.toFixed(2)})</label>
        <input type="number" step="0.01" max={NDIS_RATE_CAP} value={ndis.rate} onChange={(e) => upd('rate', e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Plan management</label>
        <select value={ndis.managementType} onChange={(e) => upd('managementType', e.target.value)} className={inputCls}>
          {NDIS_MGMT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
    </div>

    {ndis.managementType === 'plan_managed' && (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Plan manager name</label>
          <input type="text" value={ndis.planManagerName} onChange={(e) => upd('planManagerName', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Plan manager email / portal</label>
          <input type="text" value={ndis.planManagerContact} onChange={(e) => upd('planManagerContact', e.target.value)} className={inputCls} />
        </div>
      </div>
    )}

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Delivery</label>
        <input type="text" value={ndis.delivery} onChange={(e) => upd('delivery', e.target.value)} placeholder="In clinic / home / telehealth" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
        <input type="text" value={ndis.frequency} onChange={(e) => upd('frequency', e.target.value)} placeholder="1 × 60 min / week" className={inputCls} />
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Travel (home/community visits)</label>
        <select value={ndis.travelApplicable} onChange={(e) => upd('travelApplicable', e.target.value)} className={inputCls}>
          <option value="no">Not applicable — clinic-based</option>
          <option value="yes">Applicable — charge travel</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Non-face-to-face supports</label>
        <select value={ndis.nonFaceToFace} onChange={(e) => upd('nonFaceToFace', e.target.value)} className={inputCls}>
          <option value="yes">Claimable (reports, liaison, calls)</option>
          <option value="no">Not charged</option>
        </select>
      </div>
    </div>

    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Support coordinator</label>
        <input type="text" value={ndis.scName} onChange={(e) => upd('scName', e.target.value)} placeholder="Name" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">SC organisation</label>
        <input type="text" value={ndis.scOrg} onChange={(e) => upd('scOrg', e.target.value)} placeholder="Org" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">SC contact</label>
        <input type="text" value={ndis.scContact} onChange={(e) => upd('scContact', e.target.value)} placeholder="Phone / email" className={inputCls} />
      </div>
    </div>

    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Plan goals (one per line)</label>
      <textarea value={ndis.goals} onChange={(e) => upd('goals', e.target.value)} rows={3} placeholder="Improve functional capacity for daily tasks&#10;Increase independence with mobility" className={inputCls} />
    </div>

    <details className="text-sm">
      <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Authorised representative / nominee (optional)</summary>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <input type="text" value={ndis.repName} onChange={(e) => upd('repName', e.target.value)} placeholder="Name" className={inputCls} />
        <input type="text" value={ndis.repRelationship} onChange={(e) => upd('repRelationship', e.target.value)} placeholder="Relationship" className={inputCls} />
        <input type="text" value={ndis.repAuthority} onChange={(e) => upd('repAuthority', e.target.value)} placeholder="Authority (e.g. nominee)" className={inputCls} />
      </div>
    </details>
  </div>
);

export const GenerateAgreementModal = ({ onClose }: GenerateAgreementModalProps) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ClinikoPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<ClinikoPatient | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [programType, setProgramType] = useState<ProgramType>('block_standard');
  const [tier, setTier] = useState('T1');
  const [startDate, setStartDate] = useState('');
  const [ndis, setNdis] = useState(emptyNdis);
  const updNdis = (k: keyof typeof emptyNdis, v: string) => setNdis((s) => ({ ...s, [k]: v }));

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Keep the tier selection valid when switching program type.
  useEffect(() => {
    const valid = programType === 'continuity' ? CONTINUITY_TIERS : BLOCK_TIERS;
    if (!valid.some((t) => t.value === tier)) setTier(valid[0].value);
  }, [programType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (search.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        setSearchError('');
        try {
          const res = await fetch(`${API_URL}/cliniko/patients?q=${encodeURIComponent(search.trim())}`, {
            headers: await getAuthHeaders(),
          });
          const data = await res.json();
          if (res.ok) setResults(data.patients || []);
          else setSearchError(data.error || 'Could not search Cliniko');
        } catch {
          setSearchError('Connection error');
        } finally {
          setSearching(false);
        }
      }, 350);
    } else {
      setResults([]);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Builds the request body for the selected agreement type. NDIS is a separate
  // signature-only shape (kind:'ndis'); returns null on client-side validation
  // failure (after setting the error).
  const buildBody = (): Record<string, unknown> | null => {
    if (programType !== 'ndis') {
      const { tier: t, path } = resolvePathTier(programType, tier);
      return { clinikoPatientId: selected!.id, tier: t, path, startDate: startDate || null };
    }
    const rate = parseFloat(ndis.rate);
    if (!ndis.planStart || !ndis.planEnd) { setError('Plan start and end dates are required.'); return null; }
    if (!(rate > 0) || rate > NDIS_RATE_CAP) { setError(`Hourly rate must be between $0 and $${NDIS_RATE_CAP.toFixed(2)} (NDIS cap).`); return null; }
    if (ndis.managementType === 'plan_managed' && !ndis.planManagerName.trim()) { setError('Plan manager name is required for plan-managed participants.'); return null; }
    return {
      kind: 'ndis',
      clinikoPatientId: selected!.id,
      ndis: {
        ndisNumber: ndis.ndisNumber, planStart: ndis.planStart, planEnd: ndis.planEnd,
        lineItem: ndis.lineItem, rate, managementType: ndis.managementType,
        delivery: ndis.delivery, frequency: ndis.frequency,
        travelApplicable: ndis.travelApplicable === 'yes',
        nonFaceToFace: ndis.nonFaceToFace === 'yes',
        planManager: ndis.managementType === 'plan_managed'
          ? { name: ndis.planManagerName, contact: ndis.planManagerContact } : undefined,
        supportCoordinator: { name: ndis.scName, org: ndis.scOrg, contact: ndis.scContact },
        representative: { name: ndis.repName, relationship: ndis.repRelationship, authority: ndis.repAuthority },
        goals: ndis.goals.split('\n').map((s) => s.trim()).filter(Boolean),
      },
    };
  };

  const handleGenerate = async () => {
    setError('');
    if (!selected) { setError('Please select a patient from Cliniko'); return; }
    const body = buildBody();
    if (!body) return;
    setGenerating(true);
    try {
      const res = await fetch(`${API_URL}/agreements/generate`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) setLink(data.link);
      else setError(data.error || 'Failed to generate agreement link');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const tierOptions = programType === 'continuity' ? CONTINUITY_TIERS : BLOCK_TIERS;

  // Success view — show the generated link to copy / open.
  if (link) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-2xl font-bold font-display text-secondary-500">Agreement link ready</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
          </div>
          <p className="text-sm text-slate-600 mb-3">
            Send this link to <strong>{selected?.first_name} {selected?.last_name}</strong> or open it on the desk tablet for them to sign.
          </p>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <input readOnly value={link} className="flex-1 bg-transparent text-sm text-slate-700 outline-none" />
            <button onClick={copyLink} className="text-primary-400 hover:text-primary-600 flex items-center gap-1 text-sm font-medium">
              {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">The link expires in 14 days and can be used once.</p>
          <button onClick={onClose} className="mt-6 w-full px-4 py-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-2xl font-bold text-gray-900">Generate agreement link</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {/* Patient search */}
        {!selected ? (
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Patient (from Cliniko)</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Cliniko by name..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                autoFocus
              />
            </div>
            {searching && <p className="text-sm text-slate-400 mt-2">Searching...</p>}
            {searchError && <p className="text-sm text-red-500 mt-2">{searchError}</p>}
            {results.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                {results.map((cp) => (
                  <button
                    key={cp.id}
                    onClick={() => { setSelected(cp); setResults([]); setSearch(''); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                  >
                    <div className="w-8 h-8 bg-primary-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800">{cp.first_name} {cp.last_name}</p>
                      <p className="text-xs text-slate-400">{cp.email || 'No email'}{cp.date_of_birth ? ` · DOB: ${cp.date_of_birth}` : ''}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300" />
                  </button>
                ))}
              </div>
            )}
            {search.trim().length >= 2 && !searching && results.length === 0 && !searchError && (
              <p className="text-sm text-slate-400 mt-2">No patients found in Cliniko</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-lg px-4 py-2.5 mb-5">
            <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User size={12} className="text-primary-500" />
            </div>
            <p className="text-sm text-primary-700 font-medium flex-1">{selected.first_name} {selected.last_name}</p>
            <button onClick={() => setSelected(null)} className="text-primary-400 hover:text-primary-600 text-xs">Change</button>
          </div>
        )}

        {/* Program configuration */}
        {selected && (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Agreement type</label>
              <select
                value={programType}
                onChange={(e) => setProgramType(e.target.value as ProgramType)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent"
              >
                <option value="block_standard">Block — Standard</option>
                <option value="block_post_casual">Block — Post-Casual</option>
                <option value="continuity">Continuity</option>
                <option value="ndis">NDIS (signature only — no payment setup)</option>
              </select>
            </div>

            {programType !== 'ndis' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tier</label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                  >
                    {tierOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                  />
                </div>
              </>
            ) : (
              <NdisFields ndis={ndis} upd={updNdis} />
            )}
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleGenerate}
            disabled={generating || !selected}
            className="flex-1 px-4 py-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating...' : 'Generate link'}
          </button>
        </div>
      </div>
    </div>
  );
};
