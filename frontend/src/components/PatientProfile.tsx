import { useState, useEffect, useRef } from 'react';
import { Edit, User, Trash2, PlusCircle, TrendingUp, BookOpen, AlertTriangle, CheckCircle, ChevronDown, FileText, Mail, Link, RefreshCw, Search, ChevronRight, Activity, ClipboardList, Folder } from 'lucide-react';
import ScribeHistoryPage from './scribe/ScribeHistoryPage';
import AssessmentTrends from './scribe/AssessmentTrends';
import type { Patient, ClinicianFlag, BlockStatusResponse } from '../types/index.ts';
import { ProgressAnalytics } from './ProgressAnalytics';
import { PatientEducationModules } from './PatientEducationModules';
import { PatientFiles } from './PatientFiles';
import { AssignEducationModal } from './modals/AssignEducationModal';

// A single read-only label/value pair in the profile detail cards. Renders
// nothing when there is no value, so optional enrichment fields stay hidden
// until populated.
const DetailField = ({ label, value, className }: { label: string; value?: string | null; className?: string }) => {
  if (!value) return null;
  return (
    <div className={className}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
    </div>
  );
};
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';

interface PatientProfileProps {
  patient: Patient;
  onBack: () => void;
  onEdit: () => void;
  onViewProgram: (programIndex: number) => void;
  onEditProgram: (programIndex: number) => void;
  onDeleteProgram: (programId: number, programName: string) => void;
  onAddProgram: () => void;
  onOpenNote: (patientId: number, patientName: string, sessionId?: number) => void;
  activeNoteSessionId?: number | null;
  notesRefreshKey?: number;
  onPatientSynced?: (updates: Partial<Patient>) => void;
}

export const PatientProfile = ({ patient, onBack, onEdit, onViewProgram, onEditProgram, onDeleteProgram, onAddProgram, onOpenNote, activeNoteSessionId, notesRefreshKey, onPatientSynced }: PatientProfileProps) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'assessments' | 'education' | 'forms' | 'files' | 'notes'>('overview');
  const [showAssignEducationModal, setShowAssignEducationModal] = useState(false);
  const [educationModulesRefreshKey, setEducationModulesRefreshKey] = useState(0);
  const [flags, setFlags] = useState<ClinicianFlag[]>([]);
  const [showFlags, setShowFlags] = useState(false);
  const [blockMap, setBlockMap] = useState<Record<number, BlockStatusResponse>>({});
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cliniko link/sync state
  const [clinikoPatientId, setClinikoPatientId] = useState<string | null>(patient.clinikoPatientId ?? null);
  const [clinikoSyncedAt, setClinikoSyncedAt] = useState<string | null>(patient.clinikoSyncedAt ?? null);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<{ id: string; first_name: string; last_name: string; email: string | null; date_of_birth: string | null }[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const linkDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showLinkPanel || linkSearch.trim().length < 2) { setLinkResults([]); return; }
    if (linkDebounce.current) clearTimeout(linkDebounce.current);
    linkDebounce.current = setTimeout(async () => {
      setLinkLoading(true);
      try {
        const res = await fetch(`${API_URL}/cliniko/patients?q=${encodeURIComponent(linkSearch.trim())}`, { headers: await getAuthHeaders() });
        const data = await res.json();
        setLinkResults(res.ok ? (data.patients || []) : []);
      } catch { setLinkResults([]); }
      finally { setLinkLoading(false); }
    }, 350);
    return () => { if (linkDebounce.current) clearTimeout(linkDebounce.current); };
  }, [linkSearch, showLinkPanel]);

  const handleLinkCliniko = async (cpId: string) => {
    setLinkMsg(null);
    try {
      const res = await fetch(`${API_URL}/cliniko/link/${patient.id}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ clinikoPatientId: cpId }),
      });
      const data = await res.json();
      if (res.ok) {
        setClinikoPatientId(data.clinikoPatientId);
        setClinikoSyncedAt(data.clinikoSyncedAt);
        setShowLinkPanel(false);
        setLinkSearch('');
        setLinkMsg({ type: 'success', text: 'Linked to Cliniko' });
      } else {
        setLinkMsg({ type: 'error', text: data.error || 'Failed to link' });
      }
    } catch {
      setLinkMsg({ type: 'error', text: 'Network error' });
    }
  };

  const handleSyncCliniko = async () => {
    setSyncing(true);
    setLinkMsg(null);
    try {
      const res = await fetch(`${API_URL}/cliniko/sync/${patient.id}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setClinikoSyncedAt(data.clinikoSyncedAt);
        setLinkMsg({ type: 'success', text: 'Synced from Cliniko' });
        const updates: Partial<Patient> = { name: data.name, clinikoSyncedAt: data.clinikoSyncedAt };
        if (data.dob) updates.dob = data.dob;
        if (data.phone) updates.phone = data.phone;
        if (data.address) updates.address = data.address;
        // Cliniko-owned enrichment fields (see services/cliniko-sync.js)
        if (data.title) updates.title = data.title;
        if (data.preferredName) updates.preferredName = data.preferredName;
        if (data.occupation) updates.occupation = data.occupation;
        if (data.medicareNumber) updates.medicareNumber = data.medicareNumber;
        if (data.referralSource) updates.referralSource = data.referralSource;
        if (data.dvaNumber) updates.dvaNumber = data.dvaNumber;
        onPatientSynced?.(updates);
      } else {
        setLinkMsg({ type: 'error', text: data.error || 'Failed to sync' });
      }
    } catch {
      setLinkMsg({ type: 'error', text: 'Network error' });
    } finally {
      setSyncing(false);
    }
  };

  // Fetch unresolved flags for this patient's programs
  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const res = await fetch(`${API_URL}/blocks/flags`, {
          headers: await getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          // Filter to this patient only
          const patientFlags = (data.flags || []).filter((f: ClinicianFlag) => f.patientId === patient.id);
          setFlags(patientFlags);
        }
      } catch {
        // Flags are optional
      }
    };
    fetchFlags();
  }, [patient.id]);

  // Fetch block status for each program
  useEffect(() => {
    const programs = patient.assignedPrograms || [];
    if (programs.length === 0) return;
    const fetchBlocks = async () => {
      const results: Record<number, BlockStatusResponse> = {};
      await Promise.all(
        programs.map(async (p) => {
          const pid = p.config.id;
          if (!pid) return;
          try {
            const res = await fetch(`${API_URL}/blocks/${pid}`, {
              headers: await getAuthHeaders()
            });
            if (res.ok) {
              const data = await res.json();
              results[pid] = {
                hasBlock: data.has_block ?? data.hasBlock ?? false,
                id: data.id,
                programId: data.program_id ?? data.programId,
                blockDuration: data.block_duration ?? data.blockDuration,
                startDate: data.start_date ?? data.startDate,
                currentWeek: data.current_week ?? data.currentWeek,
                status: data.status,
              };
            }
          } catch {
            // Silent — block features just won't render
          }
        })
      );
      setBlockMap(results);
    };
    fetchBlocks();
  }, [patient.assignedPrograms]);

  const handleResendInvitation = async () => {
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch(`${API_URL}/invitations/generate`, {
        method: 'POST',
        headers: { ...await getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: patient.email,
          name: patient.name,
          dob: patient.dob,
          phone: patient.phone,
          address: patient.address,
          resendUserId: patient.id, // deterministic re-invite (disambiguates same-named spouses)
        }),
      });
      if (res.ok) {
        setResendMsg({ type: 'success', text: 'Invitation resent successfully.' });
      } else {
        const err = await res.json().catch(() => ({}));
        setResendMsg({ type: 'error', text: (err as { error?: string }).error || 'Failed to resend invitation.' });
      }
    } catch {
      setResendMsg({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setResending(false);
    }
  };

  const handleResolveFlag = async (flagId: number) => {
    try {
      await fetch(`${API_URL}/blocks/flags/${flagId}/resolve`, {
        method: 'PATCH',
        headers: await getAuthHeaders()
      });
      setFlags(prev => prev.filter(f => f.id !== flagId));
    } catch {
      // Silently ignore
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          onClick={onBack}
          className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors flex items-center gap-1"
        >
          ← Patients
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {patient.pendingSetup && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleResendInvitation}
                disabled={resending}
                className="bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 disabled:opacity-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm transition-colors shadow-sm"
              >
                <Mail size={15} />
                {resending ? 'Sending…' : 'Resend Invitation'}
              </button>
              {resendMsg && (
                <span className={`text-xs font-medium ${resendMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                  {resendMsg.text}
                </span>
              )}
            </div>
          )}
          {clinikoPatientId ? (
            <button
              onClick={handleSyncCliniko}
              disabled={syncing}
              title={clinikoSyncedAt ? `Last synced: ${new Date(clinikoSyncedAt).toLocaleDateString()}` : 'Sync from Cliniko'}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm transition-colors shadow-sm"
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync from Cliniko'}
            </button>
          ) : (
            <button
              onClick={() => setShowLinkPanel(v => !v)}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm transition-colors shadow-sm"
            >
              <Link size={15} />
              Link to Cliniko
            </button>
          )}
          <button
            onClick={onEdit}
            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm transition-colors shadow-sm"
          >
            <Edit size={15} />
            Edit Profile
          </button>
        </div>
      </div>

      {/* Cliniko link panel */}
      {showLinkPanel && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 px-5 py-4">
          <p className="text-sm font-medium text-slate-700 mb-3">Search Cliniko to link this patient</p>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-400 focus:border-transparent"
              autoFocus
            />
          </div>
          {linkLoading && <p className="text-xs text-slate-400">Searching...</p>}
          {linkResults.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {linkResults.map((cp) => (
                <button
                  key={cp.id}
                  onClick={() => handleLinkCliniko(cp.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{cp.first_name} {cp.last_name}</p>
                    <p className="text-xs text-slate-400">{cp.email || 'No email'}{cp.date_of_birth ? ` · ${cp.date_of_birth}` : ''}</p>
                  </div>
                  <ChevronRight size={13} className="text-slate-300" />
                </button>
              ))}
            </div>
          )}
          {linkSearch.trim().length >= 2 && !linkLoading && linkResults.length === 0 && (
            <p className="text-xs text-slate-400">No patients found</p>
          )}
        </div>
      )}

      {linkMsg && (
        <p className={`text-sm font-medium ${linkMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
          {linkMsg.text}
        </p>
      )}

      {/* Patient header card */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 px-4 md:px-7 py-4 md:py-6 flex items-center gap-4 md:gap-5">
        <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center border border-primary-100 flex-shrink-0">
          <User className="text-primary-400" size={26} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold font-display text-secondary-500 tracking-tight">{patient.name}</h1>
        </div>
        <div className="hidden md:grid grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">DOB</p>
            <p className="font-medium text-slate-700">{patient.dob}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Email</p>
            <p className="font-medium text-slate-700 truncate max-w-[160px]">{patient.email}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Phone</p>
            <p className="font-medium text-slate-700">{patient.phone}</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max">
          {[
            { id: 'overview', label: 'Overview', icon: <User size={15} /> },
            { id: 'analytics', label: 'Progress Analytics', icon: <TrendingUp size={15} /> },
            { id: 'assessments', label: 'Assessments', icon: <Activity size={15} /> },
            { id: 'education', label: 'Education', icon: <BookOpen size={15} /> },
            { id: 'forms', label: 'Forms', icon: <ClipboardList size={15} /> },
            { id: 'files', label: 'Files', icon: <Folder size={15} /> },
            { id: 'notes', label: 'Progress Notes', icon: <FileText size={15} /> },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === id
                  ? 'border-primary-400 text-primary-500'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <div className="space-y-5">
          {/* Flags banner */}
          {flags.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <button
                onClick={() => setShowFlags(!showFlags)}
                className="flex items-center justify-between w-full"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" />
                  <span className="text-sm font-semibold text-amber-800">
                    {flags.length} Unresolved Alert{flags.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-amber-500 transition-transform ${showFlags ? 'rotate-180' : ''}`}
                />
              </button>
              {showFlags && (
                <div className="mt-3 space-y-2">
                  {flags.map(flag => (
                    <div key={flag.id} className="bg-white rounded-lg p-3 border border-amber-100 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            flag.flagType === 'pain_flare'
                              ? 'bg-red-100 text-red-700'
                              : flag.flagType === 'block_complete'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {flag.flagType === 'pain_flare' ? 'Pain Flare' : flag.flagType === 'block_complete' ? 'Block Complete' : 'Performance Hold'}
                          </span>
                          <span className="text-xs text-slate-400">{flag.flagDate}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{flag.flagReason}</p>
                      </div>
                      <button
                        onClick={() => handleResolveFlag(flag.id)}
                        className="flex-shrink-0 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                        title="Mark as resolved"
                      >
                        <CheckCircle size={15} />
                        Resolve
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Detail fields */}
          <div className="bg-white rounded-xl ring-1 ring-slate-200 p-6 space-y-6">
            {/* Personal */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Patient Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                <DetailField label="Title" value={patient.title} />
                <DetailField label="Preferred Name" value={patient.preferredName} />
                <DetailField label="Date of Birth" value={patient.dob} />
                <DetailField label="Age" value={`${patient.age} years`} />
                <DetailField label="Sex" value={patient.sex} />
                <DetailField label="Pronouns" value={patient.pronouns} />
                <DetailField label="Occupation" value={patient.occupation} />
                <DetailField label="Date Added" value={patient.dateAdded} />
              </div>
            </div>

            {/* Contact */}
            <div className="pt-5 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <DetailField label="Email" value={patient.email} />
                <DetailField label="Phone" value={patient.phone} />
                <DetailField label="Address" value={patient.address} className="md:col-span-3" />
              </div>
            </div>

            {/* Emergency contact */}
            {(patient.emergencyContactName || patient.emergencyContactRelationship || patient.emergencyContactPhone) && (
              <div className="pt-5 border-t border-slate-100">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Emergency Contact</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                  <DetailField label="Name" value={patient.emergencyContactName} />
                  <DetailField label="Relationship" value={patient.emergencyContactRelationship} />
                  <DetailField label="Phone" value={patient.emergencyContactPhone} />
                </div>
              </div>
            )}

            {/* Referral & funding */}
            {(patient.referralSource || patient.referringGp || patient.medicareNumber || patient.dvaNumber || patient.privateHealthFund || patient.privateHealthMemberNumber) && (
              <div className="pt-5 border-t border-slate-100">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Referral &amp; Funding</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                  <DetailField label="Referral Source" value={patient.referralSource} />
                  <DetailField label="Referring GP" value={patient.referringGp} />
                  <DetailField label="Medicare" value={patient.medicareNumber} />
                  <DetailField label="DVA" value={patient.dvaNumber} />
                  <DetailField label="Health Fund" value={patient.privateHealthFund} />
                  <DetailField label="Member No." value={patient.privateHealthMemberNumber} />
                </div>
              </div>
            )}
          </div>

          {/* Programs */}
          <div className="bg-white rounded-xl ring-1 ring-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Assigned Programs</h2>
              <button
                onClick={onAddProgram}
                className="bg-primary-400 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 text-sm transition-colors shadow-sm"
              >
                <PlusCircle size={15} />
                Add Program
              </button>
            </div>
            {patient.assignedPrograms && patient.assignedPrograms.length > 0 ? (
              <div className="space-y-2.5">
                {patient.assignedPrograms.map((program, index) => {
                  const totalExercises = program.exercises.length;

                  return (
                    <div
                      key={program.config.id ?? `program-${index}`}
                      className="ring-1 ring-slate-200 rounded-lg p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <button
                        onClick={() => onViewProgram(index)}
                        className="flex-1 text-left"
                      >
                        <h3 className="font-medium text-slate-800 text-sm">{program.config.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {totalExercises} exercises
                        </p>
                        <p className="text-xs text-primary-500 mt-0.5">
                          {program.config.frequency.join(', ')} · {program.config.duration}
                        </p>
                        {program.config.id && blockMap[program.config.id]?.hasBlock && (
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${
                            blockMap[program.config.id].status === 'active'
                              ? 'bg-emerald-100 text-emerald-700'
                              : blockMap[program.config.id].status === 'paused'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            Wk {blockMap[program.config.id].currentWeek}/{blockMap[program.config.id].blockDuration} · {blockMap[program.config.id].status && blockMap[program.config.id].status!.charAt(0).toUpperCase() + blockMap[program.config.id].status!.slice(1)}
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1 ml-4">
                        <button
                          onClick={() => onEditProgram(index)}
                          className="p-2 text-slate-500 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit program"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (program.config.id && program.config.name) {
                              onDeleteProgram(program.config.id, program.config.name);
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete program"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-50 rounded-lg p-8 text-center ring-1 ring-slate-100">
                <p className="text-slate-500 text-sm mb-4">No programs assigned yet</p>
                <button
                  onClick={onAddProgram}
                  className="bg-primary-400 hover:bg-primary-500 text-white px-5 py-2 rounded-lg font-medium inline-flex items-center gap-2 text-sm transition-colors"
                >
                  <PlusCircle size={15} />
                  Create First Program
                </button>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'analytics' ? (
        <ProgressAnalytics patientId={patient.id} apiUrl={API_URL} assignedPrograms={patient.assignedPrograms} />
      ) : activeTab === 'assessments' ? (
        <AssessmentTrends patientId={patient.id} />
      ) : activeTab === 'notes' ? (
          <div>
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-sm font-semibold text-slate-700">Progress Notes</h2>
              <button
                onClick={() => onOpenNote(patient.id, patient.name)}
                className="flex-shrink-0 bg-primary-400 hover:bg-primary-500 active:scale-[0.98] text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-1.5 text-sm transition shadow-sm"
              >
                <FileText size={15} />
                New Progress Note
              </button>
            </div>
            <ScribeHistoryPage
              key={notesRefreshKey}
              patientId={patient.id}
              activeNoteSessionId={activeNoteSessionId}
              onViewSession={(sessionId, _name, _pid, _at, status, _hasNote) => {
                if (status === 'recording' || status === 'completed') {
                  onOpenNote(patient.id, patient.name, sessionId);
                }
              }}
            />
          </div>
      ) : activeTab === 'forms' ? (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-10">
          <div className="max-w-md mx-auto text-center">
            <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center border border-primary-100 mx-auto mb-4">
              <ClipboardList className="text-primary-400" size={26} />
            </div>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-1.5">Patient forms</h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">
              Send intake, consent, and screening forms for {patient.name.split(' ')[0]} to complete on their own device.
              Submitted responses will appear here against their record.
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              Coming soon
            </span>
          </div>
        </div>
      ) : activeTab === 'files' ? (
        <PatientFiles patientId={patient.id} />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-700">Education Modules</h2>
            <button
              onClick={() => setShowAssignEducationModal(true)}
              className="bg-primary-400 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 text-sm transition-colors shadow-sm"
            >
              <PlusCircle size={15} />
              Assign Module
            </button>
          </div>
          <PatientEducationModules
            key={educationModulesRefreshKey}
            patientId={patient.id}
            isPatientView={false}
          />
          {showAssignEducationModal && (
            <AssignEducationModal
              patientId={patient.id}
              patientName={patient.name}
              onClose={() => setShowAssignEducationModal(false)}
              onAssigned={() => {
                setEducationModulesRefreshKey(prev => prev + 1);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};
