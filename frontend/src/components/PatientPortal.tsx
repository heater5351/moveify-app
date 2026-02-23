import { useState, useEffect } from 'react';
import { Play, Check, TrendingUp, Calendar as CalendarIcon, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Patient, CompletionData, ProgramExercise, DailyCheckIn } from '../types/index.ts';
import { ProgressAnalytics } from './ProgressAnalytics';
import { PatientEducationModules } from './PatientEducationModules';
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
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next week, -1 = previous week
  const [selectedProgramIndex, setSelectedProgramIndex] = useState(0);
  const [activeView, setActiveView] = useState<'exercises' | 'progress' | 'education'>('exercises');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<{
    exercise: ProgramExercise;
    exerciseIndex: number;
    programIndex: number;
    selectedDate?: Date;
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
      <div className="text-center py-16 px-4 bg-white rounded-xl ring-1 ring-slate-200">
        <p className="text-slate-500 text-sm">No exercises assigned yet. Please check back later.</p>
      </div>
    );
  }

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date().getDay();
  const todayDate = new Date();

  // Generate dates for the current week + offset (Sunday to Saturday)
  const getDatesForWeek = (offset: number) => {
    const dates: Date[] = [];
    const currentDay = todayDate.getDay(); // 0 = Sunday
    const weekStartOffset = offset * 7; // Days to offset

    for (let i = 0; i < 7; i++) {
      const date = new Date(todayDate);
      date.setDate(todayDate.getDate() - currentDay + i + weekStartOffset);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getDatesForWeek(weekOffset);

  // Check if a date is today
  const isToday = (date: Date) => {
    return date.toDateString() === todayDate.toDateString();
  };

  // Get week label
  const getWeekLabel = () => {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    if (weekOffset > 1) return `${weekOffset} Weeks Ahead`;
    return `${Math.abs(weekOffset)} Weeks Ago`;
  };
  const selectedDayShort = daysOfWeek[selectedWeekDay];
  const selectedDate = weekDates[selectedWeekDay];
  const selectedDateString = selectedDate.toISOString().split('T')[0];

  const selectedProgram = patient.assignedPrograms[selectedProgramIndex];

  // Parse program start date (handles both date strings and legacy 'today'/'tomorrow' values)
  const getProgramStartDate = (): Date | null => {
    const startDateValue = selectedProgram.config.startDate;
    if (!startDateValue) return null;

    // If it's already a date string (YYYY-MM-DD format)
    if (typeof startDateValue === 'string' && startDateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsed = new Date(startDateValue);
      parsed.setHours(0, 0, 0, 0);
      return !isNaN(parsed.getTime()) ? parsed : null;
    }

    // Legacy values - can't determine actual date, return null (show all days)
    return null;
  };

  const programStartDate = getProgramStartDate();

  // Check if a date is on or after program start date
  const isDateAfterProgramStart = (date: Date): boolean => {
    if (!programStartDate) return true; // If no valid start date, show all
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate >= programStartDate;
  };

  const hasExercisesToday = selectedProgram.config.frequency.includes(selectedDayShort) && isDateAfterProgramStart(selectedDate);

  // Enrich exercises with completion data for the selected date
  const todaysExercises = hasExercisesToday
    ? selectedProgram.exercises.map(ex => {
        const completionForDate = ex.allCompletions?.[selectedDateString];
        return {
          ...ex,
          completed: !!completionForDate,
          completionData: completionForDate || null
        };
      })
    : [];

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
        <h1 className="text-xl sm:text-2xl font-semibold font-display text-secondary-500 tracking-tight mb-0.5">
          Welcome back, {patient.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-slate-500">Let's keep moving forward</p>

        {/* View Toggle */}
        <div className="flex gap-2 mt-5 border-b border-slate-200">
          {[
            { id: 'exercises', label: 'Exercises', icon: <CalendarIcon size={15} /> },
            { id: 'progress', label: 'Progress', icon: <TrendingUp size={15} /> },
            { id: 'education', label: 'Education', icon: <BookOpen size={15} /> },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id as typeof activeView)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeView === id
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

      {activeView === 'progress' ? (
        <ProgressAnalytics patientId={patient.id} apiUrl={API_URL} isPatientView={true} />
      ) : activeView === 'education' ? (
        <PatientEducationModules patientId={patient.id} isPatientView={true} />
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

          {/* Week View - Optimized for mobile with navigation */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-3 sm:p-6 mb-4 sm:mb-6">
            {/* Week Navigation Header */}
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <button
                onClick={() => setWeekOffset(weekOffset - 1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Previous week"
              >
                <ChevronLeft size={20} className="text-gray-600" />
              </button>
              <div className="text-center">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">{getWeekLabel()}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => setWeekOffset(weekOffset + 1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Next week"
              >
                <ChevronRight size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Week Back to Today Button */}
            {weekOffset !== 0 && (
              <div className="mb-3">
                <button
                  onClick={() => setWeekOffset(0)}
                  className="w-full py-1.5 px-3 text-xs sm:text-sm font-medium text-moveify-teal hover:bg-primary-50 rounded-lg transition-colors"
                >
                  Jump to This Week
                </button>
              </div>
            )}

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {daysOfWeek.map((day, index) => {
                const date = weekDates[index];
                const isTodayDate = isToday(date);
                const isSelected = index === selectedWeekDay;
                // Only show green dot if day matches frequency AND date is >= program start date
                const hasDot = selectedProgram.config.frequency.includes(day) && isDateAfterProgramStart(date);
                const dayNum = date.getDate();
                const isPast = date < todayDate && !isTodayDate;

                return (
                  <button
                    key={`${day}-${weekOffset}-${index}`}
                    onClick={() => setSelectedWeekDay(index)}
                    className={`relative p-2 sm:p-4 rounded-lg sm:rounded-xl font-medium transition-all ${
                      isSelected
                        ? 'bg-gradient-to-br from-moveify-teal to-moveify-ocean text-white shadow-lg'
                        : isTodayDate
                        ? 'bg-white text-moveify-teal border-2 border-moveify-teal shadow-sm'
                        : isPast
                        ? 'bg-gray-100 text-gray-400 border border-gray-200'
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
                      {isTodayDate && !isSelected && (
                        <div className="hidden sm:block text-xs mt-1 font-bold">Today</div>
                      )}
                    </div>
                    {hasDot && (
                      <div className={`absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full shadow-sm ${
                        isSelected ? 'bg-white' : 'bg-green-500'
                      }`}></div>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Mobile: Show "Today" indicator below */}
            <div className="sm:hidden mt-2 text-center text-xs text-gray-500">
              {isToday(weekDates[selectedWeekDay]) ? "Today's exercises" : dayNames[selectedWeekDay]}
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
                    </div>

                    {/* Exercise Details */}
                    <div className="flex-1 p-4 sm:p-5 lg:p-6">
                      <div className="flex items-start justify-between mb-3 sm:mb-4">
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
                          <span className="inline-block text-xs sm:text-sm bg-white text-moveify-ocean px-3 py-1 rounded-full font-medium border border-gray-200">
                            {exercise.category}
                          </span>
                        </div>
                      </div>

                      {/* Prescribed Sets | Reps | Weight */}
                      <p className="text-sm sm:text-base text-gray-700 font-semibold mb-3 sm:mb-4">
                        {exercise.sets} set{exercise.sets !== 1 ? 's' : ''} | {exercise.reps} rep{exercise.reps !== 1 ? 's' : ''}{(exercise.prescribedWeight || 0) > 0 && ` | ${exercise.prescribedWeight} kg`}
                      </p>

                      <div className="mb-3 sm:mb-4 space-y-1.5 sm:space-y-2">
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
                              // Calculate the actual date for the selected day
                              const weekDates = getDatesForWeek(weekOffset);
                              const selectedDate = weekDates[selectedWeekDay];

                              setSelectedExercise({
                                exercise,
                                exerciseIndex: index,
                                programIndex: selectedProgramIndex,
                                selectedDate
                              });
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
          selectedDate={selectedExercise.selectedDate}
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
