import { useState, useEffect } from 'react';
import { Play, Check, TrendingUp, Calendar as CalendarIcon, BookOpen, ChevronLeft, ChevronRight, UserCircle, Download, Trash2, Clock, CheckCircle, XCircle, Mail, Phone, MapPin, Calendar, Stethoscope } from 'lucide-react';
import type { Patient, CompletionData, ProgramExercise, DailyCheckIn, DataRequest } from '../types/index.ts';
import { ProgressAnalytics } from './ProgressAnalytics';
import { PatientEducationModules } from './PatientEducationModules';
import { ExerciseCompletionModal } from './modals/ExerciseCompletionModal';
import DailyCheckInModal from './modals/DailyCheckInModal';
import BlockProgressBanner from './BlockProgressBanner';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';

interface PatientPortalProps {
  patient: Patient;
  onToggleComplete: (exerciseIndex: number, programIndex: number, completionData?: CompletionData) => void;
}

export const PatientPortal = ({ patient, onToggleComplete }: PatientPortalProps) => {
  const [selectedWeekDay, setSelectedWeekDay] = useState(new Date().getDay());
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next week, -1 = previous week
  const [selectedProgramIndex, setSelectedProgramIndex] = useState(0);
  const [activeView, setActiveView] = useState<'exercises' | 'progress' | 'education' | 'account'>('exercises');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<{
    exercise: ProgramExercise;
    exerciseIndex: number;
    programIndex: number;
    selectedDate?: Date;
  } | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [_hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const [blockRefreshKey, setBlockRefreshKey] = useState(0);
  const [blockInfo, setBlockInfo] = useState<{
    hasBlock: boolean;
    startDate?: string;
    currentWeek?: number;
    blockDuration?: number;
    status?: string;
  } | null>(null);
  const [dataRequests, setDataRequests] = useState<DataRequest[]>([]);
  const [dataRequestLoading, setDataRequestLoading] = useState(false);

  // Fetch patient's data requests
  const fetchMyDataRequests = async () => {
    try {
      const response = await fetch(`${API_URL}/data-requests/my`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setDataRequests(data.requests);
      }
    } catch {
      // Silently fail
    }
  };

  const handleRequestData = async (type: 'export' | 'deletion') => {
    setDataRequestLoading(true);
    try {
      const response = await fetch(`${API_URL}/data-requests`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ requestType: type })
      });
      const data = await response.json();
      if (response.ok) {
        await fetchMyDataRequests();
      } else {
        alert(data.error || 'Failed to submit request');
      }
    } catch {
      alert('Connection error');
    } finally {
      setDataRequestLoading(false);
    }
  };

  // Check if patient has completed check-in today + trigger block evaluation
  useEffect(() => {
    const checkTodayCheckIn = async () => {
      try {
        const response = await fetch(`${API_URL}/check-ins/today/${patient.id}`, {
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

  // Fetch data requests when Account tab is opened
  useEffect(() => {
    if (activeView === 'account') {
      fetchMyDataRequests();
    }
  }, [activeView]);

  // Fetch block status for the selected program
  useEffect(() => {
    const fetchBlockInfo = async () => {
      const program = patient.assignedPrograms?.[selectedProgramIndex];
      if (!program?.config?.id) {
        setBlockInfo(null);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/blocks/${program.config.id}`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setBlockInfo(data);
        } else {
          setBlockInfo(null);
        }
      } catch {
        setBlockInfo(null);
      }
    };

    fetchBlockInfo();
  }, [patient.assignedPrograms, selectedProgramIndex, blockRefreshKey]);

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

  // Determine if the selected date falls in a future block week (prescription not yet released)
  const isPrescriptionVisible = (): boolean => {
    if (!blockInfo?.hasBlock || !blockInfo.startDate || !blockInfo.currentWeek || blockInfo.status !== 'active') {
      return true; // No block — show normal prescription
    }
    const blockStart = new Date(blockInfo.startDate);
    blockStart.setHours(0, 0, 0, 0);
    const viewDate = new Date(selectedDate);
    viewDate.setHours(0, 0, 0, 0);
    const daysSinceBlockStart = (viewDate.getTime() - blockStart.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceBlockStart < 0) return true; // Before block started — show normal
    const viewingBlockWeek = Math.floor(daysSinceBlockStart / 7) + 1;
    return viewingBlockWeek <= blockInfo.currentWeek;
  };

  const showPrescription = isPrescriptionVisible();

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
        <div className="flex mt-5 border-b border-slate-200">
          {[
            { id: 'exercises', label: 'Exercises', icon: <CalendarIcon size={15} /> },
            { id: 'progress', label: 'Progress', icon: <TrendingUp size={15} /> },
            { id: 'education', label: 'Education', icon: <BookOpen size={15} /> },
            { id: 'account', label: 'Account', icon: <UserCircle size={15} /> },
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

      {activeView === 'account' ? (
        <div className="space-y-5">
          {/* Profile Card */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-primary-400 flex items-center justify-center text-xl font-bold text-white shrink-0">
                {patient.name?.[0]?.toUpperCase() || 'P'}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{patient.name}</h2>
                <p className="text-xs text-slate-400">Patient</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail size={15} className="text-slate-400 shrink-0" />
                <span className="text-slate-700">{patient.email}</span>
              </div>
              {patient.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700">{patient.phone}</span>
                </div>
              )}
              {patient.address && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700">{patient.address}</span>
                </div>
              )}
              {patient.dob && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700">{new Date(patient.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
              )}
              {patient.condition && (
                <div className="flex items-center gap-3 text-sm">
                  <Stethoscope size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700">{patient.condition}</span>
                </div>
              )}
            </div>
          </div>

          {/* Data Rights */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Your Data Rights</h3>
            <p className="text-xs text-gray-500 mb-4">
              Under the Australian Privacy Act, you can request a copy or deletion of your health data.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => handleRequestData('export')}
                disabled={dataRequestLoading || dataRequests.some(r => r.request_type === 'export' && (r.status === 'pending' || r.status === 'approved'))}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={18} className="text-blue-500 shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-medium text-blue-800">Request Data Export</p>
                  <p className="text-[11px] text-blue-600 mt-0.5">Get a copy of all your data</p>
                </div>
              </button>

              <button
                onClick={() => {
                  if (confirm('Are you sure you want to request deletion of all your health data? This cannot be undone once processed.')) {
                    handleRequestData('deletion');
                  }
                }}
                disabled={dataRequestLoading || dataRequests.some(r => r.request_type === 'deletion' && (r.status === 'pending' || r.status === 'approved'))}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={18} className="text-red-500 shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-medium text-red-800">Request Data Deletion</p>
                  <p className="text-[11px] text-red-600 mt-0.5">Permanently delete your data</p>
                </div>
              </button>
            </div>

            {/* Request History */}
            {dataRequests.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Request History</h4>
                <div className="space-y-1.5">
                  {dataRequests.map(req => (
                    <div key={req.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2.5">
                        {req.request_type === 'export' ? (
                          <Download size={14} className="text-blue-400" />
                        ) : (
                          <Trash2 size={14} className="text-red-400" />
                        )}
                        <span className="text-sm text-gray-700">
                          {req.request_type === 'export' ? 'Export' : 'Deletion'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(req.requested_at).toLocaleDateString()}
                        </span>
                      </div>
                      {req.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-50 text-yellow-600">
                          <Clock size={9} /> Pending
                        </span>
                      )}
                      {req.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">
                          <CheckCircle size={9} /> Approved
                        </span>
                      )}
                      {req.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-600">
                          <CheckCircle size={9} /> Completed
                        </span>
                      )}
                      {req.status === 'denied' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600">
                          <XCircle size={9} /> Denied
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : activeView === 'progress' ? (
        <ProgressAnalytics patientId={patient.id} apiUrl={API_URL} isPatientView={true} />
      ) : activeView === 'education' ? (
        <PatientEducationModules patientId={patient.id} isPatientView={true} />
      ) : (
        <>
          {/* Block Progress Banner */}
          {selectedProgram?.id && (
            <BlockProgressBanner programId={selectedProgram.id} refreshKey={blockRefreshKey} />
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
                      {program.exercises.filter(e => !!e.allCompletions?.[todayDate.toISOString().split('T')[0]]).length}/{program.exercises.length} completed today
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
                        </div>
                      </div>

                      {/* Prescribed Sets | Reps | Weight — blank for future block weeks */}
                      {showPrescription ? (
                        <p className="text-sm sm:text-base text-gray-700 font-semibold mb-3 sm:mb-4">
                          {exercise.sets} set{exercise.sets !== 1 ? 's' : ''} | {exercise.reps} rep{exercise.reps !== 1 ? 's' : ''}{(exercise.prescribedWeight || 0) > 0 && ` | ${exercise.prescribedWeight} kg`}
                        </p>
                      ) : (
                        <p className="text-sm sm:text-base text-gray-300 font-semibold mb-3 sm:mb-4">
                          &mdash;
                        </p>
                      )}

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
                        {!isProgramCompleted && showPrescription && (
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
