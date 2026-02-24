import { useState, useEffect } from 'react';
import { Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import type { Patient, ProgramExercise, ProgramConfig, UserRole, NewPatient, CompletionData, User, ExerciseWeekPrescription } from './types/index.ts';
import { LoginPage } from './components/LoginPage';
import { SetupPasswordPage } from './components/SetupPasswordPage';
import { ExerciseLibrary } from './components/ExerciseLibrary';
import { PatientsPage } from './components/PatientsPage';
import { PatientProfile } from './components/PatientProfile';
import { PatientPortal } from './components/PatientPortal';
import { ProgramBuilder } from './components/ProgramBuilder';
import { EducationLibrary } from './components/EducationLibrary';
import { AddPatientModal } from './components/modals/AddPatientModal';
import { EditPatientModal } from './components/modals/EditPatientModal';
import { PatientSelectionModal } from './components/modals/PatientSelectionModal';
import { ProgramConfigModal } from './components/modals/ProgramConfigModal';
import { ProgramDetailsModal } from './components/modals/ProgramDetailsModal';
import { NotificationModal } from './components/modals/NotificationModal';
import { ConfirmModal } from './components/modals/ConfirmModal';
import { ResetPasswordModal } from './components/modals/ResetPasswordModal';
import { BlockBuilderModal } from './components/modals/BlockBuilderModal';
import { API_URL } from './config';

function App() {
  // Authentication state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('');
  const [loggedInPatient, setLoggedInPatient] = useState<Patient | null>(null);
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null);

  // Navigation state
  const [currentPage, setCurrentPage] = useState('exercises');
  const [viewingPatient, setViewingPatient] = useState<Patient | null>(null);

  // Patient management
  const [patients, setPatients] = useState<Patient[]>([]);

  // Program builder state
  const [programExercises, setProgramExercises] = useState<ProgramExercise[]>([]);
  const [programName, setProgramName] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Modal states
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [showEditPatientModal, setShowEditPatientModal] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showProgramConfigModal, setShowProgramConfigModal] = useState(false);
  const [showProgramDetailsModal, setShowProgramDetailsModal] = useState(false);
  const [viewingProgramIndex, setViewingProgramIndex] = useState<number | null>(null);
  const [editingProgramIndex, setEditingProgramIndex] = useState<number | null>(null);
  const [editingProgramId, setEditingProgramId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showBlockBuilderModal, setShowBlockBuilderModal] = useState(false);
  const [pendingBlockData, setPendingBlockData] = useState<{ duration: number; weeks: ExerciseWeekPrescription[] } | null>(null);
  const [showDeletePatientConfirm, setShowDeletePatientConfirm] = useState(false);
  const [showDeleteProgramConfirm, setShowDeleteProgramConfirm] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<{ id: number; name: string } | null>(null);

  // Form states
  const [newPatient, setNewPatient] = useState<NewPatient>({
    name: '',
    dob: '',
    condition: '',
    email: '',
    phone: '',
    address: ''
  });

  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const [programConfig, setProgramConfig] = useState<ProgramConfig>({
    startDate: 'today',
    customStartDate: '',
    frequency: [],
    duration: '4weeks',
    customEndDate: '',
    trackRpe: true
  });

  // Fetch patients from database
  const fetchPatients = async () => {
    try {
      const response = await fetch(`${API_URL}/patients`);
      const data = await response.json();
      if (response.ok) {
        setPatients(data.patients);
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    }
  };

  // Load patients when clinician logs in
  useEffect(() => {
    if (isLoggedIn && userRole === 'clinician') {
      fetchPatients();
    }
  }, [isLoggedIn, userRole]);

  // Update logged in patient when patients array changes
  useEffect(() => {
    if (loggedInPatient) {
      const updatedPatient = patients.find(p => p.id === loggedInPatient.id);
      if (updatedPatient) {
        setLoggedInPatient(updatedPatient);
      }
    }
  }, [patients]);

  // Handlers
  const handleLogin = (role: UserRole, patient?: Patient, user?: User) => {
    setIsLoggedIn(true);
    setUserRole(role);
    if (patient) {
      setLoggedInPatient(patient);
    }
    if (user) {
      setLoggedInUser(user);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole('');
    setLoggedInPatient(null);
    setLoggedInUser(null);
  };

  const handleAddToProgram = (exercises: ProgramExercise[]) => {
    setProgramExercises([...programExercises, ...exercises]);
  };

  const handleRemoveFromProgram = (index: number) => {
    setProgramExercises(programExercises.filter((_, i) => i !== index));
  };

  const handleUpdateExercise = (index: number, field: 'sets' | 'reps' | 'weight', value: number) => {
    const updated = [...programExercises];
    if (field === 'weight') {
      updated[index].prescribedWeight = value;
    } else {
      updated[index][field] = value;
    }
    setProgramExercises(updated);
  };

  const handleReorderExercises = (newOrder: ProgramExercise[]) => {
    setProgramExercises(newOrder);
  };

  const handleAssignToPatient = () => {
    setShowPatientModal(true);
  };

  const handleSelectPatient = () => {
    setShowPatientModal(false);
    setShowProgramConfigModal(true);
  };

  const handleConfirmAssignment = async () => {
    if (!selectedPatient) return;

    if (!programName.trim()) {
      setNotification({ message: 'Please enter a program name', type: 'error' });
      return;
    }

    try {
      // Check if we're editing or creating
      const isEditing = editingProgramId !== null;

      let response;
      if (isEditing) {
        // Update existing program
        response = await fetch(`${API_URL}/programs/${editingProgramId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: programName,
            exercises: programExercises,
            config: programConfig
          })
        });
      } else {
        // Create new program
        response = await fetch(`${API_URL}/programs/patient/${selectedPatient.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: programName,
            exercises: programExercises,
            config: programConfig
          })
        });
      }

      if (response.ok) {
        const responseData = await response.json();

        // If a block was configured, create it now with the new program's exercise IDs
        if (!isEditing && pendingBlockData && responseData.programId) {
          try {
            // Fetch the newly created program to get exercise IDs
            const progRes = await fetch(`${API_URL}/programs/patient/${selectedPatient.id}`);
            if (progRes.ok) {
              const progData = await progRes.json();
              if (progData.program && progData.program.exercises) {
                const exerciseIds = progData.program.exercises.map((e: { id: number }) => e.id);
                // w.programExerciseId is the array index (set by BlockBuilderModal), remap to actual DB IDs
                const remappedWeeks = pendingBlockData.weeks.map(w => ({
                  ...w,
                  programExerciseId: exerciseIds[w.programExerciseId] ?? exerciseIds[0]
                }));
                await fetch(`${API_URL}/blocks/${responseData.programId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    blockDuration: pendingBlockData.duration,
                    startDate: new Date().toISOString().split('T')[0],
                    exerciseWeeks: remappedWeeks
                  })
                });
              }
            }
          } catch (blockError) {
            console.error('Failed to create block (program still saved):', blockError);
          }
        }

        // Refresh patient list to get updated program data
        await fetchPatients();

        // Update viewing patient if needed
        if (viewingPatient) {
          const updated = patients.find(p => p.id === viewingPatient.id);
          if (updated) {
            setViewingPatient(updated);
          }
        }

        // Update logged in patient if they're the one being assigned
        if (loggedInPatient && loggedInPatient.id === selectedPatient.id) {
          const updatedPatient = patients.find(p => p.id === selectedPatient.id);
          if (updatedPatient) {
            setLoggedInPatient(updatedPatient);
          }
        }

        setShowProgramConfigModal(false);
        setSelectedPatient(null);
        setProgramExercises([]);
        setProgramName('');
        setEditingProgramIndex(null);
        setEditingProgramId(null);
        setPendingBlockData(null);
        setProgramConfig({
          startDate: 'today',
          customStartDate: '',
          frequency: [],
          duration: '4weeks',
          customEndDate: ''
        });
        setNotification({
          message: isEditing ? 'Program updated successfully!' : 'Program assigned successfully!',
          type: 'success'
        });
      } else {
        const data = await response.json();
        setNotification({
          message: `Failed to ${isEditing ? 'update' : 'assign'} program: ${data.error || 'Unknown error'}`,
          type: 'error'
        });
      }
    } catch (error) {
      setNotification({
        message: 'Connection error. Please make sure the server is running.',
        type: 'error'
      });
    }
  };

  const handleEditProgram = (programIndex: number) => {
    if (!viewingPatient) return;

    const program = viewingPatient.assignedPrograms[programIndex];
    setEditingProgramIndex(programIndex);
    setEditingProgramId(program.config.id || null);
    setSelectedPatient(viewingPatient);
    setProgramName(program.config.name || '');
    setProgramExercises(program.exercises);
    setProgramConfig({
      startDate: program.config.startDate,
      customStartDate: program.config.customStartDate || '',
      frequency: program.config.frequency,
      duration: program.config.duration,
      customEndDate: program.config.customEndDate || ''
    });
    // Navigate to Program Builder tab (exercise library)
    setCurrentPage('exercises');
    setViewingPatient(null);
  };

  const handleDeleteProgram = (programId: number, programName: string) => {
    setProgramToDelete({ id: programId, name: programName });
    setShowDeleteProgramConfirm(true);
  };

  const confirmDeleteProgram = async () => {
    if (!programToDelete) return;

    setShowDeleteProgramConfirm(false);

    try {
      const response = await fetch(`${API_URL}/programs/${programToDelete.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchPatients();

        // Update viewing patient by fetching fresh data from API
        if (viewingPatient) {
          const patientResponse = await fetch(`${API_URL}/patients/${viewingPatient.id}`);
          if (patientResponse.ok) {
            const updatedPatient = await patientResponse.json();
            setViewingPatient(updatedPatient);
          }
        }

        setNotification({ message: 'Program deleted successfully!', type: 'success' });
      } else {
        setNotification({ message: 'Failed to delete program', type: 'error' });
      }
    } catch (error) {
      setNotification({ message: 'Connection error. Please make sure the server is running.', type: 'error' });
    }

    setProgramToDelete(null);
  };

  const handleAddProgram = () => {
    if (!viewingPatient) return;

    setSelectedPatient(viewingPatient);
    setProgramExercises([]);
    setProgramName('');
    setEditingProgramIndex(null);
    setEditingProgramId(null);
    setProgramConfig({
      startDate: 'today',
      customStartDate: '',
      frequency: [],
      duration: '4weeks',
      customEndDate: ''
    });
    // No need to set isProgramOpen since it's always visible
    // Navigate to Program Builder tab (exercise library)
    setCurrentPage('exercises');
    setViewingPatient(null);
  };

  const handleCancelProgramAssignment = () => {
    // Clear all program-related state (program tab stays visible)
    setSelectedPatient(null);
    setProgramExercises([]);
    setProgramName('');
    setEditingProgramIndex(null);
    setEditingProgramId(null);
    setPendingBlockData(null);
    setProgramConfig({
      startDate: 'today',
      customStartDate: '',
      frequency: [],
      duration: '4weeks',
      customEndDate: ''
    });
  };

  const handleSaveEditPatient = () => {
    if (!editingPatient || !editingPatient.name || !editingPatient.dob || !editingPatient.email) {
      setNotification({ message: 'Please fill in required fields: Name, Date of Birth, and Email', type: 'error' });
      return;
    }

    const dobDate = new Date(editingPatient.dob);
    const today = new Date();
    const age = today.getFullYear() - dobDate.getFullYear();

    const updatedPatients = patients.map(p =>
      p.id === editingPatient.id
        ? { ...editingPatient, age: age }
        : p
    );

    setPatients(updatedPatients);

    if (viewingPatient && viewingPatient.id === editingPatient.id) {
      setViewingPatient({ ...editingPatient, age: age });
    }

    setShowEditPatientModal(false);
    setEditingPatient(null);
    setNotification({ message: 'Patient updated successfully!', type: 'success' });
  };

  const handleDeletePatient = async () => {
    if (!editingPatient) return;
    setShowDeletePatientConfirm(true);
  };

  const confirmDeletePatient = async () => {
    if (!editingPatient) return;

    setShowDeletePatientConfirm(false);

    try {
      const response = await fetch(`${API_URL}/patients/${editingPatient.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Refresh patient list from database
        await fetchPatients();
        setShowEditPatientModal(false);
        setEditingPatient(null);
        setViewingPatient(null);
        setNotification({ message: 'Patient deleted successfully! Their login credentials have been removed.', type: 'success' });
      } else {
        const data = await response.json();
        setNotification({ message: `Failed to delete patient: ${data.error || 'Unknown error'}`, type: 'error' });
      }
    } catch (error) {
      setNotification({ message: 'Connection error. Please make sure the server is running.', type: 'error' });
    }
  };

  const handleToggleExerciseComplete = async (
    exerciseIndex: number,
    programIndex: number,
    completionData?: CompletionData
  ) => {
    if (userRole === 'patient' && loggedInPatient && loggedInPatient.assignedPrograms.length > programIndex) {
      const exercise = loggedInPatient.assignedPrograms[programIndex].exercises[exerciseIndex];

      // When completionData is provided, always mark as completed (not toggle)
      // This handles both new completions and editing existing completions
      const newCompletedStatus = completionData ? true : !exercise.completed;

      // Optimistic update
      const updatedPrograms = [...loggedInPatient.assignedPrograms];
      updatedPrograms[programIndex] = {
        ...updatedPrograms[programIndex],
        exercises: [...updatedPrograms[programIndex].exercises]
      };

      // Update allCompletions with the new completion data
      const updatedAllCompletions = { ...exercise.allCompletions };
      if (completionData?.completionDate) {
        updatedAllCompletions[completionData.completionDate] = completionData;
      }

      updatedPrograms[programIndex].exercises[exerciseIndex] = {
        ...exercise,
        completed: newCompletedStatus,
        completionData: completionData,
        allCompletions: updatedAllCompletions
      };
      const updatedPatient = { ...loggedInPatient, assignedPrograms: updatedPrograms };
      setLoggedInPatient(updatedPatient);

      // Save to database if exercise has an ID
      if (exercise.id) {
        try {
          const response = await fetch(`${API_URL}/programs/exercise/${exercise.id}/complete`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              completed: newCompletedStatus,
              patientId: loggedInPatient.id,
              setsPerformed: completionData?.setsPerformed,
              repsPerformed: completionData?.repsPerformed,
              weightPerformed: completionData?.weightPerformed,
              rpeRating: completionData?.rpeRating,
              painLevel: completionData?.painLevel,
              notes: completionData?.notes,
              completionDate: completionData?.completionDate
            })
          });

          if (!response.ok) {
            // Revert on error
            updatedPrograms[programIndex].exercises[exerciseIndex].completed = exercise.completed;
            setLoggedInPatient({ ...loggedInPatient, assignedPrograms: updatedPrograms });
            console.error('Failed to update exercise completion');
          }
        } catch (error) {
          // Revert on error
          updatedPrograms[programIndex].exercises[exerciseIndex].completed = exercise.completed;
          setLoggedInPatient({ ...loggedInPatient, assignedPrograms: updatedPrograms });
          console.error('Error updating exercise completion:', error);
        }
      }
    }
  };

  // Check for reset password token in URL
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const resetToken = searchParams.get('token');
  const isResetPasswordPage = window.location.pathname === '/reset-password';

  const handleResetPasswordClose = () => {
    // Clear the token from URL and navigate to login
    navigate('/', { replace: true });
  };

  const handleResetPasswordSuccess = () => {
    setNotification({ message: 'Password reset successfully! You can now log in.', type: 'success' });
  };

  // Router for public pages (login, setup password, reset password)
  if (!isLoggedIn) {
    return (
      <>
        <Routes>
          <Route path="/setup-password" element={<SetupPasswordPage />} />
          <Route path="/reset-password" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="/" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
        {/* Show reset password modal if token is present */}
        {isResetPasswordPage && resetToken && (
          <ResetPasswordModal
            token={resetToken}
            onClose={handleResetPasswordClose}
            onSuccess={handleResetPasswordSuccess}
          />
        )}
      </>
    );
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Program Tab - Permanently visible on right side (removed slide-out) */}

      {/* Modals */}
      {showPatientModal && (
        <PatientSelectionModal
          patients={patients}
          selectedPatient={selectedPatient}
          onSelect={setSelectedPatient}
          onNext={handleSelectPatient}
          onClose={() => {
            setShowPatientModal(false);
            setSelectedPatient(null);
          }}
        />
      )}

      {showProgramConfigModal && (
        <ProgramConfigModal
          config={programConfig}
          onUpdate={setProgramConfig}
          onConfirm={handleConfirmAssignment}
          onBack={() => {
            setShowProgramConfigModal(false);
            setShowPatientModal(true);
          }}
        />
      )}

      {showProgramDetailsModal && viewingPatient && viewingProgramIndex !== null && (
        <ProgramDetailsModal
          program={viewingPatient.assignedPrograms[viewingProgramIndex]}
          patientName={viewingPatient.name}
          onClose={() => {
            setShowProgramDetailsModal(false);
            setViewingProgramIndex(null);
          }}
        />
      )}

      {showAddPatientModal && (
        <AddPatientModal
          newPatient={newPatient}
          onUpdate={setNewPatient}
          onSuccess={fetchPatients}
          onClose={() => {
            setShowAddPatientModal(false);
            setNewPatient({
              name: '',
              dob: '',
              condition: '',
              email: '',
              phone: '',
              address: ''
            });
          }}
        />
      )}

      {showEditPatientModal && editingPatient && (
        <EditPatientModal
          patient={editingPatient}
          onUpdate={setEditingPatient}
          onSave={handleSaveEditPatient}
          onDelete={handleDeletePatient}
          onClose={() => {
            setShowEditPatientModal(false);
            setEditingPatient(null);
          }}
        />
      )}

      {/* Block Builder Modal */}
      {showBlockBuilderModal && programExercises.length > 0 && (
        <BlockBuilderModal
          programExercises={programExercises}
          clinicianId={loggedInUser?.id || 0}
          initialDuration={(pendingBlockData?.duration as 4 | 6 | 8) || 4}
          initialWeeks={pendingBlockData?.weeks || []}
          onClose={() => setShowBlockBuilderModal(false)}
          onSave={async (blockDuration, exerciseWeeks, saveAsTemplate) => {
            setPendingBlockData({ duration: blockDuration, weeks: exerciseWeeks });
            setShowBlockBuilderModal(false);
            // If saving as template, do that now
            if (saveAsTemplate && loggedInUser?.id) {
              try {
                // w.programExerciseId is the array index (set by BlockBuilderModal)
                const templateWeeks = exerciseWeeks.map(w => ({
                  exerciseSlot: w.programExerciseId,
                  weekNumber: w.weekNumber,
                  sets: w.sets,
                  reps: w.reps,
                  rpeTarget: w.rpeTarget
                }));
                await fetch(`${API_URL}/blocks/templates`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: saveAsTemplate.name,
                    description: saveAsTemplate.description,
                    blockDuration,
                    weeks: templateWeeks,
                    clinicianId: loggedInUser.id
                  })
                });
                setNotification({ message: `Template "${saveAsTemplate.name}" saved!`, type: 'success' });
              } catch {
                setNotification({ message: 'Block saved but template save failed', type: 'error' });
              }
            }
          }}
        />
      )}

      {/* Notification Modal */}
      {notification && (
        <NotificationModal
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Confirm Delete Patient Modal */}
      {showDeletePatientConfirm && editingPatient && (
        <ConfirmModal
          title="Delete Patient"
          message={`Are you sure you want to delete ${editingPatient.name}? This will permanently remove their account and they will no longer be able to login.`}
          confirmText="Delete Patient"
          cancelText="Cancel"
          type="danger"
          onConfirm={confirmDeletePatient}
          onCancel={() => setShowDeletePatientConfirm(false)}
        />
      )}

      {/* Confirm Delete Program Modal */}
      {showDeleteProgramConfirm && programToDelete && (
        <ConfirmModal
          title="Delete Program"
          message={`Are you sure you want to delete "${programToDelete.name}"? This action cannot be undone.`}
          confirmText="Delete Program"
          cancelText="Cancel"
          type="danger"
          onConfirm={confirmDeleteProgram}
          onCancel={() => {
            setShowDeleteProgramConfirm(false);
            setProgramToDelete(null);
          }}
        />
      )}

      {/* Header & Navigation */}
      <header className="bg-secondary-500 flex-shrink-0">
        <div className="px-6 flex items-center justify-between h-14">
          <div className="flex items-center">
            <img
              src="/assets/moveify-logo-dark.png"
              alt="Moveify Logo"
              className={`${userRole === 'clinician' ? 'h-12' : 'h-10'} w-auto mr-8`}
            />

            {/* Navigation Tabs - Only show in Clinician mode */}
            {userRole === 'clinician' && (
              <div className="flex items-stretch h-14">
                <button
                  onClick={() => setCurrentPage('exercises')}
                  className={`px-5 text-sm font-medium border-b-2 transition-colors ${
                    currentPage === 'exercises'
                      ? 'border-moveify-teal text-white'
                      : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
                  }`}
                >
                  Program Builder
                </button>
                <button
                  onClick={() => {
                    setCurrentPage('patients');
                    setViewingPatient(null);
                  }}
                  className={`px-5 text-sm font-medium border-b-2 transition-colors ${
                    currentPage === 'patients'
                      ? 'border-moveify-teal text-white'
                      : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
                  }`}
                >
                  Patients
                </button>
                <button
                  onClick={() => setCurrentPage('education')}
                  className={`px-5 text-sm font-medium border-b-2 transition-colors ${
                    currentPage === 'education'
                      ? 'border-moveify-teal text-white'
                      : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
                  }`}
                >
                  Education
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-primary-400 flex items-center justify-center text-[11px] font-semibold text-white leading-none">
                {userRole === 'clinician' ? 'C' : (loggedInPatient?.name?.[0]?.toUpperCase() || 'P')}
              </div>
              <span className="text-sm text-white/65 font-medium">
                {userRole === 'clinician' ? 'Clinician' : loggedInPatient?.name}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-all text-sm"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - Split layout for clinician */}
      {userRole === 'patient' && loggedInPatient ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-8" style={{ WebkitOverflowScrolling: 'touch' }}>
          <PatientPortal
            patient={loggedInPatient}
            onToggleComplete={handleToggleExerciseComplete}
          />
        </div>
      ) : currentPage === 'exercises' ? (
        // Program Builder page - show split layout with Program Tab
        <div className="flex flex-1 overflow-hidden">
          {/* Left Side - Exercise Library */}
          <div className="flex-1 flex flex-col overflow-hidden px-6 pt-7">
            <ExerciseLibrary onAddToProgram={handleAddToProgram} clinicianId={loggedInUser?.id} />
          </div>

          {/* Right Side - Program Tab (only visible on Program Builder page) */}
          <div className="w-96 border-l border-slate-200 bg-white overflow-y-auto shadow-sm">
            <ProgramBuilder
              programExercises={programExercises}
              programName={programName}
              selectedPatient={selectedPatient}
              isEditing={editingProgramIndex !== null}
              onProgramNameChange={setProgramName}
              onRemoveExercise={handleRemoveFromProgram}
              onUpdateExercise={handleUpdateExercise}
              onReorderExercises={handleReorderExercises}
              onAssignToPatient={handleAssignToPatient}
              onCancelPatientAssignment={handleCancelProgramAssignment}
              onConfigureBlock={programExercises.length > 0 ? () => setShowBlockBuilderModal(true) : undefined}
              hasBlock={pendingBlockData !== null}
            />
          </div>
        </div>
      ) : currentPage === 'education' ? (
        // Education Library page - full width
        <div className="flex-1 overflow-y-auto px-6 py-7">
          <EducationLibrary clinicianId={loggedInUser?.id || 0} />
        </div>
      ) : (
        // Patients page - full width, no Program Tab
        <div className="flex-1 overflow-y-auto px-6 py-7">
          {viewingPatient ? (
            <PatientProfile
              patient={viewingPatient}
              onBack={() => setViewingPatient(null)}
              onEdit={() => {
                setEditingPatient(viewingPatient);
                setShowEditPatientModal(true);
              }}
              onViewProgram={(programIndex) => {
                setViewingProgramIndex(programIndex);
                setShowProgramDetailsModal(true);
              }}
              onEditProgram={handleEditProgram}
              onDeleteProgram={handleDeleteProgram}
              onAddProgram={handleAddProgram}
              clinicianId={loggedInUser?.id}
            />
          ) : (
            <PatientsPage
              patients={patients}
              onViewPatient={setViewingPatient}
              onAddPatient={() => setShowAddPatientModal(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default App;
