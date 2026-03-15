import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Heart, Dumbbell, Moon, Zap, Frown, Meh, Smile, CheckCircle, Circle, ClipboardList } from 'lucide-react';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';
import { formatDuration } from '../utils/duration';
import { toLocalDateString } from '../utils/date.ts';
import type { DailyCheckIn, ExerciseCompletion, AssignedProgram, ProgramExercise } from '../types/index.ts';

// ── Color helpers (matching ProgressAnalytics thresholds) ────────────
const PAIN_THRESHOLDS = { low: 3, moderate: 6 };

const getPainColor = (pain: number) => {
  if (pain <= PAIN_THRESHOLDS.low) return 'text-green-600';
  if (pain <= PAIN_THRESHOLDS.moderate) return 'text-yellow-600';
  return 'text-red-600';
};

const getPainBg = (pain: number) => {
  if (pain <= PAIN_THRESHOLDS.low) return 'bg-green-500';
  if (pain <= PAIN_THRESHOLDS.moderate) return 'bg-yellow-500';
  return 'bg-red-500';
};

const getRatingColor = (val: number, max: number) => {
  const pct = val / max;
  if (pct >= 0.8) return 'bg-green-500';
  if (pct >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
};

const getFeelingIcon = (val: number) => {
  if (val >= 4) return <Smile size={18} className="text-green-500" />;
  if (val >= 3) return <Meh size={18} className="text-yellow-500" />;
  return <Frown size={18} className="text-red-500" />;
};

const getFeelingLabel = (val: number) => {
  const labels: Record<number, string> = { 1: 'Very Poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Great' };
  return labels[val] || '';
};

const formatDisplayDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
};

const isToday = (dateStr: string) => toLocalDateString(new Date()) === dateStr;
const isYesterday = (dateStr: string) => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return toLocalDateString(y) === dateStr;
};

const getDateLabel = (dateStr: string) => {
  if (isToday(dateStr)) return 'Today';
  if (isYesterday(dateStr)) return 'Yesterday';
  return formatDisplayDate(dateStr);
};

// ── Schedule helpers ─────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function normalizeDateStr(d: string | Date | undefined): string {
  if (!d) return '';
  if (typeof d === 'string') return d.split('T')[0];
  return toLocalDateString(d);
}

function getEndDateStr(startDate: string, duration: string, customEndDate?: string): string | null {
  if (duration === 'ongoing') return null;
  if (duration === 'custom' && customEndDate) return normalizeDateStr(customEndDate);
  if (duration === 'completed') return null; // completed programs are filtered out

  const durationWeeks: Record<string, number> = {
    '1week': 1, '2weeks': 2, '4weeks': 4, '6weeks': 6,
  };
  const weeks = durationWeeks[duration];
  if (!weeks) return null;

  const start = new Date(startDate + 'T00:00:00');
  start.setDate(start.getDate() + weeks * 7);
  return toLocalDateString(start);
}

function isProgramScheduledOnDate(program: AssignedProgram, dateStr: string): boolean {
  const config = program.config;
  if (config.duration === 'completed') return false;

  const startDate = normalizeDateStr(config.startDate);
  if (!startDate || dateStr < startDate) return false;

  const endDate = getEndDateStr(startDate, config.duration, config.customEndDate);
  if (endDate && dateStr > endDate) return false;

  // Check day of week matches frequency
  const d = new Date(dateStr + 'T00:00:00');
  const dayName = DAY_NAMES[d.getDay()];
  return config.frequency.includes(dayName);
}

type PrescribedExercise = {
  programName: string;
  exercise: ProgramExercise;
  completion: ExerciseCompletion | null;
};

// ── Component ────────────────────────────────────────────────────────

interface DailyActivityViewProps {
  patientId: number;
  assignedPrograms?: AssignedProgram[];
}

export const DailyActivityView = ({ patientId, assignedPrograms }: DailyActivityViewProps) => {
  const [loading, setLoading] = useState(true);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [completions, setCompletions] = useState<ExerciseCompletion[]>([]);
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()));

  // Generate date strip: 30 days back from today
  const dateStrip = useMemo(() => {
    const dates: string[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(toLocalDateString(d));
    }
    return dates;
  }, []);

  // Fetch data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [completionsRes, checkInsRes] = await Promise.all([
          fetch(`${API_URL}/programs/exercise-completions/patient/${patientId}?days=30`, { headers: getAuthHeaders() }),
          fetch(`${API_URL}/check-ins/patient/${patientId}?days=30`, { headers: getAuthHeaders() }),
        ]);

        if (completionsRes.ok) {
          const data = await completionsRes.json();
          setCompletions(data.completions || []);
        }
        if (checkInsRes.ok) {
          const data = await checkInsRes.json();
          setCheckIns(data.checkIns || []);
        }
      } catch {
        // Silent — will show empty state
      }
      setLoading(false);
    };
    loadData();
  }, [patientId]);

  // Group data by date
  const checkInByDate = useMemo(() => {
    const map = new Map<string, DailyCheckIn>();
    for (const ci of checkIns) {
      const dateStr = typeof ci.checkInDate === 'string'
        ? ci.checkInDate.split('T')[0]
        : toLocalDateString(new Date(ci.checkInDate));
      map.set(dateStr, ci);
    }
    return map;
  }, [checkIns]);

  const completionsByDate = useMemo(() => {
    const map = new Map<string, ExerciseCompletion[]>();
    for (const c of completions) {
      const dateStr = typeof c.completionDate === 'string'
        ? c.completionDate.split('T')[0]
        : toLocalDateString(new Date(c.completionDate));
      const arr = map.get(dateStr) || [];
      arr.push(c);
      map.set(dateStr, arr);
    }
    return map;
  }, [completions]);

  // Compute prescribed exercises for selected date
  const prescribedForDate = useMemo((): PrescribedExercise[] => {
    if (!assignedPrograms || assignedPrograms.length === 0) return [];

    const dayCompletions = completionsByDate.get(selectedDate) || [];

    const prescribed: PrescribedExercise[] = [];
    for (const program of assignedPrograms) {
      if (!isProgramScheduledOnDate(program, selectedDate)) continue;

      const programName = program.config.name || 'Program';
      for (const ex of program.exercises) {
        // Match completion by exercise name (completions use exerciseName)
        const completion = dayCompletions.find(c => c.exerciseName === ex.name) || null;
        prescribed.push({ programName, exercise: ex, completion });
      }
    }
    return prescribed;
  }, [assignedPrograms, selectedDate, completionsByDate]);

  // Find completions that don't match any prescribed exercise (ad-hoc completions)
  const extraCompletions = useMemo(() => {
    const dayCompletions = completionsByDate.get(selectedDate) || [];
    if (prescribedForDate.length === 0) return dayCompletions;

    const prescribedNames = new Set(prescribedForDate.map(p => p.exercise.name));
    return dayCompletions.filter(c => !prescribedNames.has(c.exerciseName));
  }, [completionsByDate, selectedDate, prescribedForDate]);

  // Dates that have any data (for dot indicators)
  const datesWithData = useMemo(() => {
    const s = new Set<string>();
    checkInByDate.forEach((_, k) => s.add(k));
    completionsByDate.forEach((_, k) => s.add(k));
    // Also mark dates that have prescribed exercises
    if (assignedPrograms) {
      for (const dateStr of dateStrip) {
        for (const program of assignedPrograms) {
          if (isProgramScheduledOnDate(program, dateStr)) {
            s.add(dateStr);
            break;
          }
        }
      }
    }
    return s;
  }, [checkInByDate, completionsByDate, assignedPrograms, dateStrip]);

  const dayCheckIn = checkInByDate.get(selectedDate);

  // Group prescribed exercises by program
  const prescribedByProgram = useMemo(() => {
    const map = new Map<string, PrescribedExercise[]>();
    for (const p of prescribedForDate) {
      const arr = map.get(p.programName) || [];
      arr.push(p);
      map.set(p.programName, arr);
    }
    return map;
  }, [prescribedForDate]);

  const completedCount = prescribedForDate.filter(p => p.completion).length;
  const totalPrescribed = prescribedForDate.length;

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-400 border-r-transparent mb-3" />
        <p className="text-slate-500 text-sm">Loading activity data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Date Navigator Strip */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const idx = dateStrip.indexOf(selectedDate);
              if (idx > 0) setSelectedDate(dateStrip[idx - 1]);
            }}
            disabled={dateStrip.indexOf(selectedDate) === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent flex-shrink-0"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1 min-w-max">
              {dateStrip.map(dateStr => {
                const d = new Date(dateStr + 'T00:00:00');
                const isSelected = dateStr === selectedDate;
                const hasData = datesWithData.has(dateStr);
                const today = isToday(dateStr);

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg text-xs transition-colors min-w-[44px] ${
                      isSelected
                        ? 'bg-primary-400 text-white'
                        : today
                        ? 'bg-primary-50 text-primary-600 ring-1 ring-primary-200'
                        : 'hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    <span className="font-medium">{d.toLocaleDateString('en-AU', { weekday: 'narrow' })}</span>
                    <span className={`text-sm font-semibold ${isSelected ? 'text-white' : ''}`}>{d.getDate()}</span>
                    {hasData && !isSelected && (
                      <div className="w-1 h-1 rounded-full bg-primary-400 mt-0.5" />
                    )}
                    {hasData && isSelected && (
                      <div className="w-1 h-1 rounded-full bg-white/80 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => {
              const idx = dateStrip.indexOf(selectedDate);
              if (idx < dateStrip.length - 1) setSelectedDate(dateStrip[idx + 1]);
            }}
            disabled={dateStrip.indexOf(selectedDate) === dateStrip.length - 1}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent flex-shrink-0"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <p className="text-center text-sm font-medium text-slate-700 mt-2">
          {getDateLabel(selectedDate)}
        </p>
      </div>

      {/* No data for selected date */}
      {!dayCheckIn && prescribedForDate.length === 0 && extraCompletions.length === 0 && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-8 text-center">
          <p className="text-slate-400 text-sm">No activity recorded on this day</p>
        </div>
      )}

      {/* Check-In Card */}
      {dayCheckIn && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Heart size={14} className="text-red-500" />
            Daily Check-In
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Overall Feeling */}
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Feeling</span>
                {getFeelingIcon(dayCheckIn.overallFeeling)}
              </div>
              <p className="text-xl font-bold text-slate-800">{dayCheckIn.overallFeeling}<span className="text-sm font-normal text-slate-400">/5</span></p>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                <div className={`h-full rounded-full ${getRatingColor(dayCheckIn.overallFeeling, 5)}`} style={{ width: `${(dayCheckIn.overallFeeling / 5) * 100}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-1">{getFeelingLabel(dayCheckIn.overallFeeling)}</p>
            </div>

            {/* Pain */}
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Pain</span>
              </div>
              <p className={`text-xl font-bold ${getPainColor(dayCheckIn.generalPainLevel)}`}>
                {dayCheckIn.generalPainLevel}<span className="text-sm font-normal text-slate-400">/10</span>
              </p>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                <div className={`h-full rounded-full ${getPainBg(dayCheckIn.generalPainLevel)}`} style={{ width: `${(dayCheckIn.generalPainLevel / 10) * 100}%` }} />
              </div>
            </div>

            {/* Energy */}
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Energy</span>
                <Zap size={16} className="text-yellow-500" />
              </div>
              <p className="text-xl font-bold text-slate-800">{dayCheckIn.energyLevel}<span className="text-sm font-normal text-slate-400">/5</span></p>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                <div className={`h-full rounded-full ${getRatingColor(dayCheckIn.energyLevel, 5)}`} style={{ width: `${(dayCheckIn.energyLevel / 5) * 100}%` }} />
              </div>
            </div>

            {/* Sleep */}
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Sleep</span>
                <Moon size={16} className="text-indigo-400" />
              </div>
              <p className="text-xl font-bold text-slate-800">{dayCheckIn.sleepQuality}<span className="text-sm font-normal text-slate-400">/5</span></p>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                <div className={`h-full rounded-full ${getRatingColor(dayCheckIn.sleepQuality, 5)}`} style={{ width: `${(dayCheckIn.sleepQuality / 5) * 100}%` }} />
              </div>
            </div>
          </div>

          {dayCheckIn.notes && (
            <div className="mt-4 bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-700">{dayCheckIn.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Prescribed Exercises (grouped by program) */}
      {prescribedForDate.length > 0 && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
              <ClipboardList size={14} className="text-primary-400" />
              Prescribed Exercises
            </h4>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              completedCount === totalPrescribed
                ? 'bg-green-50 text-green-600'
                : completedCount > 0
                ? 'bg-yellow-50 text-yellow-600'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {completedCount}/{totalPrescribed} done
            </span>
          </div>

          <div className="space-y-4">
            {Array.from(prescribedByProgram.entries()).map(([programName, exercises]) => (
              <div key={programName}>
                {prescribedByProgram.size > 1 && (
                  <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                    <Dumbbell size={12} />
                    {programName}
                  </p>
                )}
                <div className="space-y-2">
                  {exercises.map((p, i) => {
                    const ex = p.exercise;
                    const c = p.completion;
                    const isDuration = (ex.prescribedDuration && ex.prescribedDuration > 0);

                    return (
                      <div key={`${programName}-${i}`} className={`rounded-lg p-4 ${c ? 'bg-green-50/60 ring-1 ring-green-200/50' : 'bg-slate-50'}`}>
                        <div className="flex items-start gap-2.5 mb-2">
                          {c ? (
                            <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                          ) : (
                            <Circle size={16} className="text-slate-300 mt-0.5 flex-shrink-0" />
                          )}
                          <h5 className={`text-sm font-medium ${c ? 'text-slate-800' : 'text-slate-500'}`}>
                            {ex.name}
                          </h5>
                        </div>

                        <div className={`grid ${c ? 'grid-cols-2' : 'grid-cols-1'} gap-3 text-xs ml-[26px]`}>
                          <div>
                            <p className="text-slate-400 mb-1">Prescribed</p>
                            <p className="font-medium text-slate-600">
                              {isDuration
                                ? (ex.sets > 1
                                    ? `${ex.sets} x ${formatDuration(ex.prescribedDuration!)}`
                                    : formatDuration(ex.prescribedDuration!))
                                : `${ex.sets} x ${ex.reps}${ex.prescribedWeight ? ` @ ${ex.prescribedWeight}kg` : ''}`
                              }
                            </p>
                          </div>
                          {c && (
                            <div>
                              <p className="text-slate-400 mb-1">Actual</p>
                              <p className="font-medium text-slate-800">
                                {c.durationPerformed && c.durationPerformed > 0
                                  ? (c.setsPerformed > 1
                                      ? `${c.setsPerformed} x ${formatDuration(c.durationPerformed)}`
                                      : formatDuration(c.durationPerformed))
                                  : `${c.setsPerformed} x ${c.repsPerformed}${c.weightPerformed ? ` @ ${c.weightPerformed}kg` : ''}`
                                }
                              </p>
                            </div>
                          )}
                        </div>

                        {/* RPE & Pain row (only if completed) */}
                        {c && (c.rpeRating !== null || c.painLevel !== null) && (
                          <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-slate-200/60 ml-[26px]">
                            {c.rpeRating !== null && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-slate-400">RPE</span>
                                <span className={`font-semibold ${
                                  c.rpeRating <= 5 ? 'text-green-600' : c.rpeRating <= 8 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {c.rpeRating}/10
                                </span>
                              </div>
                            )}
                            {c.painLevel !== null && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-slate-400">Pain</span>
                                <span className={`font-semibold ${getPainColor(c.painLevel)}`}>
                                  {c.painLevel}/10
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Notes */}
                        {c?.notes && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 ml-[26px]">
                            <p className="text-xs text-slate-500 italic">"{c.notes}"</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extra completions (exercises completed but not in any scheduled program for this day) */}
      {extraCompletions.length > 0 && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Dumbbell size={14} className="text-primary-400" />
            {prescribedForDate.length > 0 ? 'Additional Completed Exercises' : 'Completed Exercises'}
            <span className="bg-primary-50 text-primary-600 px-1.5 py-0.5 rounded-full text-xs font-medium">
              {extraCompletions.length}
            </span>
          </h4>

          <div className="space-y-2.5">
            {extraCompletions.map((c) => (
              <div key={c.id} className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h5 className="text-sm font-medium text-slate-800">{c.exerciseName}</h5>
                </div>

                {/* Prescribed vs Actual */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400 mb-1">Prescribed</p>
                    <p className="font-medium text-slate-600">
                      {c.prescribedDuration && c.prescribedDuration > 0
                        ? (c.prescribedSets > 1
                            ? `${c.prescribedSets} x ${formatDuration(c.prescribedDuration)}`
                            : formatDuration(c.prescribedDuration))
                        : `${c.prescribedSets} x ${c.prescribedReps}${c.prescribedWeight ? ` @ ${c.prescribedWeight}kg` : ''}`
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">Actual</p>
                    <p className="font-medium text-slate-800">
                      {c.durationPerformed && c.durationPerformed > 0
                        ? (c.setsPerformed > 1
                            ? `${c.setsPerformed} x ${formatDuration(c.durationPerformed)}`
                            : formatDuration(c.durationPerformed))
                        : `${c.setsPerformed} x ${c.repsPerformed}${c.weightPerformed ? ` @ ${c.weightPerformed}kg` : ''}`
                      }
                    </p>
                  </div>
                </div>

                {/* RPE & Pain row */}
                {(c.rpeRating !== null || c.painLevel !== null) && (
                  <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-slate-200/60">
                    {c.rpeRating !== null && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-400">RPE</span>
                        <span className={`font-semibold ${
                          c.rpeRating <= 5 ? 'text-green-600' : c.rpeRating <= 8 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {c.rpeRating}/10
                        </span>
                      </div>
                    )}
                    {c.painLevel !== null && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-400">Pain</span>
                        <span className={`font-semibold ${getPainColor(c.painLevel)}`}>
                          {c.painLevel}/10
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {c.notes && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200/60">
                    <p className="text-xs text-slate-500 italic">"{c.notes}"</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
