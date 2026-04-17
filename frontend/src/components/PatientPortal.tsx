import { useState, useEffect, useMemo } from 'react';
import { Play, Check, TrendingUp, Calendar as CalendarIcon, BookOpen, ChevronLeft, ChevronRight, X, Info, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import type { Patient, CompletionData, ProgramExercise, DailyCheckIn } from '../types/index.ts';
import { ProgressAnalytics } from './ProgressAnalytics';
import { PatientEducationModules } from './PatientEducationModules';
import { ExerciseCompletionModal } from './modals/ExerciseCompletionModal';
import DailyCheckInModal from './modals/DailyCheckInModal';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';
import { toLocalDateString } from '../utils/date.ts';
import { exercises as defaultExercises } from '../data/exercises';
import { formatDuration, getExerciseType } from '../utils/duration';
import { LazyVideoCard, getThumbnailUrl } from './LazyVideoCard';

interface PatientPortalProps {
  patient: Patient;
  onToggleComplete: (exerciseIndex: number, programIndex: number, completionData?: CompletionData) => void;
}

export const PatientPortal = ({ patient, onToggleComplete }: PatientPortalProps) => {
  const [selectedWeekDay, setSelectedWeekDay] = useState(new Date().getDay());
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next week, -1 = previous week
  const [activeView, setActiveView] = useState<'exercises' | 'progress' | 'education'>('exercises');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showInfoBanner, setShowInfoBanner] = useState(() => {
    const dismissCount = parseInt(localStorage.getItem('moveify_tip_dismiss_count') || '0', 10);
    if (dismissCount >= 5) return false;
    const lastDismissed = localStorage.getItem('moveify_tip_last_dismissed');
    if (!lastDismissed) return true;
    const daysSince = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60 * 24);
    return daysSince >= 7;
  });
  const [selectedExercise, setSelectedExercise] = useState<{
    exercise: ProgramExercise;
    exerciseIndex: number;
    programIndex: number;
    selectedDate?: Date;
  } | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [_hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const [warmupCollapsed, setWarmupCollapsed] = useState<Record<number, boolean>>({});
  const [blockRefreshKey, setBlockRefreshKey] = useState(0);
  const [blockInfoMap, setBlockInfoMap] = useState<Map<number, {
    hasBlock: boolean;
    startDate?: string;
    currentWeek?: number;
    blockDuration?: number;
    status?: string;
  }>>(new Map());
  const [videoModal, setVideoModal] = useState<{ url: string; name: string; description?: string } | null>(null);

  // Build a lookup map from exercise name to video URL
  const exerciseLookup = useMemo(() => {
    const map = new Map<string, { videoUrl: string; description: string }>();
    for (const ex of defaultExercises) {
      if (ex.videoUrl) map.set(ex.name.toLowerCase(), { videoUrl: ex.videoUrl, description: ex.description });
    }
    return map;
  }, []);

  const getVideoUrl = (exerciseName: string): string | null => {
    return exerciseLookup.get(exerciseName.toLowerCase())?.videoUrl || null;
  };

  const getExerciseDescription = (exerciseName: string): string | undefined => {
    return exerciseLookup.get(exerciseName.toLowerCase())?.description;
  };

  // Check if patient has completed check-in today + trigger block evaluation
  useEffect(() => {
    const checkTodayCheckIn = async () => {
      try {
        const localDate = toLocalDateString(new Date());
        const response = await fetch(`${API_URL}/check-ins/today/${patient.id}?date=${localDate}`, {
          headers: getAuthHeaders()
        });
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

    // Lazily trigger block progression evaluation for each program
    const triggerEvaluations = async () => {
      if (!patient.assignedPrograms) return;
      for (const program of patient.assignedPrograms) {
        if (program.config.id) {
          try {
            await fetch(`${API_URL}/blocks/${program.config.id}/evaluate`, {
              method: 'PATCH',
              headers: getAuthHeaders()
            });
          } catch {
            // Evaluation is best-effort — don't block the UI
          }
        }
      }
      setBlockRefreshKey(k => k + 1);
    };

    checkTodayCheckIn();
    triggerEvaluations();
  }, [patient.id]);

  // Fetch block status for all programs
  useEffect(() => {
    const fetchAllBlockInfo = async () => {
      const newMap = new Map<number, typeof blockInfoMap extends Map<number, infer V> ? V : never>();
      for (const program of patient.assignedPrograms || []) {
        if (!program.config?.id) continue;
        try {
          const response = await fetch(`${API_URL}/blocks/${program.config.id}`, {
            headers: getAuthHeaders()
          });
          if (response.ok) {
            const data = await response.json();
            newMap.set(program.config.id, data);
          }
        } catch {
          // Silent
        }
      }
      setBlockInfoMap(newMap);
    };

    fetchAllBlockInfo();
  }, [patient.assignedPrograms, blockRefreshKey]);

  const handleCheckInSubmit = async (checkInData: Omit<DailyCheckIn, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch(`${API_URL}/check-ins`, {
        method: 'POST',
        headers: getAuthHeaders(),
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
  const selectedDateString = toLocalDateString(selectedDate);

  // Helper: parse a program's start date (avoids UTC shift by splitting manually)
  const getProgramStartDate = (program: typeof patient.assignedPrograms[0]): Date | null => {
    const startDateValue = program.config.startDate;
    if (!startDateValue) return null;
    if (typeof startDateValue === 'string' && startDateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = startDateValue.split('-').map(Number);
      const parsed = new Date(y, m - 1, d);
      return !isNaN(parsed.getTime()) ? parsed : null;
    }
    return null;
  };

  // Helper: check if a date is on or after a program's start date
  const isDateAfterProgramStart = (date: Date, program: typeof patient.assignedPrograms[0]): boolean => {
    const startDate = getProgramStartDate(program);
    if (!startDate) return true;
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate >= startDate;
  };

  // Helper: check if prescription is visible for a program on the selected date
  const isPrescriptionVisibleForProgram = (program: typeof patient.assignedPrograms[0]): boolean => {
    const blockInfo = program.config.id ? blockInfoMap.get(program.config.id) : null;
    if (!blockInfo?.hasBlock || !blockInfo.startDate || !blockInfo.currentWeek || blockInfo.status !== 'active') {
      return true;
    }
    const blockStart = new Date(blockInfo.startDate);
    blockStart.setHours(0, 0, 0, 0);
    const viewDate = new Date(selectedDate);
    viewDate.setHours(0, 0, 0, 0);
    const daysSinceBlockStart = (viewDate.getTime() - blockStart.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceBlockStart < 0) return true;
    const viewingBlockWeek = Math.floor(daysSinceBlockStart / 7) + 1;
    return viewingBlockWeek <= blockInfo.currentWeek;
  };

  // Check if selected date is too far in the future to allow completion (more than 1 day ahead)
  const isFutureDate = (): boolean => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    return selectedDate > tomorrow;
  };

  const canComplete = !isFutureDate();

  // Build merged exercise list grouped by program for the selected day
  type ProgramGroup = {
    programName: string;
    programIndex: number;
    programId?: number;
    isCompleted: boolean;
    showPrescription: boolean;
    exercises: (ProgramExercise & { originalIndex: number })[];
  };

  const programGroups: ProgramGroup[] = useMemo(() => {
    const groups: ProgramGroup[] = [];
    for (let pi = 0; pi < patient.assignedPrograms.length; pi++) {
      const program = patient.assignedPrograms[pi];
      const isScheduled = program.config.frequency.includes(selectedDayShort) && isDateAfterProgramStart(selectedDate, program);
      if (!isScheduled) continue;

      const enrichedExercises = program.exercises.map((ex, ei) => {
        const completionForDate = ex.allCompletions?.[selectedDateString];
        return {
          ...ex,
          completed: !!completionForDate,
          completionData: completionForDate || null,
          originalIndex: ei,
        };
      });

      groups.push({
        programName: program.config.name || `Program ${pi + 1}`,
        programIndex: pi,
        programId: program.config.id,
        isCompleted: program.config.duration === 'completed',
        showPrescription: isPrescriptionVisibleForProgram(program),
        exercises: enrichedExercises,
      });
    }
    return groups;
  }, [patient.assignedPrograms, selectedDayShort, selectedDateString, selectedDate, blockInfoMap]);

  const hasExercisesToday = programGroups.length > 0;

  // Check if ANY program is scheduled on a given day (for calendar dots)
  const isDayScheduled = (day: string, date: Date): boolean => {
    return patient.assignedPrograms.some(
      program => program.config.frequency.includes(day) && isDateAfterProgramStart(date, program)
    );
  };

  const renderExerciseCard = (exercise: ProgramExercise & { originalIndex: number }, group: ProgramGroup) => (
    <div
      key={`${group.programIndex}-${exercise.originalIndex}`}
      className={`bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-all ${group.isCompleted ? 'opacity-75' : ''}`}
    >
      <div className="flex flex-col sm:flex-row">
        <div
          className="relative w-full sm:w-48 lg:w-52 h-40 sm:h-36 bg-gradient-to-br from-moveify-teal via-moveify-ocean to-moveify-navy flex items-center justify-center flex-shrink-0 cursor-pointer"
          onClick={(e) => {
            const url = getVideoUrl(exercise.name);
            if (url) { e.stopPropagation(); setVideoModal({ url, name: exercise.name, description: getExerciseDescription(exercise.name) }); }
          }}
        >
          {getVideoUrl(exercise.name) ? (
            <LazyVideoCard src={getVideoUrl(exercise.name)!} className="absolute inset-0" />
          ) : (
            <div className="absolute inset-0 bg-black opacity-10"></div>
          )}
          <Play className="text-white relative z-10 drop-shadow-lg" size={48} />
          {exercise.completed && (
            <div className="absolute top-3 right-3 bg-green-500 text-white rounded-full p-1.5 sm:p-2 shadow-lg z-10">
              <Check size={16} className="sm:w-5 sm:h-5" />
            </div>
          )}
        </div>
        <div className="flex-1 p-4 sm:p-5 lg:p-6">
          <div className="flex items-start justify-between mb-3 sm:mb-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">{exercise.name}</h3>
                {exercise.completed && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-lg">Done</span>}
                {group.isCompleted && <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-lg">Ended</span>}
              </div>
            </div>
          </div>
          {group.showPrescription ? (
            <div className="mb-3 sm:mb-4">
              <p className="text-sm sm:text-base text-gray-700 font-semibold">
                {(() => {
                  const exType = getExerciseType(exercise);
                  if (exType === 'cardio') return exercise.prescribedDuration ? formatDuration(exercise.prescribedDuration) : 'As prescribed';
                  if (exType === 'duration') { const dur = exercise.prescribedDuration ? formatDuration(exercise.prescribedDuration) : '—'; return `${exercise.sets} set${exercise.sets !== 1 ? 's' : ''} | ${dur}`; }
                  return `${exercise.sets} set${exercise.sets !== 1 ? 's' : ''} | ${exercise.reps} rep${exercise.reps !== 1 ? 's' : ''}${(exercise.prescribedWeight || 0) > 0 ? ` | ${exercise.prescribedWeight} kg` : ''}`;
                })()}
              </p>
              {(exercise.restDuration || 0) > 0 && <p className="text-xs text-slate-500 mt-0.5">Rest: {formatDuration(exercise.restDuration!)}</p>}
            </div>
          ) : (
            <p className="text-sm sm:text-base text-gray-300 font-semibold mb-3 sm:mb-4">&mdash;</p>
          )}
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 mb-2">{exercise.description}</p>
          {exercise.instructions && (
            <div className="flex items-start gap-1.5 bg-primary-50 rounded-lg px-3 py-2 mb-3 sm:mb-4">
              <Info size={14} className="text-primary-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-primary-700">{exercise.instructions}</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {!group.isCompleted && group.showPrescription && canComplete && (
              <button
                onClick={() => {
                  const wd = getDatesForWeek(weekOffset);
                  const sd = wd[selectedWeekDay];
                  setSelectedExercise({ exercise, exerciseIndex: exercise.originalIndex, programIndex: group.programIndex, selectedDate: sd });
                  setShowCompletionModal(true);
                }}
                className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg text-sm sm:text-base ${exercise.completed
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700'
                  : 'bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-blue-400'}`}
              >
                {exercise.completed ? 'Edit' : 'Mark Complete'}
              </button>
            )}
            {!group.isCompleted && group.showPrescription && !canComplete && (
              <p className="text-xs text-slate-400 italic">Available to complete on the day</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

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
        <div className="flex mt-5 border-b border-slate-200">
          {[
            { id: 'exercises', label: 'Exercises', icon: <CalendarIcon size={15} /> },
            { id: 'progress', label: 'Progress', icon: <TrendingUp size={15} /> },
            { id: 'education', label: 'Education', icon: <BookOpen size={15} /> },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id as typeof activeView)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
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
        <ProgressAnalytics patientId={patient.id} apiUrl={API_URL} isPatientView={true} assignedPrograms={patient.assignedPrograms} />
      ) : activeView === 'education' ? (
        <PatientEducationModules patientId={patient.id} isPatientView={true} />
      ) : (
        <>
          {/* Completion tip banner */}
          {showInfoBanner && (
            <div className="bg-primary-50 rounded-xl px-4 py-3 mb-4 sm:mb-6 flex items-start gap-3 ring-1 ring-primary-100">
              <Info size={16} className="text-primary-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs sm:text-sm text-primary-700 flex-1">
                Mark your exercises as complete so your clinician can track your progress and adjust your sets, reps, and weights over time.
                <span className="block mt-1 text-primary-600 font-medium">P.S. You can speed this up by pressing "Completed as prescribed"</span>
              </p>
              <button
                onClick={() => {
                  setShowInfoBanner(false);
                  const count = parseInt(localStorage.getItem('moveify_tip_dismiss_count') || '0', 10) + 1;
                  localStorage.setItem('moveify_tip_dismiss_count', String(count));
                  localStorage.setItem('moveify_tip_last_dismissed', String(Date.now()));
                }}
                className="text-primary-400 hover:text-primary-600 flex-shrink-0 p-0.5"
                aria-label="Dismiss tip"
              >
                <X size={14} />
              </button>
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
                // Show green dot if ANY program is scheduled on this day
                const hasDot = isDayScheduled(day, date);
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
              {selectedWeekDay === today && weekOffset === 0 && <span className="text-moveify-teal"> (Today)</span>}
            </h2>
          </div>

          {/* Exercises Display - Grouped by program */}
          {!hasExercisesToday ? (
            <div className="bg-gray-50 rounded-xl p-8 sm:p-12 text-center">
              <p className="text-gray-500 text-base sm:text-lg">No exercises scheduled for {dayNames[selectedWeekDay]}</p>
              <p className="text-gray-400 text-xs sm:text-sm mt-2">Check other days on the calendar above</p>
            </div>
          ) : (
            <div className="space-y-6">
              {programGroups.map((group) => (
                <div key={group.programIndex}>
                  {/* Program Header — always show when multiple programs have exercises today */}
                  {programGroups.length > 1 && (
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{group.programName}</h3>
                      <div className="flex-1 h-px bg-slate-200" />
                      {group.isCompleted && (
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Completed</span>
                      )}
                    </div>
                  )}

                  {group.isCompleted && programGroups.length <= 1 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 mb-4">
                      <p className="text-green-800 font-medium text-sm sm:text-base">Program Completed</p>
                      <p className="text-green-700 text-xs sm:text-sm">Great job! You've completed this program.</p>
                    </div>
                  )}

                  <div className="space-y-4 sm:space-y-5">
                    {/* Warm-up section (collapsible) */}
                    {(() => {
                      const warmups = group.exercises.filter(ex => ex.isWarmup);
                      const mains = group.exercises.filter(ex => !ex.isWarmup);
                      const hasWarmup = warmups.length > 0;
                      const isCollapsed = warmupCollapsed[group.programIndex] ?? false;
                      return (
                        <>
                          {hasWarmup && (
                            <>
                              <button
                                onClick={() => setWarmupCollapsed(prev => ({ ...prev, [group.programIndex]: !isCollapsed }))}
                                className="flex items-center gap-2 w-full text-left py-2"
                              >
                                <Flame size={16} className="text-amber-500" />
                                <span className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Warm Up</span>
                                <span className="text-xs text-amber-500">({warmups.length})</span>
                                <div className="flex-1 h-px bg-amber-200 ml-2" />
                                {isCollapsed ? <ChevronDown size={16} className="text-amber-400" /> : <ChevronUp size={16} className="text-amber-400" />}
                              </button>
                              {!isCollapsed && warmups.map((exercise) => (
                                <div key={`warmup-${group.programIndex}-${exercise.originalIndex}`}>
                                  {renderExerciseCard(exercise, group)}
                                </div>
                              ))}
                            </>
                          )}
                          {hasWarmup && mains.length > 0 && (
                            <div className="flex items-center gap-2 py-2">
                              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Exercise Program</span>
                              <span className="text-xs text-slate-400">({mains.length})</span>
                              <div className="flex-1 h-px bg-slate-200 ml-2" />
                            </div>
                          )}
                          {mains.map((exercise) => (
                            <div key={`main-${group.programIndex}-${exercise.originalIndex}`}>
                              {renderExerciseCard(exercise, group)}
                            </div>
                          ))}
                        </>
                      );
                    })()}
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

      {/* Video Playback Modal */}
      {videoModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setVideoModal(null)}
        >
          <div
            className="relative w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setVideoModal(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X size={28} />
            </button>
            <p className="text-white text-sm font-medium mb-2">{videoModal.name}</p>
            <video
              src={videoModal.url}
              className="w-full rounded-t-xl"
              controls
              muted
              autoPlay
              playsInline
              poster={getThumbnailUrl(videoModal.url)}
            />
            {videoModal.description && (
              <div className="bg-white rounded-b-xl px-4 py-3">
                <p className="text-sm text-gray-700 leading-relaxed">{videoModal.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
