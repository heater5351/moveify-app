import { useState, useMemo } from 'react';
import { Search, RefreshCw, AlertTriangle, User, ChevronUp, ChevronDown } from 'lucide-react';
import type { Patient } from '../types/index.ts';

export type AdherenceStatus = 'on-track' | 'slipping' | 'at-risk' | 'fallen-off';

export interface AdherenceRow {
  patientId: number;
  name: string;
  activeProgramCount: number;
  completionRate: number;
  daysSinceLastActivity: number | null;
  lastActivity: string | null;
  painAlert: { maxPain: number; date: string } | null;
  status: AdherenceStatus;
}

interface DashboardPageProps {
  rows: AdherenceRow[];
  loading: boolean;
  days: number;
  noActiveProgramCount: number;
  patients: Patient[];
  onViewPatient: (patient: Patient) => void;
  onRefresh: () => void;
}

type FilterKey = 'all' | 'attention' | 'on-track';
type SortKey = 'attention' | 'name' | 'rate' | 'activity';

const STATUS_META: Record<AdherenceStatus, { label: string; badge: string; rank: number }> = {
  'fallen-off': { label: 'Fallen off', badge: 'bg-red-50 text-red-700 border-red-200', rank: 0 },
  'at-risk': { label: 'At risk', badge: 'bg-orange-50 text-orange-700 border-orange-200', rank: 1 },
  'slipping': { label: 'Slipping', badge: 'bg-amber-50 text-amber-700 border-amber-200', rank: 2 },
  'on-track': { label: 'On track', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', rank: 3 },
};

function lastActivityLabel(days: number | null): string {
  if (days == null) return 'No activity yet';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function barColor(status: AdherenceStatus): string {
  if (status === 'on-track') return 'bg-emerald-500';
  if (status === 'slipping') return 'bg-amber-500';
  return 'bg-red-500';
}

export const DashboardPage = ({
  rows, loading, days, noActiveProgramCount, patients, onViewPatient, onRefresh,
}: DashboardPageProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('attention');
  const [sortAsc, setSortAsc] = useState(true);

  const counts = useMemo(() => {
    const c = { 'on-track': 0, 'slipping': 0, 'at-risk': 0, 'fallen-off': 0, pain: 0 };
    rows.forEach(r => { c[r.status]++; if (r.painAlert) c.pain++; });
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const query = searchQuery.toLowerCase();
    let result = rows.filter(r => r.name.toLowerCase().includes(query));

    if (filter === 'attention') {
      result = result.filter(r => r.status !== 'on-track' || r.painAlert);
    } else if (filter === 'on-track') {
      result = result.filter(r => r.status === 'on-track' && !r.painAlert);
    }

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'rate') return a.completionRate - b.completionRate;
      if (sortKey === 'activity') {
        const av = a.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER;
        const bv = b.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER;
        return av - bv;
      }
      // 'attention' (default, worst first): pain → status rank → rate asc
      if (!!a.painAlert !== !!b.painAlert) return a.painAlert ? -1 : 1;
      const rankDiff = STATUS_META[a.status].rank - STATUS_META[b.status].rank;
      if (rankDiff !== 0) return rankDiff;
      return a.completionRate - b.completionRate;
    });
    if (!sortAsc) sorted.reverse();
    return sorted;
  }, [rows, searchQuery, filter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(prev => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const handleRowClick = (patientId: number) => {
    const patient = patients.find(p => p.id === patientId);
    if (patient) onViewPatient(patient);
  };

  const SortIcon = ({ active }: { active: boolean }) =>
    active ? (sortAsc ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : null;

  const summaryCards: { key: FilterKey | 'pain'; label: string; value: number; tone: string }[] = [
    { key: 'attention', label: 'At risk', value: counts['at-risk'], tone: 'text-orange-600' },
    { key: 'attention', label: 'Fallen off', value: counts['fallen-off'], tone: 'text-red-600' },
    { key: 'attention', label: 'Slipping', value: counts['slipping'], tone: 'text-amber-600' },
    { key: 'on-track', label: 'On track', value: counts['on-track'], tone: 'text-emerald-600' },
    { key: 'pain', label: 'Pain flags', value: counts.pain, tone: 'text-red-600' },
  ];

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="text-xl md:text-2xl font-semibold font-display text-secondary-500 tracking-tight">Dashboard</h2>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
        <p className="text-sm text-slate-500">Exercise adherence over the last {days} days · active programs only</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {summaryCards.map((card, i) => (
          <button
            key={i}
            onClick={() => card.key !== 'pain' && setFilter(card.key as FilterKey)}
            className="text-left bg-white rounded-xl ring-1 ring-slate-200 px-4 py-3.5 hover:ring-slate-300 transition-all"
          >
            <p className={`text-2xl font-semibold ${card.tone}`}>{card.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg ring-1 ring-slate-200 p-1">
          {([['all', 'All'], ['attention', 'Needs attention'], ['on-track', 'On track']] as [FilterKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                filter === key ? 'bg-primary-400 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 bg-white rounded-xl ring-1 ring-slate-200">
          <p className="text-slate-500 text-sm">Loading adherence…</p>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl ring-1 ring-slate-200">
          <p className="text-slate-500 text-sm">
            {rows.length === 0 ? 'No patients with an active program' : 'No patients match this view'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 overflow-hidden">
          {/* Header — desktop */}
          <div className="hidden md:grid border-b border-slate-100 px-6 py-3 grid-cols-12 gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wide items-center">
            <button onClick={() => toggleSort('name')} className="col-span-3 flex items-center gap-1 hover:text-slate-700 uppercase">
              Patient <SortIcon active={sortKey === 'name'} />
            </button>
            <div className="col-span-2">Status</div>
            <button onClick={() => toggleSort('rate')} className="col-span-3 flex items-center gap-1 hover:text-slate-700 uppercase">
              Adherence <SortIcon active={sortKey === 'rate'} />
            </button>
            <button onClick={() => toggleSort('activity')} className="col-span-2 flex items-center gap-1 hover:text-slate-700 uppercase">
              Last activity <SortIcon active={sortKey === 'activity'} />
            </button>
            <div className="col-span-2">Pain</div>
          </div>

          <div className="divide-y divide-slate-100">
            {visibleRows.map(row => (
              <div
                key={row.patientId}
                onClick={() => handleRowClick(row.patientId)}
                className="px-4 md:px-6 py-3.5 flex items-center gap-3 md:grid md:grid-cols-12 md:gap-4 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors"
              >
                {/* Mobile */}
                <div className="md:hidden flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-primary-50 rounded-full flex items-center justify-center border border-primary-100 flex-shrink-0">
                    <User className="text-primary-400" size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-slate-900 text-base truncate">{row.name}</h3>
                      <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_META[row.status].badge}`}>
                        {STATUS_META[row.status].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-600 font-medium">{row.completionRate}%</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500">{lastActivityLabel(row.daysSinceLastActivity)}</span>
                      {row.painAlert && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-red-600">
                          <AlertTriangle size={12} /> {row.painAlert.maxPain}/10
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Desktop */}
                <div className="hidden md:flex col-span-3 items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-primary-50 rounded-full flex items-center justify-center border border-primary-100 flex-shrink-0">
                    <User className="text-primary-400" size={16} />
                  </div>
                  <h3 className="font-medium text-slate-900 text-sm truncate">{row.name}</h3>
                </div>
                <div className="hidden md:block col-span-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_META[row.status].badge}`}>
                    {STATUS_META[row.status].label}
                  </span>
                </div>
                <div className="hidden md:flex col-span-3 items-center gap-2.5">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[120px]">
                    <div className={`h-full rounded-full ${barColor(row.status)}`} style={{ width: `${row.completionRate}%` }} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 tabular-nums">{row.completionRate}%</span>
                </div>
                <div className="hidden md:block col-span-2">
                  <span className="text-sm text-slate-500">{lastActivityLabel(row.daysSinceLastActivity)}</span>
                </div>
                <div className="hidden md:block col-span-2">
                  {row.painAlert ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertTriangle size={13} /> {row.painAlert.maxPain}/10
                    </span>
                  ) : (
                    <span className="text-sm text-slate-300">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {noActiveProgramCount > 0 && (
        <p className="text-xs text-slate-400 mt-4">
          {noActiveProgramCount} patient{noActiveProgramCount !== 1 ? 's' : ''} {noActiveProgramCount !== 1 ? 'have' : 'has'} no active program (not shown).
        </p>
      )}
    </>
  );
};
