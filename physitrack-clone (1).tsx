import React, { useState } from 'react';
import { Search, Play, Clock, Trash2, User, Plus, Edit, X, LogOut, Check } from 'lucide-react';

const MoveifyApp = () => {
  const [currentPage, setCurrentPage] = useState('exercises');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [programExercises, setProgramExercises] = useState([]);
  const [isProgramOpen, setIsProgramOpen] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [viewingPatient, setViewingPatient] = useState(null);
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [showEditPatientModal, setShowEditPatientModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showProgramConfigModal, setShowProgramConfigModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [newPatient, setNewPatient] = useState({
    name: '',
    dob: '',
    condition: '',
    email: '',
    phone: '',
    address: ''
  });

  // Program configuration state
  const [programConfig, setProgramConfig] = useState({
    startDate: 'today',
    customStartDate: '',
    frequency: [],
    duration: '4weeks',
    customEndDate: ''
  });

  // Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [userRole, setUserRole] = useState(''); // 'clinician', 'patient'
  const [loggedInPatient, setLoggedInPatient] = useState(null);
  const [selectedWeekDay, setSelectedWeekDay] = useState(new Date().getDay()); // 0 = Sunday, 1 = Monday, etc.

  const [patients, setPatients] = useState(() => {
    const saved = localStorage.getItem('moveify_patients');
    return saved ? JSON.parse(saved) : [
      { 
        id: 1, 
        name: 'Sarah Johnson', 
        dob: '1989-03-15',
        age: 34,
        condition: 'Post-op ACL',
        email: 'sarah.j@email.com',
        phone: '(555) 123-4567',
        address: '123 Main Street, Sydney NSW 2000',
        dateAdded: '2025-12-01',
        assignedProgram: null
      },
      { 
        id: 2, 
        name: 'Mike Chen', 
        dob: '1982-07-22',
        age: 42,
        condition: 'Lower back pain',
        email: 'mike.chen@email.com',
        phone: '(555) 234-5678',
        address: '456 George Street, Sydney NSW 2000',
        dateAdded: '2025-11-15',
        assignedProgram: null
      },
      { 
        id: 3, 
        name: 'Emma Davis', 
        dob: '1996-11-08',
        age: 28,
        condition: 'Frozen shoulder',
        email: 'emma.d@email.com',
        phone: '(555) 345-6789',
        address: '789 Pitt Street, Sydney NSW 2000',
        dateAdded: '2026-01-05',
        assignedProgram: null
      },
      { 
        id: 4, 
        name: 'James Wilson', 
        dob: '1968-05-30',
        age: 56,
        condition: 'Knee replacement recovery',
        email: 'j.wilson@email.com',
        phone: '(555) 456-7890',
        address: '321 Elizabeth Street, Sydney NSW 2000',
        dateAdded: '2025-10-20',
        assignedProgram: null
      }
    ];
  });

  const exercises = [
    { 
      id: 1, 
      name: 'Quad Sets', 
      category: 'Knee', 
      duration: '3 sets x 10 reps', 
      difficulty: 'Beginner',
      description: 'Tighten thigh muscle while keeping leg straight. Hold for 5 seconds.'
    },
    { 
      id: 2, 
      name: 'Straight Leg Raise', 
      category: 'Knee', 
      duration: '3 sets x 15 reps', 
      difficulty: 'Beginner',
      description: 'Lie on back, lift straight leg to 45 degrees. Lower slowly.'
    },
    { 
      id: 3, 
      name: 'Hamstring Curls', 
      category: 'Knee', 
      duration: '3 sets x 12 reps', 
      difficulty: 'Intermediate',
      description: 'Standing or lying, bend knee to bring heel toward buttocks.'
    },
    { 
      id: 4, 
      name: 'Cat-Cow Stretch', 
      category: 'Back', 
      duration: '2 sets x 10 reps', 
      difficulty: 'Beginner',
      description: 'On hands and knees, alternate arching and rounding spine.'
    },
    { 
      id: 5, 
      name: 'Bird Dog', 
      category: 'Back', 
      duration: '3 sets x 8 reps', 
      difficulty: 'Intermediate',
      description: 'On hands and knees, extend opposite arm and leg. Hold for 5 seconds.'
    },
    { 
      id: 6, 
      name: 'Pendulum Exercise', 
      category: 'Shoulder', 
      duration: '2 mins each direction', 
      difficulty: 'Beginner',
      description: 'Bend forward, let arm hang. Gently swing arm in circles.'
    },
    { 
      id: 7, 
      name: 'Wall Slides', 
      category: 'Shoulder', 
      duration: '3 sets x 10 reps', 
      difficulty: 'Intermediate',
      description: 'Stand against wall, slide arms up and down maintaining contact.'
    },
    { 
      id: 8, 
      name: 'Calf Raises', 
      category: 'Ankle', 
      duration: '3 sets x 15 reps', 
      difficulty: 'Beginner',
      description: 'Stand on toes, lift heels off ground. Lower slowly.'
    },
    { 
      id: 9, 
      name: 'Glute Bridges', 
      category: 'Hip', 
      duration: '3 sets x 12 reps', 
      difficulty: 'Beginner',
      description: 'Lie on back with knees bent, lift hips toward ceiling.'
    },
    { 
      id: 10, 
      name: 'Clamshells', 
      category: 'Hip', 
      duration: '3 sets x 15 reps', 
      difficulty: 'Beginner',
      description: 'Lie on side with knees bent, lift top knee while keeping feet together.'
    }
  ];

  const toggleExercise = (exerciseId) => {
    if (selectedExercises.includes(exerciseId)) {
      setSelectedExercises(selectedExercises.filter(id => id !== exerciseId));
    } else {
      setSelectedExercises([...selectedExercises, exerciseId]);
    }
  };

  const addToProgram = () => {
    if (selectedExercises.length === 0) return;
    
    const newExercises = exercises.filter(ex => selectedExercises.includes(ex.id)).map(ex => ({
      ...ex,
      sets: 3,
      reps: 10,
      completed: false
    }));
    setProgramExercises([...programExercises, ...newExercises]);
    setSelectedExercises([]);
    setIsProgramOpen(true);
  };

  const removeFromProgram = (index) => {
    setProgramExercises(programExercises.filter((_, i) => i !== index));
  };

  const updateExercise = (index, field, value) => {
    const updated = [...programExercises];
    updated[index][field] = parseInt(value) || 0;
    setProgramExercises(updated);
  };

  const openAssignModal = () => {
    setShowPatientModal(true);
  };

  const assignToPatient = () => {
    if (!selectedPatient) return;
    
    // Close patient selection modal and open configuration modal
    setShowPatientModal(false);
    setShowProgramConfigModal(true);
  };

  const confirmProgramAssignment = () => {
    if (!selectedPatient) return;

    const updatedPatients = patients.map(p => 
      p.id === selectedPatient.id 
        ? { 
            ...p, 
            assignedProgram: [...programExercises],
            programConfig: { ...programConfig }
          }
        : p
    );
    
    setPatients(updatedPatients);
    
    // Update loggedInPatient if they're the one being assigned
    if (loggedInPatient && loggedInPatient.id === selectedPatient.id) {
      setLoggedInPatient({ 
        ...loggedInPatient, 
        assignedProgram: [...programExercises],
        programConfig: { ...programConfig }
      });
    }
    
    setShowProgramConfigModal(false);
    setSelectedPatient(null);
    setProgramExercises([]);
    setIsProgramOpen(false);
    setProgramConfig({
      startDate: 'today',
      customStartDate: '',
      frequency: [],
      duration: '4weeks',
      customEndDate: ''
    });
    alert('Program assigned successfully!');
  };

  const toggleFrequencyDay = (day) => {
    if (programConfig.frequency.includes(day)) {
      setProgramConfig({
        ...programConfig,
        frequency: programConfig.frequency.filter(d => d !== day)
      });
    } else {
      setProgramConfig({
        ...programConfig,
        frequency: [...programConfig.frequency, day]
      });
    }
  };

  const toggleExerciseComplete = (exerciseIndex) => {
    if (userRole === 'patient' && loggedInPatient) {
      const updatedProgram = [...loggedInPatient.assignedProgram];
      updatedProgram[exerciseIndex].completed = !updatedProgram[exerciseIndex].completed;
      
      const updatedPatient = { ...loggedInPatient, assignedProgram: updatedProgram };
      setLoggedInPatient(updatedPatient);
      
      // Update in patients array
      setPatients(patients.map(p => 
        p.id === loggedInPatient.id ? updatedPatient : p
      ));
    }
  };

  const addNewPatient = () => {
    if (!newPatient.name || !newPatient.dob || !newPatient.email) {
      alert('Please fill in required fields: Name, Date of Birth, and Email');
      return;
    }

    const dobDate = new Date(newPatient.dob);
    const today = new Date();
    const age = today.getFullYear() - dobDate.getFullYear();

    const patient = {
      id: Date.now(),
      name: newPatient.name,
      dob: newPatient.dob,
      age: age,
      condition: newPatient.condition,
      email: newPatient.email,
      phone: newPatient.phone,
      address: newPatient.address,
      dateAdded: today.toISOString().split('T')[0],
      assignedProgram: null
    };

    setPatients([...patients, patient]);
    setShowAddPatientModal(false);
    setNewPatient({
      name: '',
      dob: '',
      condition: '',
      email: '',
      phone: '',
      address: ''
    });
    alert('Patient added successfully!');
  };

  const openEditPatient = (patient) => {
    setEditingPatient({
      ...patient
    });
    setShowEditPatientModal(true);
  };

  const saveEditPatient = () => {
    if (!editingPatient.name || !editingPatient.dob || !editingPatient.email) {
      alert('Please fill in required fields: Name, Date of Birth, and Email');
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
    alert('Patient updated successfully!');
  };

  const deletePatient = (patientId) => {
    console.log('Deleting patient ID:', patientId);
    const updatedPatients = patients.filter(p => p.id !== patientId);
    setPatients(updatedPatients);
    setShowEditPatientModal(false);
    setShowDeleteConfirm(false);
    setEditingPatient(null);
    setViewingPatient(null);
    alert('Patient deleted successfully!');
  };

  const filteredExercises = exercises.filter(exercise =>
    exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    exercise.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Save to localStorage whenever patients change
  React.useEffect(() => {
    localStorage.setItem('moveify_patients', JSON.stringify(patients));
  }, [patients]);

  // Update loggedInPatient when patients array changes
  React.useEffect(() => {
    if (loggedInPatient) {
      const updatedPatient = patients.find(p => p.id === loggedInPatient.id);
      if (updatedPatient) {
        setLoggedInPatient(updatedPatient);
      }
    }
  }, [patients]);

  // Logout handler
  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole('');
    setLoggedInPatient(null);
    setLoginError('');
  };

  // Login Page
  const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleLoginSubmit = () => {
      setLoginError('');

      // Clinician login
      if (email === 'clinician@physitrack.com' && password === 'clinic123') {
        setIsLoggedIn(true);
        setUserRole('clinician');
        return;
      }

      // Patient login
      const patient = patients.find(p => p.email === email);
      if (patient && password === 'patient123') {
        setIsLoggedIn(true);
        setUserRole('patient');
        setLoggedInPatient(patient);
        return;
      }

      // Login failed
      setLoginError('Invalid email or password');
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-blue-600 mb-2">PhysiTrack Pro</h1>
            <p className="text-gray-600">Sign in to your account</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLoginSubmit()}
                placeholder="your@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLoginSubmit()}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {loginError}
              </div>
            )}

            <button
              onClick={handleLoginSubmit}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Sign In
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Demo Accounts:</p>
            <p className="mt-1">Developer: dev@physitrack.com / dev123</p>
            <p>Clinician: clinician@physitrack.com / clinic123</p>
            <p>Patient: sarah.j@email.com / patient123</p>
          </div>
        </div>
      </div>
    );
  };

  // If not logged in, show login page
  if (!isLoggedIn) {
    return <LoginPage />;
  }

  // Exercise Library Page
  const ExerciseLibrary = () => (
    <>
      {/* Selected Count */}
      {selectedExercises.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-900 font-medium">
            {selectedExercises.length} exercise{selectedExercises.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-8">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search exercises..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button 
            onClick={addToProgram}
            disabled={selectedExercises.length === 0}
            className={`px-6 py-3 rounded-lg font-medium whitespace-nowrap ${
              selectedExercises.length === 0 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            Add to Program
          </button>
        </div>
      </div>

      {/* Exercise Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {filteredExercises.map(exercise => {
          const isSelected = selectedExercises.includes(exercise.id);
          return (
            <div 
              key={exercise.id} 
              onClick={() => toggleExercise(exercise.id)}
              className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden hover:shadow-md transition-all cursor-pointer ${
                isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-100'
              }`}
            >
              {/* Video Thumbnail */}
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 h-48 flex items-center justify-center relative">
                <Play className="text-white" size={56} />
                {isSelected && (
                  <div className="absolute top-3 left-3 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">
                    ✓
                  </div>
                )}
                <span className="absolute top-3 right-3 bg-white/90 text-blue-600 text-xs font-semibold px-3 py-1 rounded-full">
                  {exercise.difficulty}
                </span>
              </div>

              {/* Exercise Info */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-lg">{exercise.name}</h3>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    {exercise.category}
                  </span>
                </div>
                
                <p className="text-sm text-gray-600 mb-4">
                  {exercise.description}
                </p>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock size={16} />
                  <span>{exercise.duration}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* No Results */}
      {filteredExercises.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No exercises found matching "{searchTerm}"</p>
        </div>
      )}
    </>
  );

  // Patients Page
  const PatientsPage = () => (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Patient List</h2>
          <p className="text-gray-600">Manage your patients and their assigned programs</p>
        </div>
        <button
          onClick={() => setShowAddPatientModal(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
        >
          <Plus size={20} />
          Add Patient
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {patients.map(patient => (
          <div 
            key={patient.id} 
            onClick={() => setViewingPatient(patient)}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="text-blue-600" size={32} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-lg">{patient.name}</h3>
                <p className="text-sm text-gray-600">{patient.age} years old</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div>
                <p className="text-xs text-gray-500">Condition</p>
                <p className="text-sm font-medium text-gray-900">{patient.condition}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm text-gray-900">{patient.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm text-gray-900">{patient.phone}</p>
              </div>
            </div>

            {patient.assignedProgram ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-green-600 font-medium mb-1">Assigned Program</p>
                <p className="text-sm text-gray-900">{patient.assignedProgram.length} exercises</p>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm text-gray-500">No program assigned</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );

  // Patient Portal View
  const PatientPortal = () => {
    const mockPatient = userRole === 'patient' ? loggedInPatient : patients.find(p => p.id === 1);
    
    if (!mockPatient || !mockPatient.assignedProgram) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500">No exercises assigned yet. Please check back later.</p>
        </div>
      );
    }

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date().getDay();
    
    // Get the short day name for selected day (e.g., "Mon")
    const selectedDayShort = daysOfWeek[selectedWeekDay];
    
    // Check if selected day has exercises based on program frequency
    const hasExercisesToday = mockPatient.programConfig && 
                              mockPatient.programConfig.frequency && 
                              mockPatient.programConfig.frequency.includes(selectedDayShort);

    // Get exercises for selected day
    const todaysExercises = hasExercisesToday ? mockPatient.assignedProgram : [];

    // Check program status
    const isProgramActive = mockPatient.programConfig && mockPatient.programConfig.duration !== 'completed';
    const isProgramCompleted = mockPatient.programConfig && mockPatient.programConfig.duration === 'completed';

    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {mockPatient.name}!</h1>
          <p className="text-gray-600">Your exercise schedule</p>
        </div>

        {/* Week View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="grid grid-cols-7 gap-3">
            {daysOfWeek.map((day, index) => {
              const isToday = index === today;
              const isSelected = index === selectedWeekDay;
              const hasDot = mockPatient.programConfig && 
                           mockPatient.programConfig.frequency && 
                           mockPatient.programConfig.frequency.includes(day);
              
              return (
                <button
                  key={day}
                  onClick={() => setSelectedWeekDay(index)}
                  className={`relative p-4 rounded-lg font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : isToday
                      ? 'bg-blue-50 text-blue-600 border-2 border-blue-200'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-lg">{day}</div>
                    {isToday && !isSelected && (
                      <div className="text-xs mt-1">Today</div>
                    )}
                  </div>
                  {hasDot && (
                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                      isSelected ? 'bg-white' : 'bg-blue-600'
                    }`}></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Display */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {dayNames[selectedWeekDay]}'s Exercises
            {selectedWeekDay === today && <span className="text-blue-600"> (Today)</span>}
          </h2>
          
          {isProgramCompleted && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-800 font-medium">✓ Program Completed</p>
              <p className="text-green-700 text-sm">Great job! You've completed this program.</p>
            </div>
          )}
        </div>

        {/* Exercises Display */}
        {!hasExercisesToday ? (
          <div className="bg-gray-50 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">No exercises scheduled for {dayNames[selectedWeekDay]}</p>
            {mockPatient.programConfig && mockPatient.programConfig.frequency && (
              <p className="text-gray-400 text-sm mt-2">
                Your scheduled days: {mockPatient.programConfig.frequency.join(', ')}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {todaysExercises.map((exercise, index) => (
              <div key={index} className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow ${
                isProgramCompleted ? 'opacity-75' : ''
              }`}>
                <div className="flex gap-6">
                  {/* Video Placeholder */}
                  <div className="flex-shrink-0 w-48 h-32 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center relative">
                    <Play className="text-white" size={48} />
                    {exercise.completed && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                        <Check size={20} />
                      </div>
                    )}
                  </div>

                  {/* Exercise Details */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-semibold text-gray-900 mb-1">{exercise.name}</h3>
                          {exercise.completed && (
                            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded">
                              ✓ Completed
                            </span>
                          )}
                          {isProgramCompleted && (
                            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-1 rounded">
                              Program Ended
                            </span>
                          )}
                        </div>
                        <span className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                          {exercise.category}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-blue-600">{exercise.sets}</p>
                        <p className="text-sm text-gray-600">sets</p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-gray-600 mb-2">
                        <strong>Repetitions:</strong> {exercise.reps} reps per set
                      </p>
                      <p className="text-gray-700">{exercise.description}</p>
                    </div>

                    <div className="flex gap-3">
                      <button className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">
                        Watch Video
                      </button>
                      {!isProgramCompleted && (
                        <button 
                          onClick={() => toggleExerciseComplete(index)}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            exercise.completed
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {exercise.completed ? '✓ Completed' : 'Mark Complete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Patient Profile View
  const PatientProfile = ({ patient }) => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setViewingPatient(null)}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          ← Back to Patients
        </button>
        <button
          onClick={() => openEditPatient(patient)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
        >
          <Edit size={18} />
          Edit Profile
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-start gap-6 mb-8">
          <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="text-blue-600" size={48} />
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
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Assigned Program</h2>
          {patient.assignedProgram ? (
            <div className="space-y-3">
              {patient.assignedProgram.map((exercise, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{exercise.name}</h3>
                        {exercise.completed && (
                          <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
                            <Check size={14} />
                            Completed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {exercise.sets} sets × {exercise.reps} reps
                      </p>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded">
                    {exercise.category}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <p className="text-gray-500">No program assigned to this patient yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Program Builder Slide-out */}
      <div 
        className={`fixed top-0 left-0 h-full w-1/3 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${
          isProgramOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Program Builder</h2>
            <button 
              onClick={() => setIsProgramOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            {programExercises.length === 0 ? (
              <p className="text-gray-500 text-center mt-8">No exercises added yet</p>
            ) : (
              <div className="space-y-3">
                {programExercises.map((exercise, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">{exercise.name}</h3>
                      <button
                        onClick={() => removeFromProgram(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                    
                    <div className="flex gap-4 mb-2">
                      <div className="flex-1">
                        <label className="text-xs text-gray-600 block mb-1">Sets</label>
                        <input
                          type="number"
                          min="1"
                          value={exercise.sets}
                          onChange={(e) => updateExercise(index, 'sets', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-600 block mb-1">Reps</label>
                        <input
                          type="number"
                          min="1"
                          value={exercise.reps}
                          onChange={(e) => updateExercise(index, 'reps', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded inline-block">
                      {exercise.category}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {programExercises.length > 0 && (
            <div className="p-6 border-t border-gray-200">
              <button 
                onClick={openAssignModal}
                className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium"
              >
                Assign to Patient
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Patient Selection Modal */}
      {showPatientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Select Patient</h3>
            <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
              {patients.map(patient => (
                <button
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedPatient?.id === patient.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{patient.name}</p>
                  <p className="text-sm text-gray-600">{patient.condition}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPatientModal(false);
                  setSelectedPatient(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={assignToPatient}
                disabled={!selectedPatient}
                className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                  selectedPatient
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Program Configuration Modal */}
      {showProgramConfigModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Configure Program</h3>
            
            {/* Start Date */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-3">When do you want this program to start?</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={() => setProgramConfig({ ...programConfig, startDate: 'today' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.startDate === 'today'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setProgramConfig({ ...programConfig, startDate: 'tomorrow' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.startDate === 'tomorrow'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Tomorrow
                </button>
                <button
                  onClick={() => setProgramConfig({ ...programConfig, startDate: 'nextweek' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.startDate === 'nextweek'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  +1 Week
                </button>
                <button
                  onClick={() => setProgramConfig({ ...programConfig, startDate: 'custom' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.startDate === 'custom'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Custom
                </button>
              </div>
              {programConfig.startDate === 'custom' && (
                <input
                  type="date"
                  value={programConfig.customStartDate}
                  onChange={(e) => setProgramConfig({ ...programConfig, customStartDate: e.target.value })}
                  className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}
            </div>

            {/* Frequency */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Program Frequency</h4>
              <p className="text-sm text-gray-600 mb-3">How often do you want them to perform this exercise program?</p>
              <p className="text-sm font-medium text-gray-700 mb-2">On specific days:</p>
              <div className="grid grid-cols-7 gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <button
                    key={day}
                    onClick={() => toggleFrequencyDay(day)}
                    className={`px-3 py-3 rounded-lg font-medium transition-colors ${
                      programConfig.frequency.includes(day)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Program Duration</h4>
              <p className="text-sm text-gray-600 mb-3">When do you want this program to end?</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <button
                  onClick={() => setProgramConfig({ ...programConfig, duration: '1week' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.duration === '1week'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  1 Week
                </button>
                <button
                  onClick={() => setProgramConfig({ ...programConfig, duration: '2weeks' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.duration === '2weeks'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  2 Weeks
                </button>
                <button
                  onClick={() => setProgramConfig({ ...programConfig, duration: '4weeks' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.duration === '4weeks'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  4 Weeks
                </button>
                <button
                  onClick={() => setProgramConfig({ ...programConfig, duration: '6weeks' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.duration === '6weeks'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  6 Weeks
                </button>
                <button
                  onClick={() => setProgramConfig({ ...programConfig, duration: 'ongoing' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.duration === 'ongoing'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Ongoing
                </button>
                <button
                  onClick={() => setProgramConfig({ ...programConfig, duration: 'custom' })}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                    programConfig.duration === 'custom'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Custom Date
                </button>
              </div>
              {programConfig.duration === 'custom' && (
                <input
                  type="date"
                  value={programConfig.customEndDate}
                  onChange={(e) => setProgramConfig({ ...programConfig, customEndDate: e.target.value })}
                  className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowProgramConfigModal(false);
                  setShowPatientModal(true);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={confirmProgramAssignment}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Patient Modal */}
      {showAddPatientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Add New Patient</h3>
              <button
                onClick={() => {
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
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={newPatient.dob}
                  onChange={(e) => setNewPatient({ ...newPatient, dob: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Condition
                </label>
                <input
                  type="text"
                  value={newPatient.condition}
                  onChange={(e) => setNewPatient({ ...newPatient, condition: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Post-op ACL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newPatient.email}
                  onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="john@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={newPatient.address}
                  onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="123 Main Street, Sydney NSW 2000"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
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
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addNewPatient}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Add Patient
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {showEditPatientModal && editingPatient && !showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Edit Patient</h3>
              <button
                onClick={() => {
                  setShowEditPatientModal(false);
                  setEditingPatient(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingPatient.name}
                  onChange={(e) => setEditingPatient({ ...editingPatient, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={editingPatient.dob}
                  onChange={(e) => setEditingPatient({ ...editingPatient, dob: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Condition
                </label>
                <input
                  type="text"
                  value={editingPatient.condition}
                  onChange={(e) => setEditingPatient({ ...editingPatient, condition: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={editingPatient.email}
                  onChange={(e) => setEditingPatient({ ...editingPatient, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={editingPatient.phone}
                  onChange={(e) => setEditingPatient({ ...editingPatient, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={editingPatient.address}
                  onChange={(e) => setEditingPatient({ ...editingPatient, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEditPatientModal(false);
                  setEditingPatient(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  console.log('Opening delete confirmation');
                  setShowDeleteConfirm(true);
                }}
                type="button"
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2"
              >
                <Trash2 size={18} />
                Delete
              </button>
              <button
                onClick={saveEditPatient}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Delete Patient</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this patient? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editingPatient) {
                    deletePatient(editingPatient.id);
                  }
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Delete Patient
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold text-blue-600">Moveify App</h1>
              
              {/* Navigation Tabs - Only show in Clinician mode */}
              {userRole === 'clinician' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage('exercises')}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      currentPage === 'exercises'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Exercise Library
                  </button>
                  <button
                    onClick={() => {
                      setCurrentPage('patients');
                      setViewingPatient(null);
                    }}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      currentPage === 'patients'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Patients
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {userRole === 'clinician' && '👨‍⚕️ Clinician'}
                {userRole === 'patient' && `👤 ${loggedInPatient?.name}`}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {userRole === 'patient' ? (
          <PatientPortal />
        ) : currentPage === 'exercises' ? (
          <ExerciseLibrary />
        ) : viewingPatient ? (
          <PatientProfile patient={viewingPatient} />
        ) : (
          <PatientsPage />
        )}
      </div>
    </div>
  );
};

export default MoveifyApp;