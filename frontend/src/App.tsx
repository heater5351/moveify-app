import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import type { Patient, ProgramExercise, ProgramConfig, UserRole, NewPatient, CompletionData, User, ExerciseWeekPrescription } from './types/index.ts';
import { LoginPage } from './components/LoginPage';
import { SetupPasswordPage } from './components/SetupPasswordPage';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { TermsPage } from './components/TermsPage';
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
import { ProgramView } from './components/ProgramView';
import { NotificationModal } from './components/modals/NotificationModal';
import { ConfirmModal } from './components/modals/ConfirmModal';
import { ResetPasswordModal } from './components/modals/ResetPasswordModal';
import { BlockBuilderModal } from './components/modals/BlockBuilderModal';
import { ProgramTemplateModal } from './components/modals/ProgramTemplateModal';
import { ChangePasswordModal } from './components/modals/ChangePasswordModal';
import { EditProfileModal } from './components/modals/EditProfileModal';
import { AccountDropdown } from './components/AccountDropdown';
import { PatientAccountDropdown } from './components/PatientAccountDropdown';
import { PatientAccountPage } from './components/PatientAccountPage';
import { PatientDataPage } from './components/PatientDataPage';
import { PatientEditProfileModal } from './components/modals/PatientEditProfileModal';
import { AdminPanel } from './components/AdminPanel';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { AiProtocolModal } from './components/modals/AiProtocolModal';
import { API_URL } from './config';
import { getAuthHeaders, setToken, clearAuth, setStoredUser, getToken } from './utils/api';
import { toLocalDateString } from './utils/date.ts';
import { useCapacitorBackButton } from './hooks/useCapacitorBackButton';

function App() {
  // Authentication state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('');
  const [loggedInPatient, setLoggedInPatient] = useState<Patient | null>(null);
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

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
  const [viewingProgramIndex, setViewingProgramIndex] = useState<number | null>(null);
  const [editingProgramIndex, setEditingProgramIndex] = useState<number | null>(null);
  const [editingProgramId, setEditingProgramId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showBlockBuilderModal, setShowBlockBuilderModal] = useState(false);
  const [pendingBlockData, setPendingBlockData] = useState<{ duration: number; weeks: ExerciseWeekPrescription[]; startingWeights?: Record<number, string>; rowTemplateIds?: Record<number, number | ''> } | null>(null);
  const [showDeletePatientConfirm, setShowDeletePatientConfirm] = useState(false);
  const [showDeleteProgramConfirm, setShowDeleteProgramConfirm] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<{ id: number; name: string } | null>(null);
  const [showProgramTemplateModal, setShowProgramTemplateModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showAiProtocolModal, setShowAiProtocolModal] = useState(false);

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

  // Android back button handler (Capacitor)
  const handleBackButton = useCallback(() => {
    // Close any open modal first
    if (viewingProgramIndex !== null) {
      setViewingProgramIndex(null);
      return true;
    }
    // Patient: navigate back to main portal from sub-pages
    if (userRole === 'patient' && (currentPage === 'account' || currentPage === 'mydata')) {
      setCurrentPage('exercises');
      return true;
    }
    // Clinician: navigate back from patient profile to patients list
    if (userRole === 'clinician' && currentPage === 'programs' && viewingPatient) {
      setCurrentPage('patients');
      setViewingPatient(null);
      return true;
    }
    return false;
  }, [viewingProgramIndex, userRole, currentPage, viewingPatient]);

  useCapacitorBackButton(handleBackButton);

  // Session restoration on mount
  useEffect(() => {
    const restoreSession = async () => {
      const token = getToken();
      if (!token) {
        setIsRestoringSession(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          const user = data.user;

          if (user.role === 'patient') {
            // Fetch patient data
            const patientResponse = await fetch(`${API_URL}/patients/${user.id}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (patientResponse.ok) {
              const patientData = await patientResponse.json();
              setLoggedInPatient(patientData);
            }
            setUserRole('patient');
          } else {
            setLoggedInUser({ id: user.id, email: user.email, name: user.name, phone: user.phone, role: 'clinician', isAdmin: !!user.is_admin, defaultLocationId: user.default_location_id, locationName: user.location_name });
            setUserRole('clinician');
          }
          setIsLoggedIn(true);
        } else {
          // Token invalid/expired
          clearAuth();
        }
      } catch {
        clearAuth();
      }

      setIsRestoringSession(false);
    };

    restoreSession();
  }, []);

  // Fetch patients from database
  const fetchPatients = async () => {
    try {
      const response = await fetch(`${API_URL}/patients`, {
        headers: getAuthHeaders()
      });
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

  // Auto-refresh patient data every 60s (patient portal only, pauses when tab hidden)
  useEffect(() => {
    if (!isLoggedIn || userRole !== 'patient' || !loggedInPatient) return;

    const refreshPatientData = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`${API_URL}/patients/${loggedInPatient.id}`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          const patientData = await response.json();
          setLoggedInPatient(patientData);
        }
      } catch {
        // Silent — next interval will retry
      }
    };

    const intervalId = setInterval(refreshPatientData, 60000);
    const handleVisibility = () => { if (!document.hidden) refreshPatientData(); };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isLoggedIn, userRole, loggedInPatient?.id]);

  // Sync viewingPatient when patients array updates (e.g., after program create/edit)
  useEffect(() => {
    if (viewingPatient) {
      const updatedPatient = patients.find(p => p.id === viewingPatient.id);
      if (updatedPatient) {
        setViewingPatient(updatedPatient);
      }
    }
  }, [patients]);

  // Handlers
  const handleLogin = (role: UserRole, patient?: Patient, user?: User, token?: string) => {
    if (token) {
      setToken(token);
    }
    setIsLoggedIn(true);
    setUserRole(role);
    if (patient) {
      setLoggedInPatient(patient);
    }
    if (user) {
      setLoggedInUser(user);
      setStoredUser(user);
    }
  };

  const handleLogout = () => {
    clearAuth();
    setIsLoggedIn(false);
    setUserRole('');
    setLoggedInPatient(null);
    setLoggedInUser(null);
  };

  const handleAddToProgram = (exercises: ProgramExercise[]) => {
    setProgramExercises(prev => [...prev, ...exercises]);
  };

  const handleAddSingleExercise = (exercise: ProgramExercise) => {
    setProgramExercises(prev => [...prev, exercise]);
  };

  const handleRemoveFromProgram = (index: number) => {
    setProgramExercises(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateExercise = (index: number, field: 'sets' | 'reps' | 'weight' | 'duration' | 'rest' | 'instructions', value: number | string) => {
    setProgramExercises(prev => prev.map((ex, i) => {
      if (i !== index) return ex;
      if (field === 'weight') return { ...ex, prescribedWeight: value as number };
      if (field === 'duration') return { ...ex, prescribedDuration: value as number };
      if (field === 'rest') return { ...ex, restDuration: value as number };
      if (field === 'instructions') return { ...ex, instructions: value as string };
      return { ...ex, [field]: value as number };
    }));
  };

  const handleReorderExercises = (newOrder: ProgramExercise[]) => {
    setProgramExercises(newOrder);
  };

  const handleSaveAsTemplate = async () => {
    if (programExercises.length === 0) return;

    const name = window.prompt('Enter a name for this template:');
    if (!name || !name.trim()) return;

    try {
      const exercises = programExercises.map((ex) => ({
        exercise_name: ex.name,
        exercise_category: ex.category || null,
        sets: ex.sets,
        reps: ex.reps,
        prescribed_weight: ex.prescribedWeight || 0,
        prescribed_duration: ex.prescribedDuration || null,
        rest_duration: ex.restDuration || null,
        hold_time: ex.holdTime || null,
        instructions: ex.instructions || null,
        image_url: null,
      }));

      const res = await fetch(`${API_URL}/program-templates`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: name.trim(), exercises }),
      });

      if (res.ok) {
        setNotification({ message: 'Template saved!', type: 'success' });
      } else {
        const data = await res.json();
        setNotification({ message: data.error || 'Failed to save template', type: 'error' });
      }
    } catch {
      setNotification({ message: 'Connection error. Could not save template.', type: 'error' });
    }
  };

  const handleLoadTemplate = (exercises: ProgramExercise[]) => {
    setProgramExercises(exercises);
    setShowProgramTemplateModal(false);
    setNotification({ message: 'Template loaded!', type: 'success' });
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
          headers: getAuthHeaders(),
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
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: programName,
            exercises: programExercises,
            config: programConfig
          })
        });
      }

      if (response.ok) {
        const responseData = await response.json();

        // If a block was configured, create/update it with the program's exercise IDs
        if (pendingBlockData && responseData.programId) {
          try {
            const targetProgramId = responseData.programId;

            // Use exercise IDs from the response (new programs) or from existing exercises (editing)
            let exerciseIds: number[] = [];
            if (responseData.exerciseIds) {
              exerciseIds = responseData.exerciseIds;
            } else if (isEditing) {
              exerciseIds = programExercises.map(e => e.id).filter((id): id is number => id !== undefined);
            }

            if (exerciseIds.length > 0) {
              const remappedWeeks = pendingBlockData.weeks.map(w => ({
                ...w,
                programExerciseId: exerciseIds[w.programExerciseId] ?? exerciseIds[0]
              }));
              await fetch(`${API_URL}/blocks/${targetProgramId}`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  blockDuration: pendingBlockData.duration,
                  startDate: toLocalDateString(new Date()),
                  exerciseWeeks: remappedWeeks
                })
              });
            }
          } catch (blockError) {
            console.error('Failed to create block (program still saved):', blockError);
          }
        }

        // Refresh patient list to get updated program data
        // The useEffect hooks watching `patients` will sync viewingPatient and loggedInPatient
        await fetchPatients();

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
      customEndDate: program.config.customEndDate || '',
      trackActualPerformance: program.config.trackActualPerformance,
      trackRpe: program.config.trackRpe,
      trackPainLevel: program.config.trackPainLevel
    });
    // Fetch existing block data for this program
    setPendingBlockData(null);
    if (program.config.id) {
      fetch(`${API_URL}/blocks/${program.config.id}`, {
        headers: getAuthHeaders()
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && (data.has_block || data.hasBlock)) {
            const duration = data.block_duration ?? data.blockDuration;
            const weeks = (data.weeks || []).map((w: Record<string, unknown>) => ({
              programExerciseId: w.program_exercise_id ?? w.programExerciseId,
              weekNumber: w.week_number ?? w.weekNumber,
              sets: w.sets,
              reps: w.reps,
              rpeTarget: w.rpe_target ?? w.rpeTarget ?? null,
              weight: w.weight ?? null,
              notes: w.notes ?? null,
              duration: w.duration ?? null,
              restDuration: w.rest_duration ?? w.restDuration ?? null,
            }));
            setPendingBlockData({ duration, weeks });
          }
        })
        .catch(() => {});
    }
    // Navigate to Program Builder tab (exercise library)
    setCurrentPage('exercises');
    setViewingPatient(null);
  };

  const handleDuplicateProgram = (programIndex: number) => {
    if (!viewingPatient) return;

    const program = viewingPatient.assignedPrograms[programIndex];
    // Not editing — this is a new program
    setEditingProgramIndex(null);
    setEditingProgramId(null);
    setSelectedPatient(null); // Clinician picks a new patient
    setProgramName((program.config.name || '') + ' (Copy)');
    setProgramExercises(program.exercises.map(ex => ({ ...ex, completed: false, completionData: null, allCompletions: {} })));
    setProgramConfig({
      startDate: 'today',
      customStartDate: '',
      frequency: program.config.frequency,
      duration: program.config.duration,
      customEndDate: '',
      trackActualPerformance: program.config.trackActualPerformance,
      trackRpe: program.config.trackRpe,
      trackPainLevel: program.config.trackPainLevel
    });
    setPendingBlockData(null);
    setCurrentPage('exercises');
    setViewingPatient(null);
    setViewingProgramIndex(null);
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
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        await fetchPatients();

        // Update viewing patient by fetching fresh data from API
        if (viewingPatient) {
          const patientResponse = await fetch(`${API_URL}/patients/${viewingPatient.id}`, {
            headers: getAuthHeaders()
          });
          if (patientResponse.ok) {
            const updatedPatient = await patientResponse.json();
            setViewingPatient(updatedPatient);
          }
        }

        // If we were on the program page, navigate back to patient profile
        if (currentPage === 'program') {
          setViewingProgramIndex(null);
          setCurrentPage('patients');
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
    setCurrentPage('exercises');
    setViewingPatient(null);
  };

  const handleCancelProgramAssignment = () => {
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

  const handleSaveEditPatient = async () => {
    if (!editingPatient || !editingPatient.name || !editingPatient.dob || !editingPatient.email) {
      setNotification({ message: 'Please fill in required fields: Name, Date of Birth, and Email', type: 'error' });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/patients/${editingPatient.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editingPatient.name,
          dob: editingPatient.dob,
          email: editingPatient.email,
          phone: editingPatient.phone || '',
          address: editingPatient.address || '',
          condition: editingPatient.condition || '',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setNotification({ message: data.error || 'Failed to update patient', type: 'error' });
        return;
      }

      await fetchPatients();

      setShowEditPatientModal(false);
      setEditingPatient(null);
      setNotification({ message: 'Patient updated successfully!', type: 'success' });
    } catch {
      setNotification({ message: 'Connection error. Please try again.', type: 'error' });
    }
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
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
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

      const newCompletedStatus = completionData ? true : !exercise.completed;

      // Optimistic update
      const updatedPrograms = [...loggedInPatient.assignedPrograms];
      updatedPrograms[programIndex] = {
        ...updatedPrograms[programIndex],
        exercises: [...updatedPrograms[programIndex].exercises]
      };

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
            headers: getAuthHeaders(),
            body: JSON.stringify({
              completed: newCompletedStatus,
              setsPerformed: completionData?.setsPerformed,
              repsPerformed: completionData?.repsPerformed,
              weightPerformed: completionData?.weightPerformed,
              durationPerformed: completionData?.durationPerformed,
              rpeRating: completionData?.rpeRating,
              painLevel: completionData?.painLevel,
              notes: completionData?.notes,
              completionDate: completionData?.completionDate
            })
          });

          if (!response.ok) {
            // Revert on error — restore original exercise state immutably
            const revertPrograms = [...updatedPrograms];
            revertPrograms[programIndex] = {
              ...revertPrograms[programIndex],
              exercises: [...revertPrograms[programIndex].exercises]
            };
            revertPrograms[programIndex].exercises[exerciseIndex] = { ...exercise };
            setLoggedInPatient(prev => prev ? { ...prev, assignedPrograms: revertPrograms } : prev);
          }
        } catch {
          // Revert on error — restore original exercise state immutably
          const revertPrograms = [...updatedPrograms];
          revertPrograms[programIndex] = {
            ...revertPrograms[programIndex],
            exercises: [...revertPrograms[programIndex].exercises]
          };
          revertPrograms[programIndex].exercises[exerciseIndex] = { ...exercise };
          setLoggedInPatient(prev => prev ? { ...prev, assignedPrograms: revertPrograms } : prev);
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
    navigate('/', { replace: true });
  };

  const handleResetPasswordSuccess = () => {
    setNotification({ message: 'Password reset successfully! You can now log in.', type: 'success' });
  };

  // Show loading while restoring session
  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  // Router for public pages (login, setup password, reset password)
  if (!isLoggedIn) {
    return (
      <>
        <Routes>
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
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

      {/* Program Template Modal */}
      {showProgramTemplateModal && (
        <ProgramTemplateModal
          onLoad={handleLoadTemplate}
          onClose={() => setShowProgramTemplateModal(false)}
        />
      )}

      {/* Block Builder Modal */}
      {showBlockBuilderModal && programExercises.length > 0 && (
        <BlockBuilderModal
          programExercises={programExercises}
          initialDuration={(pendingBlockData?.duration as 4 | 6 | 8) || 4}
          initialWeeks={pendingBlockData?.weeks || []}
          initialStartingWeights={pendingBlockData?.startingWeights}
          initialRowTemplateIds={pendingBlockData?.rowTemplateIds}
          onClose={() => setShowBlockBuilderModal(false)}
          onSave={(blockDuration, exerciseWeeks, savedStartingWeights, savedRowTemplateIds) => {
            setPendingBlockData({ duration: blockDuration, weeks: exerciseWeeks, startingWeights: savedStartingWeights, rowTemplateIds: savedRowTemplateIds });
            setShowBlockBuilderModal(false);
          }}
        />
      )}

      {/* Edit Profile Modal (clinician) */}
      {showEditProfileModal && loggedInUser && userRole === 'clinician' && (
        <EditProfileModal
          user={loggedInUser}
          onClose={() => setShowEditProfileModal(false)}
          onSave={(updatedUser) => {
            setLoggedInUser(updatedUser);
            setStoredUser(updatedUser);
            setNotification({ message: 'Profile updated!', type: 'success' });
          }}
        />
      )}

      {/* Edit Profile Modal (patient) */}
      {showEditProfileModal && loggedInPatient && userRole === 'patient' && (
        <PatientEditProfileModal
          patient={loggedInPatient}
          onClose={() => setShowEditProfileModal(false)}
          onSave={(updated) => {
            setLoggedInPatient({ ...loggedInPatient, ...updated });
            setNotification({ message: 'Profile updated!', type: 'success' });
          }}
        />
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowChangePasswordModal(false)}
          onSuccess={() => setNotification({ message: 'Password changed successfully!', type: 'success' })}
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
                {loggedInUser?.isAdmin && (
                  <button
                    onClick={() => setCurrentPage('admin')}
                    className={`px-5 text-sm font-medium border-b-2 transition-colors ${
                      currentPage === 'admin'
                        ? 'border-moveify-teal text-white'
                        : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
                    }`}
                  >
                    Admin
                  </button>
                )}
              </div>
            )}
          </div>

          {userRole === 'clinician' && loggedInUser ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAiPanel(!showAiPanel)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  showAiPanel
                    ? 'bg-primary-400 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
                title="AI Exercise Assistant"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden md:inline">AI Assistant</span>
              </button>
              <AccountDropdown
                user={loggedInUser}
                onLogout={handleLogout}
                onEditProfile={() => setShowEditProfileModal(true)}
                onChangePassword={() => setShowChangePasswordModal(true)}
                onNavigateAdmin={() => setCurrentPage('admin')}
              />
            </div>
          ) : loggedInPatient ? (
            <PatientAccountDropdown
              patient={loggedInPatient}
              onLogout={handleLogout}
              onChangePassword={() => setShowChangePasswordModal(true)}
              onNavigateAccount={() => setCurrentPage('account')}
              onNavigateData={() => setCurrentPage('mydata')}
            />
          ) : null}
        </div>
      </header>

      {/* Main Content Area - Split layout for clinician */}
      {userRole === 'patient' && loggedInPatient && currentPage === 'account' ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-8" style={{ WebkitOverflowScrolling: 'touch' }}>
          <PatientAccountPage
            patient={loggedInPatient}
            onBack={() => setCurrentPage('exercises')}
            onEditProfile={() => setShowEditProfileModal(true)}
          />
        </div>
      ) : userRole === 'patient' && loggedInPatient && currentPage === 'mydata' ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-8" style={{ WebkitOverflowScrolling: 'touch' }}>
          <PatientDataPage
            onBack={() => setCurrentPage('exercises')}
            onNotification={(message, type) => setNotification({ message, type })}
          />
        </div>
      ) : userRole === 'patient' && loggedInPatient ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-8" style={{ WebkitOverflowScrolling: 'touch' }}>
          <PatientPortal
            patient={loggedInPatient}
            onToggleComplete={handleToggleExerciseComplete}
          />
        </div>
      ) : currentPage === 'exercises' ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden px-6 pt-7">
            <ExerciseLibrary onAddToProgram={handleAddToProgram} />
          </div>
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
              onAddExercise={handleAddSingleExercise}
              onSaveAsTemplate={handleSaveAsTemplate}
              onLoadTemplate={() => setShowProgramTemplateModal(true)}
            />
          </div>
        </div>
      ) : currentPage === 'admin' && loggedInUser?.isAdmin ? (
        <div className="flex-1 overflow-y-auto px-6 py-7">
          <AdminPanel
            currentUserId={loggedInUser.id}
            onNotification={(message, type) => setNotification({ message, type })}
          />
        </div>
      ) : currentPage === 'education' ? (
        <div className="flex-1 overflow-y-auto px-6 py-7">
          <EducationLibrary />
        </div>
      ) : currentPage === 'program' && viewingPatient && viewingProgramIndex !== null ? (
        <div className="flex-1 overflow-y-auto px-6 py-7">
          <ProgramView
            program={viewingPatient.assignedPrograms[viewingProgramIndex]}
            patientName={viewingPatient.name}
            onBack={() => {
              setViewingProgramIndex(null);
              setCurrentPage('patients');
            }}
            onEdit={() => handleEditProgram(viewingProgramIndex)}
            onDelete={() => {
              const prog = viewingPatient.assignedPrograms[viewingProgramIndex];
              if (prog.config.id && prog.config.name) {
                handleDeleteProgram(prog.config.id, prog.config.name);
              }
            }}
            onDuplicate={() => handleDuplicateProgram(viewingProgramIndex)}
            onRefresh={fetchPatients}
          />
        </div>
      ) : (
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
                setCurrentPage('program');
              }}
              onEditProgram={handleEditProgram}
              onDeleteProgram={handleDeleteProgram}
              onAddProgram={handleAddProgram}
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

      {/* AI Assistant Panel */}
      {userRole === 'clinician' && (
        <AiAssistantPanel
          show={showAiPanel}
          onClose={() => setShowAiPanel(false)}
          onAddToProgram={handleAddToProgram}
          onOpenProtocols={() => setShowAiProtocolModal(true)}
        />
      )}

      {/* AI Protocol Modal */}
      {userRole === 'clinician' && (
        <AiProtocolModal
          show={showAiProtocolModal}
          onClose={() => setShowAiProtocolModal(false)}
          isAdmin={loggedInUser?.isAdmin || false}
        />
      )}
    </div>
  );
}

export default App;
