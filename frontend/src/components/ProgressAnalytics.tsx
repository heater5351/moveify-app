import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Flame, BarChart3, Heart, Zap, Trophy, AlertTriangle, CheckCircle } from 'lucide-react';

// ── Centralized Threshold Constants (Bug Fix) ──────────────────────────
const PAIN_THRESHOLDS = { low: 3, moderate: 6 }; // <=3 green, 4-6 yellow, >6 red
const RPE_THRESHOLDS = { easy: 5, target: 8 };    // <=5 green, 6-8 yellow (target), >8 red

const getPainColor = (pain: number) => {
  if (pain <= PAIN_THRESHOLDS.low) return 'text-green-600';
  if (pain <= PAIN_THRESHOLDS.moderate) return 'text-yellow-600';
  return 'text-red-600';
};

const getPainBadge = (pain: number) => {
  if (pain <= PAIN_THRESHOLDS.low) return 'bg-green-100 text-green-800';
  if (pain <= PAIN_THRESHOLDS.moderate) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const getPainLabel = (pain: number) => {
  if (pain <= PAIN_THRESHOLDS.low) return 'Low';
  if (pain <= PAIN_THRESHOLDS.moderate) return 'Moderate';
  return 'High';
};

const getPainBarColor = (pain: number) => {
  if (pain <= PAIN_THRESHOLDS.low) return 'bg-green-500';
  if (pain <= PAIN_THRESHOLDS.moderate) return 'bg-yellow-500';
  return 'bg-red-500';
};

const getRpeColor = (rpe: number) => {
  if (rpe <= RPE_THRESHOLDS.easy) return 'text-green-600';
  if (rpe <= RPE_THRESHOLDS.target) return 'text-yellow-600';
  return 'text-red-600';
};

const getRpeBadge = (rpe: number) => {
  if (rpe <= RPE_THRESHOLDS.easy) return 'bg-green-100 text-green-800';
  if (rpe <= RPE_THRESHOLDS.target) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const getRpeLabel = (rpe: number) => {
  if (rpe <= RPE_THRESHOLDS.easy) return 'Easy';
  if (rpe <= RPE_THRESHOLDS.target) return 'In target zone (6-8)';
  return 'Very hard';
};

// ── Interfaces ──────────────────────────────────────────────────────────

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

interface OverviewData {
  totalCompleted: number;
  completionRate: number;
  completionTrend: 'up' | 'down' | 'stable';
  streak: number;
  avgRpe: { value: number; trend: 'up' | 'down' | 'stable' };
  avgPain: { value: number; trend: 'up' | 'down' | 'stable' };
  alerts: Array<{ severity: 'critical' | 'warning' | 'success'; message: string }>;
  weeklyActivity: Array<{ date: string; dayLabel: string; weekday: string; count: number; status: string }>;
  weightProgression: Array<{
    exerciseName: string; startWeight: number; currentWeight: number;
    change: number; changePercent: number; dataPoints: Array<{ date: string; weight: number }>;
  }>;
  nextMilestone: { type: string; value: number; message: string } | null;
  recentWins: Array<{ type: string; message: string; date: string }>;
  checkInSummary: { avgFeeling: number; avgPain: number; avgEnergy: number; avgSleep: number; totalCheckIns: number } | null;
}

// ── Component ───────────────────────────────────────────────────────────

export const ProgressAnalytics = ({ patientId, apiUrl, isPatientView = false }: ProgressAnalyticsProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(30);

  // All data loaded in parallel
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [exerciseCompletions, setExerciseCompletions] = useState<ExerciseCompletion[]>([]);
  const [, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [progressionLogs, setProgressionLogs] = useState<ProgressionLog[]>([]);

  // UI toggles
  const [showAllCompletions, setShowAllCompletions] = useState(false);

  // ── Data Fetching — Parallel on Mount ─────────────────────────────
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [overviewRes, completionsRes, checkInsRes, logsRes] = await Promise.all([
          fetch(`${apiUrl}/programs/analytics/patient/${patientId}?days=${timeRange}`),
          fetch(`${apiUrl}/programs/exercise-completions/patient/${patientId}?days=${timeRange}`),
          fetch(`${apiUrl}/check-ins/patient/${patientId}?days=${timeRange}`),
          fetch(`${apiUrl}/programs/progression-logs/patient/${patientId}?limit=50`),
        ]);

        if (!overviewRes.ok) throw new Error(`Failed to fetch analytics: ${overviewRes.status}`);
        const overviewJson = await overviewRes.json();
        setOverviewData(overviewJson.overview);

        if (completionsRes.ok) {
          const completionsJson = await completionsRes.json();
          setExerciseCompletions(completionsJson.completions || []);
        }

        if (checkInsRes.ok) {
          const checkInsJson = await checkInsRes.json();
          setCheckIns(checkInsJson.checkIns || []);
        }

        if (logsRes.ok) {
          const logsJson = await logsRes.json();
          setProgressionLogs(logsJson.logs || []);
        }
      } catch (err) {
        setError('Failed to load analytics data. Please try again.');
        console.error('Analytics load error:', err);
      }

      setLoading(false);
    };

    loadAllData();
  }, [patientId, timeRange, apiUrl]);

  // ── Derived Data ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!overviewData) return null;
    return {
      totalCompleted: overviewData.totalCompleted,
      completionRate: overviewData.completionRate,
      streak: overviewData.streak,
      weightProgression: overviewData.weightProgression || [],
      weeklyActivity: overviewData.weeklyActivity || [],
      nextMilestone: overviewData.nextMilestone,
      recentWins: overviewData.recentWins || [],
      alerts: overviewData.alerts || [],
      avgRpe: overviewData.avgRpe || { value: 0, trend: 'stable' as const },
      avgPain: overviewData.avgPain || { value: 0, trend: 'stable' as const },
      completionTrend: (overviewData.completionTrend || 'stable') as 'up' | 'down' | 'stable',
      checkInSummary: overviewData.checkInSummary,
    };
  }, [overviewData]);

  const visibleCompletions = useMemo(() => {
    if (isPatientView) {
      return showAllCompletions ? exerciseCompletions : exerciseCompletions.slice(0, 5);
    }
    return showAllCompletions ? exerciseCompletions : exerciseCompletions.slice(0, 10);
  }, [exerciseCompletions, showAllCompletions, isPatientView]);

  // ── Error State ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-red-50 rounded-xl ring-1 ring-red-200 p-6 text-center">
        <div className="text-red-600 font-medium mb-2">Unable to load analytics</div>
        <p className="text-red-500 text-sm mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Loading State ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-400 border-r-transparent mb-3" />
        <p className="text-slate-500 text-sm">Loading analytics...</p>
      </div>
    );
  }

  // ── Empty State ───────────────────────────────────────────────────
  if (!stats || stats.totalCompleted === 0) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="mx-auto text-slate-300 mb-4" size={48} />
        <p className="text-slate-500 font-medium">No progress data yet</p>
        <p className="text-slate-400 text-sm mt-2">
          {isPatientView ? 'Start completing exercises to see your progress' : 'Patient has not completed any exercises yet'}
        </p>
      </div>
    );
  }

  // ── Shared: Activity Chart ────────────────────────────────────────
  const renderActivityChart = () => {
    if (stats.weeklyActivity.length === 0) return null;

    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4 sm:p-6">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Activity</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Last {timeRange} days</span>
            <span className="text-sm font-medium text-slate-800">
              {stats.weeklyActivity.filter(d => d.count > 0).length} active days
            </span>
          </div>

          <div className="relative h-24 sm:h-32">
            <div className="absolute inset-0 flex items-end justify-between gap-0.5 sm:gap-1">
              {stats.weeklyActivity.map((day, index) => {
                const maxCount = Math.max(...stats.weeklyActivity.map(d => d.count), 1);
                const heightPercent = (day.count / maxCount) * 100;
                const status = day.status || 'rest';

                const getBarColor = () => {
                  switch (status) {
                    case 'full': return 'bg-green-500 hover:bg-green-600';
                    case 'partial': return 'bg-yellow-500 hover:bg-yellow-600';
                    case 'missed': return 'bg-red-400 hover:bg-red-500';
                    case 'rest': return 'bg-slate-200';
                    case 'future': return 'bg-slate-100 border border-dashed border-slate-300';
                    default: return 'bg-slate-200';
                  }
                };

                return (
                  <div
                    key={index}
                    className="flex-1 flex flex-col items-center group relative"
                    style={{ minWidth: '8px' }}
                  >
                    {(status !== 'rest' && status !== 'future') && (
                      <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                        {day.dayLabel}: {day.count} {day.count === 1 ? 'exercise' : 'exercises'}
                        {status === 'full' && ' ✓'}
                        {status === 'missed' && ' (missed)'}
                      </div>
                    )}

                    <div
                      className={`w-full rounded-t transition-all ${getBarColor()}`}
                      style={{
                        height: day.count > 0 ? `${heightPercent}%` : (status === 'missed' ? '8px' : '4px'),
                        minHeight: day.count > 0 ? '8px' : '4px'
                      }}
                    />

                    {(timeRange === 7 || index % Math.ceil(timeRange / 7) === 0) && (
                      <span className="text-xs text-slate-400 mt-1 hidden sm:block">
                        {day.dayLabel.split(' ')[1]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>All done</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-yellow-500" />
              <span>Partial</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-400" />
              <span>Missed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-slate-200" />
              <span>Rest</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Shared: Weight Progression ────────────────────────────────────
  const renderWeightProgression = () => {
    if (stats.weightProgression.length === 0) return null;

    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4 sm:p-6">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
          <TrendingUp size={14} className="text-green-600" />
          Weight Progression
        </h4>
        <div className="space-y-3">
          {stats.weightProgression.slice(0, 5).map((exercise, index) => (
            <div key={index} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-800 truncate pr-2">
                  {exercise.exerciseName}
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-bold ${
                    exercise.change > 0 ? 'text-green-600' : exercise.change < 0 ? 'text-red-600' : 'text-slate-600'
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
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{exercise.startWeight} kg</span>
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${exercise.change > 0 ? 'bg-primary-400' : 'bg-slate-400'}`}
                    style={{ width: '100%' }}
                  />
                </div>
                <span className="font-medium text-slate-800">{exercise.currentWeight} kg</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Shared: Trend Icon ────────────────────────────────────────────
  const TrendIcon = ({ trend, upColor = 'text-green-500', downColor = 'text-red-500' }: { trend: string; upColor?: string; downColor?: string }) => {
    if (trend === 'up') return <TrendingUp size={16} className={upColor} />;
    if (trend === 'down') return <TrendingDown size={16} className={downColor} />;
    return <Minus size={16} className="text-slate-400" />;
  };

  // ══════════════════════════════════════════════════════════════════
  // PATIENT VIEW
  // ══════════════════════════════════════════════════════════════════
  if (isPatientView) {
    return (
      <div className="space-y-5">
        {/* Time Range Selector */}
        <div className="flex items-center justify-end">
          <div className="flex gap-1.5">
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  timeRange === days
                    ? 'bg-primary-400 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        {/* Hero Metrics — 2 gradient cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Current Streak */}
          <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium opacity-90">Current Streak</p>
                <p className="text-4xl font-bold mt-1">{stats.streak}</p>
                <p className="text-xs opacity-90 mt-1">
                  {stats.streak === 0 && "Start your streak today!"}
                  {stats.streak >= 1 && stats.streak <= 2 && "Keep it going!"}
                  {stats.streak >= 3 && stats.streak <= 6 && "You're on a roll!"}
                  {stats.streak >= 7 && "Amazing consistency!"}
                </p>
              </div>
              <Flame className="opacity-80" size={36} />
            </div>
          </div>

          {/* Completion Rate */}
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium opacity-90">Completion Rate</p>
                <p className="text-4xl font-bold mt-1">{stats.completionRate}%</p>
                <p className="text-xs opacity-90 mt-1">of prescribed exercises</p>
              </div>
              <div className="relative">
                <svg className="w-12 h-12 opacity-80" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray={`${stats.completionRate}, 100`}
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Chart */}
        {renderActivityChart()}

        {/* Recent Wins */}
        {stats.recentWins.length > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl ring-1 ring-amber-200 p-4 sm:p-5">
            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Trophy size={14} className="text-amber-600" />
              Recent Wins
            </h4>
            <div className="space-y-2">
              {stats.recentWins.map((win, index) => (
                <div key={index} className="flex items-center gap-3 text-sm text-amber-800">
                  <CheckCircle size={16} className="text-amber-600 flex-shrink-0" />
                  <span>{win.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weight Progress */}
        {renderWeightProgression()}

        {/* Recent Completions — Card Format */}
        {exerciseCompletions.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recent Completions</h4>
            {visibleCompletions.map((completion) => (
              <div key={completion.id} className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h5 className="text-sm font-medium text-slate-800">{completion.exerciseName}</h5>
                    <p className="text-xs text-slate-400">
                      {new Date(completion.completionDate).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Volume</p>
                    <p className="text-sm">
                      <span className={completion.setsPerformed >= completion.prescribedSets && completion.repsPerformed >= completion.prescribedReps ? 'text-green-700 font-medium' : 'text-slate-700'}>
                        {completion.setsPerformed}×{completion.repsPerformed}
                      </span>
                      <span className="text-slate-300"> / </span>
                      <span className="text-slate-400">{completion.prescribedSets}×{completion.prescribedReps}</span>
                    </p>
                  </div>

                  {(completion.weightPerformed !== null && completion.weightPerformed > 0) && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Weight</p>
                      <p className="text-sm">
                        <span className={completion.weightPerformed >= (completion.prescribedWeight ?? 0) ? 'text-green-700 font-medium' : 'text-slate-700'}>
                          {completion.weightPerformed} kg
                        </span>
                        {completion.prescribedWeight !== null && completion.prescribedWeight > 0 && (
                          <>
                            <span className="text-slate-300"> / </span>
                            <span className="text-slate-400">{completion.prescribedWeight} kg</span>
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {completion.rpeRating !== null && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">RPE</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRpeBadge(completion.rpeRating)}`}>
                        {completion.rpeRating}/10
                      </span>
                    </div>
                  )}

                  {completion.painLevel !== null && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Pain</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPainBadge(completion.painLevel)}`}>
                        {completion.painLevel}/10
                      </span>
                    </div>
                  )}
                </div>

                {completion.notes && (
                  <div className="pt-3 mt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-400 mb-1">Notes</p>
                    <p className="text-sm text-slate-600">{completion.notes}</p>
                  </div>
                )}
              </div>
            ))}

            {exerciseCompletions.length > 5 && (
              <button
                onClick={() => setShowAllCompletions(!showAllCompletions)}
                className="w-full py-2 text-sm font-medium text-primary-400 hover:text-primary-500 transition-colors"
              >
                {showAllCompletions ? 'Show Less' : `Show All (${exerciseCompletions.length})`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // CLINICIAN VIEW
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      {/* Time Range Selector */}
      <div className="flex items-center justify-end">
        <div className="flex gap-1.5">
          {([7, 14, 30] as const).map((days) => (
            <button
              key={days}
              onClick={() => setTimeRange(days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                timeRange === days
                  ? 'bg-primary-400 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Alert Banner */}
      {stats.alerts.length > 0 && (
        <div className={`rounded-xl ring-1 p-4 ${
          stats.alerts[0].severity === 'critical'
            ? 'bg-red-50 ring-red-200'
            : stats.alerts[0].severity === 'warning'
            ? 'bg-yellow-50 ring-yellow-200'
            : 'bg-green-50 ring-green-200'
        }`}>
          <div className="flex items-center gap-3">
            {stats.alerts[0].severity === 'critical' && <AlertTriangle className="text-red-600 flex-shrink-0" size={20} />}
            {stats.alerts[0].severity === 'warning' && <AlertTriangle className="text-yellow-600 flex-shrink-0" size={20} />}
            {stats.alerts[0].severity === 'success' && <CheckCircle className="text-green-600 flex-shrink-0" size={20} />}
            <div>
              <p className={`font-medium text-sm ${
                stats.alerts[0].severity === 'critical' ? 'text-red-800'
                : stats.alerts[0].severity === 'warning' ? 'text-yellow-800'
                : 'text-green-800'
              }`}>
                {stats.alerts[0].message}
              </p>
              {stats.alerts.length > 1 && (
                <p className="text-xs text-slate-500 mt-1">
                  +{stats.alerts.length - 1} more alert{stats.alerts.length > 2 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metrics Row — 4 compact cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Completion Rate */}
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-400">Completion</p>
            <TrendIcon trend={stats.completionTrend} />
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.completionRate}%</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {stats.completionTrend === 'up' ? 'Improving' : stats.completionTrend === 'down' ? 'Declining' : 'Stable'}
          </p>
        </div>

        {/* Streak */}
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-400">Streak</p>
            <Flame size={16} className={stats.streak > 0 ? 'text-orange-500' : 'text-slate-300'} />
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.streak}<span className="text-sm font-normal text-slate-400 ml-1">days</span></p>
          <p className="text-xs text-slate-400 mt-0.5">{stats.totalCompleted} completed</p>
        </div>

        {/* Avg RPE */}
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-400">Avg RPE</p>
            <TrendIcon trend={stats.avgRpe.trend} upColor="text-yellow-500" downColor="text-green-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {stats.avgRpe.value > 0 ? stats.avgRpe.value : '—'}
          </p>
          <p className={`text-xs mt-0.5 ${stats.avgRpe.value > 0 ? getRpeColor(stats.avgRpe.value) : 'text-slate-400'}`}>
            {stats.avgRpe.value > 0 ? getRpeLabel(stats.avgRpe.value) : 'No data'}
          </p>
        </div>

        {/* Avg Pain */}
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-400">Avg Pain</p>
            <TrendIcon trend={stats.avgPain.trend} upColor="text-red-500" downColor="text-green-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {stats.avgPain.value > 0 ? stats.avgPain.value : '—'}
          </p>
          <p className={`text-xs mt-0.5 ${stats.avgPain.value > 0 ? getPainColor(stats.avgPain.value) : 'text-slate-400'}`}>
            {stats.avgPain.value > 0 ? getPainLabel(stats.avgPain.value) : 'No data'}
          </p>
        </div>
      </div>

      {/* Activity Chart */}
      {renderActivityChart()}

      {/* Check-In Summary */}
      {stats.checkInSummary && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4 sm:p-6">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Heart size={14} className="text-red-500" />
            Check-In Summary
            <span className="text-xs font-normal text-slate-400 normal-case tracking-normal">({stats.checkInSummary.totalCheckIns} check-ins)</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Feeling */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400">Feeling</span>
                <span className="text-sm font-medium text-slate-800">{stats.checkInSummary.avgFeeling}/5</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${stats.checkInSummary.avgFeeling >= 4 ? 'bg-green-500' : stats.checkInSummary.avgFeeling >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${(stats.checkInSummary.avgFeeling / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* Pain */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400">Pain</span>
                <span className="text-sm font-medium text-slate-800">{stats.checkInSummary.avgPain}/10</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${getPainBarColor(stats.checkInSummary.avgPain)}`}
                  style={{ width: `${(stats.checkInSummary.avgPain / 10) * 100}%` }}
                />
              </div>
            </div>

            {/* Energy */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400">Energy</span>
                <span className="text-sm font-medium text-slate-800">{stats.checkInSummary.avgEnergy}/5</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${stats.checkInSummary.avgEnergy >= 4 ? 'bg-green-500' : stats.checkInSummary.avgEnergy >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${(stats.checkInSummary.avgEnergy / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* Sleep */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400">Sleep</span>
                <span className="text-sm font-medium text-slate-800">{stats.checkInSummary.avgSleep}/5</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${stats.checkInSummary.avgSleep >= 4 ? 'bg-green-500' : stats.checkInSummary.avgSleep >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${(stats.checkInSummary.avgSleep / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weight Progression */}
      {renderWeightProgression()}

      {/* Recent Exercise Completions — Table */}
      {exerciseCompletions.length > 0 && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 overflow-hidden">
          <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recent Completions</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Exercise</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Volume</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Weight</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">RPE</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Pain</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleCompletions.map((completion) => (
                  <tr key={completion.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(completion.completionDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {completion.exerciseName}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={completion.setsPerformed >= completion.prescribedSets && completion.repsPerformed >= completion.prescribedReps ? 'text-green-700 font-medium' : 'text-slate-700'}>
                        {completion.setsPerformed}×{completion.repsPerformed}
                      </span>
                      <span className="text-slate-300"> / </span>
                      <span className="text-slate-400">
                        {completion.prescribedSets}×{completion.prescribedReps}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {completion.weightPerformed !== null && completion.weightPerformed > 0 ? (
                        <>
                          <span className={completion.weightPerformed >= (completion.prescribedWeight ?? 0) ? 'text-green-700 font-medium' : 'text-slate-700'}>
                            {completion.weightPerformed} kg
                          </span>
                          {completion.prescribedWeight !== null && completion.prescribedWeight > 0 && (
                            <>
                              <span className="text-slate-300"> / </span>
                              <span className="text-slate-400">{completion.prescribedWeight} kg</span>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {completion.rpeRating !== null ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRpeBadge(completion.rpeRating)}`}>
                          {completion.rpeRating}/10
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {completion.painLevel !== null ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPainBadge(completion.painLevel)}`}>
                          {completion.painLevel}/10
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-xs truncate">
                      {completion.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {exerciseCompletions.length > 10 && (
            <div className="px-4 sm:px-6 py-3 border-t border-slate-100">
              <button
                onClick={() => setShowAllCompletions(!showAllCompletions)}
                className="text-sm font-medium text-primary-400 hover:text-primary-500 transition-colors"
              >
                {showAllCompletions ? 'Show Less' : `Show All (${exerciseCompletions.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Auto-Adjustments */}
      {progressionLogs.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
            <Zap size={14} className="text-yellow-500" />
            Auto-Adjustments
          </h4>
          {progressionLogs.slice(0, 5).map((log) => {
            const isProgression = log.newSets >= log.previousSets || log.newReps >= log.previousReps;
            const isRegression = log.newSets < log.previousSets || log.newReps < log.previousReps;

            return (
              <div key={log.id} className={`rounded-xl ring-1 p-4 ${
                isProgression ? 'bg-green-50 ring-green-200'
                : isRegression ? 'bg-orange-50 ring-orange-200'
                : 'bg-slate-50 ring-slate-200'
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {isProgression && <TrendingUp size={14} className="text-green-600" />}
                      {isRegression && <TrendingDown size={14} className="text-orange-600" />}
                      <h5 className="text-sm font-medium text-slate-800">{log.exerciseName}</h5>
                      <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                        {log.exerciseCategory}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm mt-1.5">
                      <div>
                        <span className="text-slate-400 line-through text-xs">{log.previousSets}×{log.previousReps}</span>
                        <span className="text-slate-400 mx-1">→</span>
                        <span className={`font-semibold text-xs ${
                          isProgression ? 'text-green-700'
                          : isRegression ? 'text-orange-700'
                          : 'text-slate-800'
                        }`}>
                          {log.newSets}×{log.newReps}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">Week {log.weekInCycle}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(log.adjustedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-slate-200/60">
                  <p className="text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Reason:</span> {log.adjustmentReason}
                  </p>
                  {(log.avgRpe !== null || log.avgPain !== null) && (
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                      {log.avgRpe !== null && (
                        <span>RPE: <span className={`font-medium ${getRpeColor(log.avgRpe)}`}>{log.avgRpe.toFixed(1)}</span></span>
                      )}
                      {log.avgPain !== null && (
                        <span>Pain: <span className={`font-medium ${getPainColor(log.avgPain)}`}>{log.avgPain.toFixed(1)}</span></span>
                      )}
                      {log.completionRate !== null && (
                        <span>Completion: <span className="font-medium text-slate-700">{(log.completionRate * 100).toFixed(0)}%</span></span>
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
  );
};
