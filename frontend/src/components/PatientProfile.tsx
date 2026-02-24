import { useState, useEffect } from 'react';
import { Edit, User, Trash2, PlusCircle, TrendingUp, BookOpen, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react';
import type { Patient, ClinicianFlag, BlockStatusResponse } from '../types/index.ts';
import { ProgressAnalytics } from './ProgressAnalytics';
import { PatientEducationModules } from './PatientEducationModules';
import { AssignEducationModal } from './modals/AssignEducationModal';
import { API_URL } from '../config';

interface PatientProfileProps {
  patient: Patient;
  onBack: () => void;
  onEdit: () => void;
  onViewProgram: (programIndex: number) => void;
  onEditProgram: (programIndex: number) => void;
  onDeleteProgram: (programId: number, programName: string) => void;
  onAddProgram: () => void;
  clinicianId?: number;
}

export const PatientProfile = ({ patient, onBack, onEdit, onViewProgram, onEditProgram, onDeleteProgram, onAddProgram, clinicianId }: PatientProfileProps) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'education'>('overview');
  const [showAssignEducationModal, setShowAssignEducationModal] = useState(false);
  const [educationModulesRefreshKey, setEducationModulesRefreshKey] = useState(0);
  const [flags, setFlags] = useState<ClinicianFlag[]>([]);
  const [showFlags, setShowFlags] = useState(false);
  const [blockMap, setBlockMap] = useState<Record<number, BlockStatusResponse>>({});

  // Fetch unresolved flags for this patient's programs
  useEffect(() => {
    if (!clinicianId) return;
    const fetchFlags = async () => {
      try {
        const res = await fetch(`${API_URL}/blocks/flags/${clinicianId}`);
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
  }, [clinicianId, patient.id]);

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
            const res = await fetch(`${API_URL}/blocks/${pid}`);
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

  const handleResolveFlag = async (flagId: number) => {
    try {
      await fetch(`${API_URL}/blocks/flags/${flagId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: clinicianId })
      });
      setFlags(prev => prev.filter(f => f.id !== flagId));
    } catch {
      // Silently ignore
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors flex items-center gap-1"
        >
          ← Patients
        </button>
        <button
          onClick={onEdit}
          className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm transition-colors shadow-sm"
        >
          <Edit size={15} />
          Edit Profile
        </button>
      </div>

      {/* Patient header card */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 px-7 py-6 flex items-center gap-5">
        <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center border border-primary-100 flex-shrink-0">
          <User className="text-primary-400" size={26} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold font-display text-secondary-500 tracking-tight">{patient.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{patient.condition}</p>
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
      <div className="border-b border-slate-200">
        <div className="flex gap-1">
          {[
            { id: 'overview', label: 'Overview', icon: <User size={15} /> },
            { id: 'analytics', label: 'Progress Analytics', icon: <TrendingUp size={15} /> },
            { id: 'education', label: 'Education', icon: <BookOpen size={15} /> },
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
          <div className="bg-white rounded-xl ring-1 ring-slate-200 p-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Patient Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <p className="text-xs text-slate-400 mb-1">Date of Birth</p>
                <p className="text-sm font-medium text-slate-800">{patient.dob}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Age</p>
                <p className="text-sm font-medium text-slate-800">{patient.age} years</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Date Added</p>
                <p className="text-sm font-medium text-slate-800">{patient.dateAdded}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-slate-400 mb-1">Address</p>
                <p className="text-sm font-medium text-slate-800">{patient.address}</p>
              </div>
            </div>
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
                  const completedCount = program.exercises.filter(e => e.completed).length;
                  const totalExercises = program.exercises.length;

                  return (
                    <div
                      key={program.config.id}
                      className="ring-1 ring-slate-200 rounded-lg p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <button
                        onClick={() => onViewProgram(index)}
                        className="flex-1 text-left"
                      >
                        <h3 className="font-medium text-slate-800 text-sm">{program.config.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {totalExercises} exercises · {completedCount} completed today
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
        <ProgressAnalytics patientId={patient.id} apiUrl={API_URL} />
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
