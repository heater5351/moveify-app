import { useState, useEffect } from 'react';
import { Play, Check, TrendingUp, Calendar as CalendarIcon } from 'lucide-react';
import type { Patient, CompletionData, ProgramExercise, DailyCheckIn } from '../types/index.ts';
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
  const [_hasCheckedInToday, setHasCheckedInToday] = useState(false);

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
      <div className="text-center py-12 px-4">
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
      {/* Daily Check-In Modal */}
      <DailyCheckInModal
        isOpen={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
        onSubmit={handleCheckInSubmit}
        patientId={patient.id}
      />

      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
          Welcome back, {patient.name.split(' ')[0]}!
        </h1>
        <p className="text-base sm:text-lg text-gray-600">Let's keep moving forward</p>

        {/* View Toggle - Full width on mobile */}
        <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6">
          <button
            onClick={() => setActiveView('exercises')}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all shadow-sm text-sm sm:text-base ${
              activeView === 'exercises'
                ? 'bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white shadow-md'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <CalendarIcon size={18} className="inline mr-1.5 sm:mr-2" />
            Exercises
          </button>
          <button
            onClick={() => setActiveView('progress')}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all shadow-sm text-sm sm:text-base ${
              activeView === 'progress'
                ? 'bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white shadow-md'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <TrendingUp size={18} className="inline mr-1.5 sm:mr-2" />
            Progress
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
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">Your Programs:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {patient.assignedPrograms.map((program, index) => (
                  <button
                    key={program.config.id}
                    onClick={() => setSelectedProgramIndex(index)}
                    className={`p-3 sm:p-4 rounded-xl font-medium transition-all text-left shadow-sm ${
                      selectedProgramIndex === index
                        ? 'bg-gradient-to-br from-moveify-teal to-moveify-ocean text-white shadow-lg'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <div className="font-semibold text-sm sm:text-base">{program.config.name}</div>
                    <div className="text-xs mt-1.5 sm:mt-2 opacity-90">
                      {program.exercises.filter(e => e.completed).length}/{program.exercises.length} completed
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Week View - Optimized for mobile */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-3 sm:p-6 mb-4 sm:mb-6">
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {daysOfWeek.map((day, index) => {
                const isToday = index === today;
                const isSelected = index === selectedWeekDay;
                const hasDot = selectedProgram.config.frequency.includes(day);

                const date = weekDates[index];
                const dayNum = date.getDate();

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedWeekDay(index)}
                    className={`relative p-2 sm:p-4 rounded-lg sm:rounded-xl font-medium transition-all ${isSelected
                      ? 'bg-gradient-to-br from-moveify-teal to-moveify-ocean text-white shadow-lg'
                      : isToday
                        ? 'bg-primary-50 text-blue-700 border-2 border-primary-300 shadow-sm'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                  >
                    <div className="text-center">
                      {/* Mobile: Single letter, Desktop: 3 letters */}
                      <div className="text-xs sm:text-base font-semibold">
                        <span className="sm:hidden">{day[0]}</span>
                        <span className="hidden sm:inline">{day}</span>
                      </div>
                      <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 opacity-80">{dayNum}</div>
                      {isToday && !isSelected && (
                        <div className="hidden sm:block text-xs mt-1 font-bold">Today</div>
                      )}
                    </div>
                    {hasDot && (
                      <div className={`absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full shadow-sm ${isSelected ? 'bg-white' : 'bg-green-500'
                        }`}></div>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Mobile: Show "Today" indicator below */}
            <div className="sm:hidden mt-2 text-center text-xs text-gray-500">
              {selectedWeekDay === today ? "Today's exercises" : dayNames[selectedWeekDay]}
            </div>
          </div>

          {/* Selected Day Display */}
          <div className="mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">
              <span className="hidden sm:inline">{dayNames[selectedWeekDay]}'s Exercises</span>
              <span className="sm:hidden">{dayNames[selectedWeekDay]}</span>
              {selectedWeekDay === today && <span className="text-moveify-teal"> (Today)</span>}
            </h2>

            {isProgramCompleted && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 mb-4">
                <p className="text-green-800 font-medium text-sm sm:text-base">✓ Program Completed</p>
                <p className="text-green-700 text-xs sm:text-sm">Great job! You've completed this program.</p>
              </div>
            )}
          </div>

          {/* Exercises Display - Card-based layout */}
          {!hasExercisesToday ? (
            <div className="bg-gray-50 rounded-xl p-8 sm:p-12 text-center">
              <p className="text-gray-500 text-base sm:text-lg">No exercises scheduled for {dayNames[selectedWeekDay]}</p>
              <p className="text-gray-400 text-xs sm:text-sm mt-2">
                Scheduled days: {selectedProgram.config.frequency.join(', ')}
              </p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              {todaysExercises.map((exercise, index) => (
                <div
                  key={index}
                  className={`bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-all ${isProgramCompleted ? 'opacity-75' : ''}`}
                >
                  {/* Mobile: Stacked layout, Desktop: Side-by-side */}
                  <div className="flex flex-col sm:flex-row">
                    {/* Video Thumbnail */}
                    <div className="relative w-full sm:w-48 lg:w-52 h-40 sm:h-36 bg-gradient-to-br from-moveify-teal via-moveify-ocean to-moveify-navy flex items-center justify-center flex-shrink-0">
                      <div className="absolute inset-0 bg-black opacity-10"></div>
                      <Play className="text-white relative z-10 drop-shadow-lg" size={48} />
                      {exercise.completed && (
                        <div className="absolute top-3 right-3 bg-green-500 text-white rounded-full p-1.5 sm:p-2 shadow-lg">
                          <Check size={16} className="sm:w-5 sm:h-5" />
                        </div>
                      )}
                      {/* Mobile: Show sets/weight overlay on video */}
                      <div className="sm:hidden absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                        <span className="text-lg font-bold text-moveify-teal">{exercise.sets}</span>
                        <span className="text-xs text-gray-600 ml-1">sets</span>
                        {(exercise.prescribedWeight || 0) > 0 && (
                          <>
                            <span className="text-xs text-gray-400 mx-1">•</span>
                            <span className="text-sm font-bold text-moveify-teal">{exercise.prescribedWeight}</span>
                            <span className="text-xs text-gray-600 ml-0.5">kg</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Exercise Details */}
                    <div className="flex-1 p-4 sm:p-5 lg:p-6">
                      <div className="flex items-start justify-between mb-2 sm:mb-3">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">{exercise.name}</h3>
                            {exercise.completed && (
                              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-lg">
                                ✓ Done
                              </span>
                            )}
                            {isProgramCompleted && (
                              <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-lg">
                                Ended
                              </span>
                            )}
                          </div>
                          <span className="inline-block text-xs sm:text-sm bg-gradient-to-r from-primary-50 to-primary-100 text-moveify-ocean px-3 py-1 rounded-full font-medium border border-blue-200">
                            {exercise.category}
                          </span>
                        </div>
                        {/* Desktop: Sets/weight display */}
                        <div className="hidden sm:block text-right bg-gradient-to-br from-primary-50 to-primary-100 px-4 py-2 rounded-xl border border-blue-200">
                          <p className="text-2xl lg:text-3xl font-bold text-moveify-teal">{exercise.sets}</p>
                          <p className="text-xs lg:text-sm text-blue-700 font-medium">sets</p>
                          {(exercise.prescribedWeight || 0) > 0 && (
                            <>
                              <p className="text-lg lg:text-xl font-bold text-moveify-teal mt-1">{exercise.prescribedWeight}</p>
                              <p className="text-xs lg:text-sm text-blue-700 font-medium">kg</p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mb-3 sm:mb-4 space-y-1.5 sm:space-y-2">
                        <p className="text-sm sm:text-base text-gray-700 font-semibold">
                          <span className="text-moveify-teal">{exercise.reps}</span> reps per set
                          {(exercise.prescribedWeight || 0) > 0 && (
                            <span className="ml-2">
                              @ <span className="text-moveify-teal">{exercise.prescribedWeight}</span> kg
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 sm:line-clamp-none">
                          {exercise.description}
                        </p>
                      </div>

                      {/* Buttons - Stack on mobile, side-by-side on desktop */}
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button className="w-full sm:flex-1 bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 font-semibold shadow-md hover:shadow-lg transition-all text-sm sm:text-base">
                          Watch Video
                        </button>
                        {!isProgramCompleted && (
                          <button
                            onClick={() => {
                              setSelectedExercise({ exercise, exerciseIndex: index, programIndex: selectedProgramIndex });
                              setShowCompletionModal(true);
                            }}
                            className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg text-sm sm:text-base ${exercise.completed
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
