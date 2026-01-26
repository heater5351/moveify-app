import { useState, useEffect } from 'react';
import { Play, Check, TrendingUp, Calendar as CalendarIcon } from 'lucide-react';
import type { Patient, CompletionData, ProgramExercise } from '../types/index.ts';
import { ProgressAnalytics } from './ProgressAnalytics';
import { ExerciseCompletionModal } from './modals/ExerciseCompletionModal';
import DailyCheckInModal from './modals/DailyCheckInModal';
import BlockProgressBanner from './BlockProgressBanner';
import { API_URL } from '../config';

interface PatientPortalProps {
  patient: Patient;
  onToggleComplete: (exerciseIndex: number, programIndex: number, completionData?: CompletionData) => void;
}

export const PatientPortal = ({ patient, onToggleComplete }: PatientPortalProps) => {
  const [selectedWeekDay, setSelectedWeekDay] = useState(new Date().getDay());
  const [selectedProgramIndex, setSelectedProgramIndex] = useState(0);
  const [activeView, setActiveView] = useState<'exercises' | 'progress'>('exercises');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<{
    exercise: ProgramExercise;
    exerciseIndex: number;
    programIndex: number;
  } | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);

  // Check if patient has completed check-in today
  useEffect(() => {
    const checkTodayCheckIn = async () => {
      try {
        const response = await fetch(`${API_URL}/check-ins/today/${patient.id}`);
        if (response.ok) {
          setHasCheckedInToday(true);
        } else {
          // No check-in today, show modal
          setShowCheckInModal(true);
        }
      } catch (error) {
        console.error('Error checking daily check-in:', error);
        // Show modal if there's an error (better to ask than miss it)
        setShowCheckInModal(true);
      }
    };

    checkTodayCheckIn();
  }, [patient.id]);

  const handleCheckInSubmit = async (checkInData: Omit<DailyCheckIn, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch(`${API_URL}/check-ins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkInData),
      });

      if (!response.ok) {
        throw new Error('Failed to submit check-in');
      }

      const result = await response.json();
      setHasCheckedInToday(true);
      return result;
    } catch (error) {
      console.error('Error submitting check-in:', error);
      throw error;
    }
  };

  if (!patient.assignedPrograms || patient.assignedPrograms.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No exercises assigned yet. Please check back later.</p>
      </div>
    );
  }

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date().getDay();

  // Generate dates for the current week (Sunday to Saturday)
  const getDatesForWeek = () => {
    const dates: Date[] = [];
    const todayDate = new Date();
    const currentDay = todayDate.getDay(); // 0 = Sunday

    for (let i = 0; i < 7; i++) {
      const date = new Date(todayDate);
      date.setDate(todayDate.getDate() - currentDay + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getDatesForWeek();
  const selectedDayShort = daysOfWeek[selectedWeekDay];

  const selectedProgram = patient.assignedPrograms[selectedProgramIndex];

  const hasExercisesToday = selectedProgram.config.frequency.includes(selectedDayShort);
  const todaysExercises = hasExercisesToday ? selectedProgram.exercises : [];
  const isProgramCompleted = selectedProgram.config.duration === 'completed';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Daily Check-In Modal */}
      <DailyCheckInModal
        isOpen={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
        onSubmit={handleCheckInSubmit}
        patientId={patient.id}
      />

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome back, {patient.name}!</h1>
        <p className="text-lg text-gray-600">Let's keep moving forward</p>

        {/* View Toggle */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setActiveView('exercises')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all shadow-sm ${
              activeView === 'exercises'
                ? 'bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <CalendarIcon size={20} className="inline mr-2" />
            Exercises
          </button>
          <button
            onClick={() => setActiveView('progress')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all shadow-sm ${
              activeView === 'progress'
                ? 'bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <TrendingUp size={20} className="inline mr-2" />
            My Progress
          </button>
        </div>
      </div>

      {activeView === 'progress' ? (
        <ProgressAnalytics patientId={patient.id} apiUrl={API_URL} />
      ) : (
        <>
      {/* Block Progress Banner */}
      {selectedProgram?.id && (
        <BlockProgressBanner programId={selectedProgram.id} />
      )}

      {/* Program Selector */}
      {patient.assignedPrograms.length > 1 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Your Programs:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {patient.assignedPrograms.map((program, index) => (
              <button
                key={program.config.id}
                onClick={() => setSelectedProgramIndex(index)}
                className={`p-4 rounded-xl font-medium transition-all text-left shadow-sm ${
                  selectedProgramIndex === index
                    ? 'bg-gradient-to-br from-moveify-teal to-moveify-ocean text-white shadow-lg scale-105'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <div className="font-semibold text-base">{program.config.name}</div>
                <div className="text-xs mt-2 opacity-90">
                  {program.exercises.filter(e => e.completed).length}/{program.exercises.length} exercises completed
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Week View */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-7 gap-2">
          {daysOfWeek.map((day, index) => {
            const isToday = index === today;
            const isSelected = index === selectedWeekDay;
            const hasDot = selectedProgram.config.frequency.includes(day);

            const date = weekDates[index];
            const dayNum = date.getDate();
            const monthNum = date.getMonth() + 1;

            return (
              <button
                key={day}
                onClick={() => setSelectedWeekDay(index)}
                className={`relative p-4 rounded-xl font-medium transition-all ${isSelected
                  ? 'bg-gradient-to-br from-moveify-teal to-moveify-ocean text-white shadow-lg scale-105'
                  : isToday
                    ? 'bg-primary-50 text-blue-700 border-2 border-primary-300 shadow-sm'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
              >
                <div className="text-center">
                  <div className="text-base font-semibold">{day}</div>
                  <div className="text-xs mt-1 opacity-80">{dayNum}/{monthNum}</div>
                  {isToday && !isSelected && (
                    <div className="text-xs mt-1 font-bold">Today</div>
                  )}
                </div>
                {hasDot && (
                  <div className={`absolute top-2 right-2 w-2 h-2 rounded-full shadow-sm ${isSelected ? 'bg-white' : 'bg-green-500'
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
          {selectedWeekDay === today && <span className="text-moveify-teal"> (Today)</span>}
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
          <p className="text-gray-400 text-sm mt-2">
            Your scheduled days: {selectedProgram.config.frequency.join(', ')}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {todaysExercises.map((exercise, index) => (
            <div key={index} className={`bg-white rounded-2xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-all hover:scale-[1.01] ${isProgramCompleted ? 'opacity-75' : ''
              }`}>
              <div className="flex gap-6">
                {/* Video Placeholder */}
                <div className="flex-shrink-0 w-52 h-36 bg-gradient-to-br from-moveify-teal via-moveify-ocean to-moveify-navy rounded-xl flex items-center justify-center relative shadow-md overflow-hidden">
                  <div className="absolute inset-0 bg-black opacity-10"></div>
                  <Play className="text-white relative z-10 drop-shadow-lg" size={56} />
                  {exercise.completed && (
                    <div className="absolute top-3 right-3 bg-green-500 text-white rounded-full p-2 shadow-lg">
                      <Check size={20} />
                    </div>
                  )}
                </div>

                {/* Exercise Details */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-gray-900">{exercise.name}</h3>
                        {exercise.completed && (
                          <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-lg">
                            ✓ Done
                          </span>
                        )}
                        {isProgramCompleted && (
                          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1.5 rounded-lg">
                            Program Ended
                          </span>
                        )}
                      </div>
                      <span className="inline-block text-sm bg-gradient-to-r from-primary-50 to-primary-100 text-moveify-ocean px-4 py-1.5 rounded-full font-medium border border-blue-200">
                        {exercise.category}
                      </span>
                    </div>
                    <div className="text-right bg-gradient-to-br from-primary-50 to-primary-100 px-5 py-3 rounded-xl border border-blue-200">
                      <p className="text-3xl font-bold text-moveify-teal">{exercise.sets}</p>
                      <p className="text-sm text-blue-700 font-medium">sets</p>
                    </div>
                  </div>

                  <div className="mb-4 space-y-2">
                    <p className="text-gray-700 font-semibold">
                      <span className="text-moveify-teal">{exercise.reps}</span> reps per set
                    </p>
                    <p className="text-gray-600 leading-relaxed">{exercise.description}</p>
                  </div>

                  <div className="flex gap-3">
                    <button className="flex-1 bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 font-semibold shadow-md hover:shadow-lg transition-all">
                      Watch Video
                    </button>
                    {!isProgramCompleted && (
                      <button
                        onClick={() => {
                          setSelectedExercise({ exercise, exerciseIndex: index, programIndex: selectedProgramIndex });
                          setShowCompletionModal(true);
                        }}
                        className={`px-6 py-3 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg ${exercise.completed
                          ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700'
                          : 'bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-blue-400'
                          }`}
                      >
                        {exercise.completed ? 'Edit' : 'Mark Complete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Exercise Completion Modal */}
      {showCompletionModal && selectedExercise && (
        <ExerciseCompletionModal
          exercise={selectedExercise.exercise}
          patientId={patient.id}
          programConfig={patient.assignedPrograms[selectedExercise.programIndex].config}
          existingCompletion={selectedExercise.exercise.completionData}
          onComplete={(data) => {
            onToggleComplete(
              selectedExercise.exerciseIndex,
              selectedExercise.programIndex,
              data
            );
            setShowCompletionModal(false);
            setSelectedExercise(null);
          }}
          onCancel={() => {
            setShowCompletionModal(false);
            setSelectedExercise(null);
          }}
        />
      )}
    </div>
  );
};
