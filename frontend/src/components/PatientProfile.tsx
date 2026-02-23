import { useState } from 'react';
import { Edit, User, Trash2, PlusCircle, TrendingUp, Zap, BookOpen } from 'lucide-react';
import type { Patient } from '../types/index.ts';
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
}

export const PatientProfile = ({ patient, onBack, onEdit, onViewProgram, onEditProgram, onDeleteProgram, onAddProgram }: PatientProfileProps) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'education'>('overview');
  const [progressingProgramId, setProgressingProgramId] = useState<number | null>(null);
  const [showAssignEducationModal, setShowAssignEducationModal] = useState(false);
  const [educationModulesRefreshKey, setEducationModulesRefreshKey] = useState(0);

  const handleProgressProgram = async (programId: number) => {
    if (!confirm('This will analyze the last week of data and adjust the program based on progression gates. Continue?')) {
      return;
    }

    setProgressingProgramId(programId);
    try {
      const response = await fetch(`${API_URL}/programs/${programId}/progress`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to progress program');
      }

      const result = await response.json();

      alert(
        `Program progressed successfully!\n\n` +
        `${result.adjustments.length} exercise(s) adjusted.\n` +
        `Now on Week ${result.nextWeek} of Block ${result.blockNumber}`
      );

      // Refresh the page to show updated values
      window.location.reload();
    } catch (error) {
      console.error('Failed to progress program:', error);
      alert('Failed to progress program. Please try again.');
    } finally {
      setProgressingProgramId(null);
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
                      </button>
                      <div className="flex items-center gap-1 ml-4">
                        <button
                          onClick={() => program.config.id && handleProgressProgram(program.config.id)}
                          disabled={progressingProgramId === program.config.id}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Progress program"
                        >
                          {progressingProgramId === program.config.id ? (
                            <span className="animate-spin inline-block">⚡</span>
                          ) : (
                            <Zap size={16} />
                          )}
                        </button>
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
