import { useState, useEffect } from 'react';
import { TrendingUp, Flame, Calendar, BarChart3, Activity, Heart, Zap } from 'lucide-react';

interface CompletionData {
  date: string;
  count: number;
}

interface ProgramAnalytics {
  programId: number;
  programName: string;
  totalExercises: number;
  completions: CompletionData[];
  streak: number;
  completionRate: number;
}

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
  const [analytics, setAnalytics] = useState<ProgramAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(30);
  const [activeView, setActiveView] = useState<'overview' | 'completions' | 'checkins' | 'adjustments'>('overview');

  // New state for detailed data
  const [exerciseCompletions, setExerciseCompletions] = useState<ExerciseCompletion[]>([]);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [progressionLogs, setProgressionLogs] = useState<ProgressionLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // For filtering by date

  useEffect(() => {
    fetchAnalytics();
    if (activeView === 'completions') {
      fetchExerciseCompletions();
    } else if (activeView === 'checkins') {
      fetchCheckIns();
    } else if (activeView === 'adjustments') {
      fetchProgressionLogs();
    }
  }, [patientId, timeRange, activeView]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/programs/analytics/patient/${patientId}?days=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.programs || []);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
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

  if (loading && activeView === 'overview') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  // Get overall stats across all programs
  const overallStreak = Math.max(...analytics.map(a => a.streak));
  const averageCompletionRate = Math.round(
    analytics.reduce((sum, a) => sum + a.completionRate, 0) / analytics.length
  );

  // Prepare chart data
  const getChartData = (program: ProgramAnalytics) => {
    const days: Date[] = [];
    const today = new Date();
    for (let i = timeRange - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days.push(date);
    }

    return days.map(day => {
      const dateStr = day.toISOString().split('T')[0];
      const completion = program.completions.find(c => c.date === dateStr);
      return {
        date: dateStr,
        dayLabel: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: completion?.count || 0,
        maxCount: program.totalExercises
      };
    });
  };

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
          {analytics.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500">No progress data yet</p>
              <p className="text-gray-400 text-sm mt-2">Start completing exercises to see your progress</p>
            </div>
          ) : (
            <>
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Flame className="text-orange-600" size={32} />
            <div>
              <p className="text-sm text-orange-700 font-medium">Current Streak</p>
              <p className="text-2xl font-bold text-orange-900">{overallStreak} days</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-green-600" size={32} />
            <div>
              <p className="text-sm text-green-700 font-medium">Completion Rate</p>
              <p className="text-2xl font-bold text-green-900">{averageCompletionRate}%</p>
            </div>
          </div>
        </div>

        <div className="bg-primary-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Calendar className="text-moveify-teal" size={32} />
            <div>
              <p className="text-sm text-blue-700 font-medium">Active Programs</p>
              <p className="text-2xl font-bold text-blue-900">{analytics.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Charts by Program */}
      {analytics.map((program) => {
        const chartData = getChartData(program);
        const maxHeight = 100; // pixels

        return (
          <div key={program.programId} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-900">{program.programName}</h4>
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span className="text-gray-600">
                  <span className="font-medium text-gray-900">{program.streak}</span> day streak
                </span>
                <span className="text-gray-600">
                  <span className="font-medium text-gray-900">{program.completionRate}%</span> completion rate
                </span>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="relative">
              <div className="flex items-end justify-between gap-1 h-32">
                {chartData.map((day, index) => {
                  const heightPercent = day.maxCount > 0 ? (day.count / day.maxCount) * 100 : 0;
                  const barHeight = (heightPercent / 100) * maxHeight;

                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center group relative"
                    >
                      {/* Tooltip */}
                      {day.count > 0 && (
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                          {day.dayLabel}: {day.count}/{day.maxCount} exercises
                        </div>
                      )}

                      {/* Bar */}
                      <div
                        className={`w-full rounded-t transition-all ${
                          day.count > 0
                            ? 'bg-primary-500 hover:bg-blue-600'
                            : 'bg-gray-200'
                        }`}
                        style={{ height: `${barHeight}px`, minHeight: day.count > 0 ? '8px' : '4px' }}
                      />

                      {/* Day Label (show fewer on mobile) */}
                      {(index % Math.ceil(timeRange / 7) === 0 || timeRange === 7) && (
                        <span className="text-xs text-gray-500 mt-1 rotate-0">
                          {day.dayLabel.split(' ')[1]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Y-axis label */}
              <div className="absolute -left-8 top-0 text-xs text-gray-500">
                {program.totalExercises}
              </div>
              <div className="absolute -left-8 bottom-0 text-xs text-gray-500">
                0
              </div>
            </div>
          </div>
        );
      })}
            </>
          )}
        </>
      )}

      {/* EXERCISE COMPLETIONS VIEW */}
      {activeView === 'completions' && (
        <div className="space-y-4">
          {exerciseCompletions.length === 0 ? (
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
          {checkIns.length === 0 ? (
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
          {progressionLogs.length === 0 ? (
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
