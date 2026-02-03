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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-moveify-teal hover:text-moveify-teal-dark font-medium"
        >
          ← Back to Patients
        </button>
        <button
          onClick={onEdit}
          className="bg-moveify-teal text-white px-4 py-2 rounded-lg hover:bg-moveify-teal-dark font-medium flex items-center gap-2"
        >
          <Edit size={18} />
          Edit Profile
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'overview'
                ? 'text-moveify-teal'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <User size={18} className="inline mr-2" />
            Overview
            {activeTab === 'overview' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-moveify-teal"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'analytics'
                ? 'text-moveify-teal'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <TrendingUp size={18} className="inline mr-2" />
            Progress Analytics
            {activeTab === 'analytics' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-moveify-teal"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('education')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'education'
                ? 'text-moveify-teal'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BookOpen size={18} className="inline mr-2" />
            Education
            {activeTab === 'education' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-moveify-teal"></div>
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-start gap-6 mb-8">
          <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center">
            <User className="text-moveify-teal" size={48} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{patient.name}</h1>
            <p className="text-gray-600">{patient.condition}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <p className="text-sm text-gray-500 mb-1">Date of Birth</p>
            <p className="text-lg font-medium text-gray-900">{patient.dob}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Age</p>
            <p className="text-lg font-medium text-gray-900">{patient.age} years</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Email</p>
            <p className="text-lg font-medium text-gray-900">{patient.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Phone</p>
            <p className="text-lg font-medium text-gray-900">{patient.phone}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm text-gray-500 mb-1">Address</p>
            <p className="text-lg font-medium text-gray-900">{patient.address}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Date Added</p>
            <p className="text-lg font-medium text-gray-900">{patient.dateAdded}</p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Assigned Programs</h2>
            <button
              onClick={onAddProgram}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
            >
              <PlusCircle size={18} />
              Add Program
            </button>
          </div>
          {patient.assignedPrograms && patient.assignedPrograms.length > 0 ? (
            <div className="space-y-3">
              {patient.assignedPrograms.map((program, index) => {
                const completedCount = program.exercises.filter(e => e.completed).length;
                const totalExercises = program.exercises.length;

                return (
                  <div
                    key={program.config.id}
                    className="bg-primary-50 p-4 rounded-lg flex items-center justify-between"
                  >
                    <button
                      onClick={() => onViewProgram(index)}
                      className="flex-1 text-left hover:opacity-80 transition-opacity"
                    >
                      <h3 className="font-semibold text-moveify-navy">{program.config.name}</h3>
                      <p className="text-sm text-moveify-ocean mt-1">
                        {totalExercises} exercises · {completedCount} completed today
                      </p>
                      <p className="text-xs text-moveify-teal mt-1">
                        {program.config.frequency.join(', ')} · {program.config.duration}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => program.config.id && handleProgressProgram(program.config.id)}
                        disabled={progressingProgramId === program.config.id}
                        className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                        title="Progress program (weekly adjustment)"
                      >
                        {progressingProgramId === program.config.id ? (
                          <span className="animate-spin">⚡</span>
                        ) : (
                          <Zap size={18} />
                        )}
                      </button>
                      <button
                        onClick={() => onEditProgram(index)}
                        className="p-2 text-moveify-teal hover:bg-primary-100 rounded-lg transition-colors"
                        title="Edit program"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => {
                          if (program.config.id && program.config.name) {
                            onDeleteProgram(program.config.id, program.config.name);
                          }
                        }}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                        title="Delete program"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <p className="text-gray-500 mb-4">No programs assigned to this patient yet</p>
              <button
                onClick={onAddProgram}
                className="bg-moveify-teal text-white px-6 py-2 rounded-lg hover:bg-moveify-teal-dark font-medium inline-flex items-center gap-2"
              >
                <PlusCircle size={18} />
                Create First Program
              </button>
            </div>
          )}
        </div>
      </div>
        </div>
      ) : activeTab === 'analytics' ? (
        <ProgressAnalytics patientId={patient.id} apiUrl={API_URL} />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Education Modules</h2>
            <button
              onClick={() => setShowAssignEducationModal(true)}
              className="bg-moveify-teal text-white px-4 py-2 rounded-lg hover:bg-moveify-teal-dark font-medium flex items-center gap-2"
            >
              <PlusCircle size={18} />
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
