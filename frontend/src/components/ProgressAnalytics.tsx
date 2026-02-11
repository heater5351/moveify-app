import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Flame, Calendar, BarChart3, Activity, Heart, Zap } from 'lucide-react';

interface ExerciseCompletion {
  id: number;
  exerciseName: string;
  completionDate: string;
  setsPerformed: number;
  repsPerformed: number;
  weightPerformed: number | null;
  prescribedSets: number;
  prescribedReps: number;
  prescribedWeight: number | null;
  rpeRating: number | null;
  painLevel: number | null;
  notes: string | null;
}

interface DailyCheckIn {
  id: number;
  checkInDate: string;
  overallFeeling: number;
  generalPainLevel: number;
  energyLevel: number;
  sleepQuality: number;
  notes: string | null;
  createdAt: string;
}

interface ProgressionLog {
  id: number;
  exerciseName: string;
  exerciseCategory: string;
  previousSets: number;
  previousReps: number;
  newSets: number;
  newReps: number;
  adjustmentReason: string;
  avgRpe: number | null;
  avgPain: number | null;
  completionRate: number | null;
  weekInCycle: number;
  adjustedAt: string;
}

interface ProgressAnalyticsProps {
  patientId: number;
  apiUrl: string;
  isPatientView?: boolean;
}

export const ProgressAnalytics = ({ patientId, apiUrl, isPatientView = false }: ProgressAnalyticsProps) => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(30);
  const [activeView, setActiveView] = useState<'overview' | 'completions' | 'checkins' | 'adjustments'>('overview');

  // New state for detailed data
  const [exerciseCompletions, setExerciseCompletions] = useState<ExerciseCompletion[]>([]);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [progressionLogs, setProgressionLogs] = useState<ProgressionLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // For filtering by date
  const [programs, setPrograms] = useState<Array<{ id: number; frequency: string[]; startDate: string; exerciseCount: number }>>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // Fetch program details for frequency data
      await fetchPrograms();

      // Fetch view-specific data
      if (activeView === 'completions') {
        await fetchExerciseCompletions();
      } else if (activeView === 'checkins') {
        await fetchCheckIns();
      } else if (activeView === 'adjustments') {
        await fetchProgressionLogs();
      } else if (activeView === 'overview') {
        // Fetch completions data for overview stats
        await fetchExerciseCompletions();
      }

      setLoading(false);
    };

    loadData();
  }, [patientId, timeRange, activeView]);

  const fetchPrograms = async () => {
    try {
      const response = await fetch(`${apiUrl}/programs/patient/${patientId}`);
      if (response.ok) {
        const data = await response.json();

        // The API returns a single program object, not an array
        if (data.program) {
          const programDetails = [{
            id: data.program.id,
            frequency: data.program.frequency || [],
            startDate: data.program.startDate || data.program.start_date,
            exerciseCount: data.program.exercises?.length || 0
          }];

          setPrograms(programDetails);
        } else {
          setPrograms([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch programs:', error);
    }
  };

  const fetchExerciseCompletions = async () => {
    try {
      const response = await fetch(`${apiUrl}/programs/exercise-completions/patient/${patientId}?days=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setExerciseCompletions(data.completions || []);
      }
    } catch (error) {
      console.error('Failed to fetch exercise completions:', error);
    }
  };

  const fetchCheckIns = async () => {
    try {
      const response = await fetch(`${apiUrl}/check-ins/patient/${patientId}?days=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setCheckIns(data.checkIns || []);
      }
    } catch (error) {
      console.error('Failed to fetch check-ins:', error);
    }
  };

  const fetchProgressionLogs = async () => {
    try {
      const response = await fetch(`${apiUrl}/programs/progression-logs/patient/${patientId}?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setProgressionLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch progression logs:', error);
    }
  };

  // Calculate stats from exercise completions data using useMemo
  // This runs during every render but only recalculates when dependencies change
  const overviewStats = useMemo(() => {
    if (exerciseCompletions.length === 0) {
      return {
        totalCompleted: 0,
        consistencyScore: 0,
        streak: 0,
        weightProgression: [],
        weeklyActivity: []
      };
    }

    // Total exercises completed
    const totalCompleted = exerciseCompletions.length;

    // Get unique completion dates
    const uniqueDates = new Set(exerciseCompletions.map(c => c.completionDate));
    const sortedDates = Array.from(uniqueDates).sort((a, b) =>
      new Date(b).getTime() - new Date(a).getTime()
    );

    // Calculate streak: count consecutive days with completions going backwards from today
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Simple streak: count backwards from today until we hit a day without completions
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      if (sortedDates.includes(dateStr)) {
        streak++;
      } else if (i > 0) {
        // Stop counting if we hit a day without completions (but allow today to be empty)
        break;
      }
    }

    // Completion rate: completed exercises / prescribed exercises
    // Calculate how many exercises were prescribed in the time range
    let completionRate = 0;

    if (programs.length > 0 && programs[0].frequency.length > 0 && programs[0].exerciseCount > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Map day names to indices
      const dayMap: { [key: string]: number } = {
        'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
      };

      const prescribedDayIndices = programs[0].frequency
        .map(d => dayMap[d])
        .filter(i => i !== undefined);

      // Count how many prescribed days are in the time range
      let prescribedDaysCount = 0;
      for (let i = 0; i < timeRange; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dayOfWeek = checkDate.getDay();

        if (prescribedDayIndices.includes(dayOfWeek)) {
          prescribedDaysCount++;
        }
      }

      // Total prescribed exercises = prescribed days × exercises per day
      const totalPrescribedExercises = prescribedDaysCount * programs[0].exerciseCount;

      // Completion rate = exercises completed / exercises prescribed
      if (totalPrescribedExercises > 0) {
        completionRate = Math.round((totalCompleted / totalPrescribedExercises) * 100);
      }
    } else {
      // Fallback: if no program data, just show activity percentage
      completionRate = Math.round((uniqueDates.size / timeRange) * 100);
    }

    const consistencyScore = completionRate;

    // Weight progression: group by exercise name and track weight over time
    const weightByExercise = new Map<string, Array<{date: string, weight: number}>>();
    exerciseCompletions.forEach(c => {
      if (c.weightPerformed && c.weightPerformed > 0) {
        if (!weightByExercise.has(c.exerciseName)) {
          weightByExercise.set(c.exerciseName, []);
        }
        weightByExercise.get(c.exerciseName)!.push({
          date: c.completionDate,
          weight: c.weightPerformed
        });
      }
    });

    // Calculate weight progression for exercises with weight
    const weightProgression = Array.from(weightByExercise.entries()).map(([name, data]) => {
      const sorted = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const firstWeight = sorted[0]?.weight || 0;
      const lastWeight = sorted[sorted.length - 1]?.weight || 0;
      const change = lastWeight - firstWeight;
      const changePercent = firstWeight > 0 ? Math.round((change / firstWeight) * 100) : 0;

      return {
        exerciseName: name,
        startWeight: firstWeight,
        currentWeight: lastWeight,
        change,
        changePercent,
        dataPoints: sorted
      };
    }).filter(ex => ex.change !== 0 || ex.dataPoints.length > 1); // Only show exercises with progression

    // Weekly activity: count completions per day
    const days: Date[] = [];
    // Reuse the 'today' variable already defined above
    for (let i = timeRange - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days.push(date);
    }

    const weeklyActivity = days.map(day => {
      const dateStr = day.toISOString().split('T')[0];
      const count = exerciseCompletions.filter(c => c.completionDate === dateStr).length;
      return {
        date: dateStr,
        dayLabel: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        weekday: day.toLocaleDateString('en-US', { weekday: 'short' }),
        count
      };
    });

    return {
      totalCompleted,
      consistencyScore,
      streak,
      weightProgression,
      weeklyActivity
    };
  }, [exerciseCompletions, programs, timeRange]); // Only recalculate when these change

  return (
    <div className="space-y-6">
      {/* View Selector Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveView('overview')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeView === 'overview'
                ? 'text-moveify-teal'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BarChart3 size={18} className="inline mr-2" />
            Overview
            {activeView === 'overview' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-moveify-teal"></div>
            )}
          </button>
          <button
            onClick={() => setActiveView('completions')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeView === 'completions'
                ? 'text-moveify-teal'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Activity size={18} className="inline mr-2" />
            Exercise Log
            {activeView === 'completions' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-moveify-teal"></div>
            )}
          </button>
          <button
            onClick={() => setActiveView('checkins')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeView === 'checkins'
                ? 'text-moveify-teal'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Heart size={18} className="inline mr-2" />
            Check-Ins
            {activeView === 'checkins' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-moveify-teal"></div>
            )}
          </button>
          <button
            onClick={() => setActiveView('adjustments')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeView === 'adjustments'
                ? 'text-moveify-teal'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Zap size={18} className="inline mr-2" />
            Auto-Adjustments
            {activeView === 'adjustments' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-moveify-teal"></div>
            )}
          </button>
        </div>
      </div>

      {/* Time Range Selector (show only for relevant views) */}
      {(activeView === 'overview' || activeView === 'completions' || activeView === 'checkins') && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {activeView === 'overview' && 'Progress Analytics'}
            {activeView === 'completions' && 'Exercise Completions'}
            {activeView === 'checkins' && 'Daily Check-Ins'}
          </h3>
          <div className="flex gap-2">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days as 7 | 14 | 30)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  timeRange === days
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      )}

      {/* OVERVIEW VIEW */}
      {activeView === 'overview' && (
        <>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading analytics...</p>
            </div>
          ) : exerciseCompletions.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500">No progress data yet</p>
              <p className="text-gray-400 text-sm mt-2">Start completing exercises to see your progress</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Key Metrics - Mobile Friendly */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {/* Total Exercises Completed */}
                <div className="bg-gradient-to-br from-moveify-teal to-moveify-ocean rounded-xl p-4 sm:p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium opacity-90">Exercises Completed</p>
                      <p className="text-3xl sm:text-4xl font-bold mt-1">{overviewStats.totalCompleted}</p>
                    </div>
                    <Activity className="opacity-80" size={isPatientView ? 36 : 40} />
                  </div>
                </div>

                {/* Current Streak */}
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 sm:p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium opacity-90">Current Streak</p>
                      <p className="text-3xl sm:text-4xl font-bold mt-1">{overviewStats.streak}</p>
                      <p className="text-xs opacity-80 mt-0.5">days</p>
                    </div>
                    <Flame className="opacity-80" size={isPatientView ? 36 : 40} />
                  </div>
                </div>

                {/* Completion Rate */}
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 sm:p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium opacity-90">Completion Rate</p>
                      <p className="text-3xl sm:text-4xl font-bold mt-1">{overviewStats.consistencyScore}%</p>
                      <p className="text-xs opacity-80 mt-0.5">of prescribed</p>
                    </div>
                    <Calendar className="opacity-80" size={isPatientView ? 36 : 40} />
                  </div>
                </div>
              </div>

              {/* Activity Chart - Simple Bar Chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
                <h4 className="font-semibold text-gray-900 mb-4 text-sm sm:text-base">Activity Overview</h4>
                <div className="space-y-3">
                  {/* Weekly summary */}
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-600">Last {timeRange} days</span>
                    <span className="font-medium text-gray-900">
                      {overviewStats.weeklyActivity.filter(d => d.count > 0).length} active days
                    </span>
                  </div>

                  {/* Simple bar visualization */}
                  <div className="relative h-24 sm:h-32">
                    <div className="absolute inset-0 flex items-end justify-between gap-0.5 sm:gap-1">
                      {overviewStats.weeklyActivity.map((day, index) => {
                        const maxCount = Math.max(...overviewStats.weeklyActivity.map(d => d.count), 1);
                        const heightPercent = (day.count / maxCount) * 100;

                        return (
                          <div
                            key={index}
                            className="flex-1 flex flex-col items-center group relative"
                            style={{ minWidth: '8px' }}
                          >
                            {/* Tooltip */}
                            {day.count > 0 && (
                              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                                {day.dayLabel}: {day.count} {day.count === 1 ? 'exercise' : 'exercises'}
                              </div>
                            )}

                            {/* Bar */}
                            <div
                              className={`w-full rounded-t transition-all ${
                                day.count > 0
                                  ? 'bg-moveify-teal hover:bg-moveify-ocean'
                                  : 'bg-gray-200'
                              }`}
                              style={{
                                height: day.count > 0 ? `${heightPercent}%` : '4px',
                                minHeight: day.count > 0 ? '8px' : '4px'
                              }}
                            />

                            {/* Day label - show less on mobile */}
                            {(timeRange === 7 || index % Math.ceil(timeRange / 7) === 0) && (
                              <span className="text-xs text-gray-500 mt-1 hidden sm:block">
                                {day.dayLabel.split(' ')[1]}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Legend for mobile */}
                  <div className="flex items-center justify-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-200">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-moveify-teal"></div>
                      <span>Active day</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-gray-200"></div>
                      <span>Rest day</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Weight Progression */}
              {overviewStats.weightProgression.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <TrendingUp size={18} className="text-green-600" />
                    Weight Progression
                  </h4>
                  <div className="space-y-3">
                    {overviewStats.weightProgression.slice(0, 5).map((exercise, index) => (
                      <div key={index} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs sm:text-sm font-medium text-gray-900 truncate pr-2">
                            {exercise.exerciseName}
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs sm:text-sm font-bold ${
                              exercise.change > 0 ? 'text-green-600' : exercise.change < 0 ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {exercise.change > 0 ? '+' : ''}{exercise.change} kg
                            </span>
                            {exercise.changePercent !== 0 && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                exercise.change > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {exercise.changePercent > 0 ? '+' : ''}{exercise.changePercent}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{exercise.startWeight} kg</span>
                          <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${exercise.change > 0 ? 'bg-green-500' : 'bg-gray-400'}`}
                              style={{ width: '100%' }}
                            />
                          </div>
                          <span className="font-medium text-gray-900">{exercise.currentWeight} kg</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* EXERCISE COMPLETIONS VIEW */}
      {activeView === 'completions' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading exercise completions...</p>
            </div>
          ) : exerciseCompletions.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500">No exercise completions yet</p>
            </div>
          ) : (
            <>
              {/* Date filter for patient view */}
              {isPatientView && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Filter by Date</label>
                  <select
                    value={selectedDate || ''}
                    onChange={(e) => setSelectedDate(e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                  >
                    <option value="">All Dates</option>
                    {Array.from(new Set(exerciseCompletions.map(c => c.completionDate)))
                      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
                      .map(date => (
                        <option key={date} value={date}>
                          {new Date(date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Mobile/Patient Card View */}
              {isPatientView ? (
                <div className="space-y-3">
                  {exerciseCompletions
                    .filter(c => !selectedDate || c.completionDate === selectedDate)
                    .map((completion) => (
                    <div key={completion.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900">{completion.exerciseName}</h4>
                          <p className="text-sm text-gray-500">
                            {new Date(completion.completionDate).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Volume</p>
                          <p className="text-sm">
                            <span className={completion.setsPerformed >= completion.prescribedSets && completion.repsPerformed >= completion.prescribedReps ? 'text-green-700 font-medium' : 'text-gray-700'}>
                              {completion.setsPerformed}×{completion.repsPerformed}
                            </span>
                            <span className="text-gray-400"> / </span>
                            <span className="text-gray-500">{completion.prescribedSets}×{completion.prescribedReps}</span>
                          </p>
                        </div>

                        {(completion.weightPerformed !== null && completion.weightPerformed > 0) && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Weight</p>
                            <p className="text-sm">
                              <span className={completion.weightPerformed >= (completion.prescribedWeight ?? 0) ? 'text-green-700 font-medium' : 'text-gray-700'}>
                                {completion.weightPerformed} kg
                              </span>
                              {completion.prescribedWeight !== null && completion.prescribedWeight > 0 && (
                                <>
                                  <span className="text-gray-400"> / </span>
                                  <span className="text-gray-500">{completion.prescribedWeight} kg</span>
                                </>
                              )}
                            </p>
                          </div>
                        )}

                        {completion.rpeRating !== null && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">RPE</p>
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              completion.rpeRating <= 6
                                ? 'bg-green-100 text-green-800'
                                : completion.rpeRating <= 8
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {completion.rpeRating}/10
                            </span>
                          </div>
                        )}

                        {completion.painLevel !== null && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Pain</p>
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              completion.painLevel <= 2
                                ? 'bg-green-100 text-green-800'
                                : completion.painLevel <= 4
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {completion.painLevel}/10
                            </span>
                          </div>
                        )}
                      </div>

                      {completion.notes && (
                        <div className="pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-500 mb-1">Notes</p>
                          <p className="text-sm text-gray-700">{completion.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Desktop/Clinician Table View */
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Date</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Exercise</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Volume</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Weight</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">RPE</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Pain</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {exerciseCompletions.map((completion) => (
                    <tr key={completion.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {new Date(completion.completionDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {completion.exerciseName}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          <span className={completion.setsPerformed >= completion.prescribedSets && completion.repsPerformed >= completion.prescribedReps ? 'text-green-700 font-medium' : 'text-gray-700'}>
                            {completion.setsPerformed}×{completion.repsPerformed}
                          </span>
                          <span className="text-gray-400">/</span>
                          <span className="text-gray-500">
                            {completion.prescribedSets}×{completion.prescribedReps}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {completion.weightPerformed !== null && completion.weightPerformed > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className={completion.weightPerformed >= (completion.prescribedWeight ?? 0) ? 'text-green-700 font-medium' : 'text-gray-700'}>
                              {completion.weightPerformed} kg
                            </span>
                            {completion.prescribedWeight !== null && completion.prescribedWeight > 0 && (
                              <>
                                <span className="text-gray-400">/</span>
                                <span className="text-gray-500">
                                  {completion.prescribedWeight} kg
                                </span>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {completion.rpeRating !== null ? (
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                            completion.rpeRating <= 6
                              ? 'bg-green-100 text-green-800'
                              : completion.rpeRating <= 8
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {completion.rpeRating}/10
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {completion.painLevel !== null ? (
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                            completion.painLevel <= 2
                              ? 'bg-green-100 text-green-800'
                              : completion.painLevel <= 4
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {completion.painLevel}/10
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {completion.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              )}
            </>
          )}
        </div>
      )}

      {/* DAILY CHECK-INS VIEW */}
      {activeView === 'checkins' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading check-ins...</p>
            </div>
          ) : checkIns.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500">No daily check-ins yet</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {checkIns.map((checkIn) => (
                <div key={checkIn.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">
                      {new Date(checkIn.checkInDate).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {new Date(checkIn.createdAt).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Overall Feeling</p>
                      <div className="flex items-center gap-1">
                        <div className={`h-2 w-full rounded-full overflow-hidden bg-gray-200`}>
                          <div
                            className={`h-full ${checkIn.overallFeeling >= 4 ? 'bg-green-500' : checkIn.overallFeeling >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${(checkIn.overallFeeling / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{checkIn.overallFeeling}/5</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Pain Level</p>
                      <div className="flex items-center gap-1">
                        <div className={`h-2 w-full rounded-full overflow-hidden bg-gray-200`}>
                          <div
                            className={`h-full ${checkIn.generalPainLevel <= 3 ? 'bg-green-500' : checkIn.generalPainLevel <= 6 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${(checkIn.generalPainLevel / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{checkIn.generalPainLevel}/10</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Energy</p>
                      <div className="flex items-center gap-1">
                        <div className={`h-2 w-full rounded-full overflow-hidden bg-gray-200`}>
                          <div
                            className={`h-full ${checkIn.energyLevel >= 4 ? 'bg-green-500' : checkIn.energyLevel >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${(checkIn.energyLevel / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{checkIn.energyLevel}/5</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Sleep Quality</p>
                      <div className="flex items-center gap-1">
                        <div className={`h-2 w-full rounded-full overflow-hidden bg-gray-200`}>
                          <div
                            className={`h-full ${checkIn.sleepQuality >= 4 ? 'bg-green-500' : checkIn.sleepQuality >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${(checkIn.sleepQuality / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{checkIn.sleepQuality}/5</span>
                      </div>
                    </div>
                  </div>
                  {checkIn.notes && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-600"><span className="font-medium">Notes:</span> {checkIn.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AUTO-ADJUSTMENTS VIEW */}
      {activeView === 'adjustments' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Periodization Auto-Adjustments</h3>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading adjustments...</p>
            </div>
          ) : progressionLogs.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500">No auto-adjustments yet</p>
              <p className="text-gray-400 text-sm mt-2">Adjustments will appear here when periodization is enabled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {progressionLogs.map((log) => {
                const isProgression = log.newSets >= log.previousSets || log.newReps >= log.previousReps;
                const isRegression = log.newSets < log.previousSets || log.newReps < log.previousReps;

                return (
                  <div key={log.id} className={`border rounded-lg p-4 ${
                    isProgression ? 'bg-green-50 border-green-200' :
                    isRegression ? 'bg-orange-50 border-orange-200' :
                    'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {isProgression && <TrendingUp size={16} className="text-green-600" />}
                          {isRegression && <span className="text-orange-600">↓</span>}
                          <h4 className="font-semibold text-gray-900">{log.exerciseName}</h4>
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                            {log.exerciseCategory}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm mt-2">
                          <div>
                            <span className="text-gray-600">Volume: </span>
                            <span className="text-gray-400 line-through">{log.previousSets}×{log.previousReps}</span>
                            <span className="mx-1">→</span>
                            <span className={`font-semibold ${
                              isProgression ? 'text-green-700' :
                              isRegression ? 'text-orange-700' :
                              'text-gray-900'
                            }`}>
                              {log.newSets}×{log.newReps}
                            </span>
                          </div>
                          <div className="text-gray-500 text-xs">
                            Week {log.weekInCycle}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(log.adjustedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Reason:</span> {log.adjustmentReason}
                      </p>
                      {(log.avgRpe !== null || log.avgPain !== null) && (
                        <div className="flex items-center gap-4 mt-2 text-xs">
                          {log.avgRpe !== null && (
                            <span className="text-gray-600">
                              Avg RPE: <span className="font-medium">{log.avgRpe.toFixed(1)}/10</span>
                            </span>
                          )}
                          {log.avgPain !== null && (
                            <span className="text-gray-600">
                              Avg Pain: <span className="font-medium">{log.avgPain.toFixed(1)}/10</span>
                            </span>
                          )}
                          {log.completionRate !== null && (
                            <span className="text-gray-600">
                              Completion: <span className="font-medium">{(log.completionRate * 100).toFixed(0)}%</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
