import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Flame, BarChart3, Activity, Heart, Zap, Target, Trophy, AlertTriangle, CheckCircle, Moon, Battery } from 'lucide-react';

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

export const ProgressAnalytics = ({ patientId, apiUrl, isPatientView = false }: ProgressAnalyticsProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(30);
  const [activeView, setActiveView] = useState<'overview' | 'completions' | 'checkins' | 'adjustments'>('overview');

  // State for detailed data
  const [exerciseCompletions, setExerciseCompletions] = useState<ExerciseCompletion[]>([]);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [progressionLogs, setProgressionLogs] = useState<ProgressionLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        if (activeView === 'overview') {
          // Fetch all overview data from the aggregate analytics endpoint
          const response = await fetch(`${apiUrl}/programs/analytics/patient/${patientId}?days=${timeRange}`);
          if (!response.ok) throw new Error(`Failed to fetch analytics: ${response.status}`);
          const data = await response.json();
          setOverviewData(data.overview);
        } else if (activeView === 'completions') {
          await fetchExerciseCompletions();
        } else if (activeView === 'checkins') {
          await fetchCheckIns();
        } else if (activeView === 'adjustments') {
          await fetchProgressionLogs();
        }
      } catch (err) {
        setError('Failed to load analytics data. Please try again.');
        console.error('Analytics load error:', err);
      }

      setLoading(false);
    };

    loadData();
  }, [patientId, timeRange, activeView]);

  const fetchExerciseCompletions = async () => {
    const response = await fetch(`${apiUrl}/programs/exercise-completions/patient/${patientId}?days=${timeRange}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch exercise completions: ${response.status}`);
    }
    const data = await response.json();
    setExerciseCompletions(data.completions || []);
  };

  const fetchCheckIns = async () => {
    const response = await fetch(`${apiUrl}/check-ins/patient/${patientId}?days=${timeRange}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch check-ins: ${response.status}`);
    }
    const data = await response.json();
    setCheckIns(data.checkIns || []);
  };

  const fetchProgressionLogs = async () => {
    const response = await fetch(`${apiUrl}/programs/progression-logs/patient/${patientId}?limit=50`);
    if (!response.ok) {
      throw new Error(`Failed to fetch progression logs: ${response.status}`);
    }
    const data = await response.json();
    setProgressionLogs(data.logs || []);
  };

  // Overview stats from backend analytics endpoint
  const overviewStats = useMemo(() => {
    const empty = {
      totalCompleted: 0,
      consistencyScore: 0,
      streak: 0,
      weightProgression: [] as OverviewData['weightProgression'],
      weeklyActivity: [] as OverviewData['weeklyActivity'],
      nextMilestone: null as OverviewData['nextMilestone'],
      recentWins: [] as OverviewData['recentWins'],
      alerts: [] as OverviewData['alerts'],
      avgRpe: { value: 0, trend: 'stable' as const },
      avgPain: { value: 0, trend: 'stable' as const },
      completionTrend: 'stable' as const
    };

    if (!overviewData) return empty;

    return {
      totalCompleted: overviewData.totalCompleted,
      consistencyScore: overviewData.completionRate,
      streak: overviewData.streak,
      weightProgression: overviewData.weightProgression || [],
      weeklyActivity: overviewData.weeklyActivity || [],
      nextMilestone: overviewData.nextMilestone,
      recentWins: overviewData.recentWins || [],
      alerts: overviewData.alerts || [],
      avgRpe: overviewData.avgRpe || { value: 0, trend: 'stable' as const },
      avgPain: overviewData.avgPain || { value: 0, trend: 'stable' as const },
      completionTrend: (overviewData.completionTrend || 'stable') as 'up' | 'down' | 'stable'
    };
  }, [overviewData]);

  // Check-in summary: from backend on overview, from local data on check-ins view
  const checkInSummary = useMemo(() => {
    if (activeView === 'overview') {
      return overviewData?.checkInSummary || null;
    }
    if (checkIns.length === 0) return null;

    const avgFeeling = Math.round(
      (checkIns.reduce((sum, c) => sum + c.overallFeeling, 0) / checkIns.length) * 10
    ) / 10;

    const checkInsWithPain = checkIns.filter(c => c.generalPainLevel !== null && c.generalPainLevel !== undefined);
    const avgPain = checkInsWithPain.length > 0
      ? Math.round((checkInsWithPain.reduce((sum, c) => sum + c.generalPainLevel, 0) / checkInsWithPain.length) * 10) / 10
      : 0;

    const checkInsWithEnergy = checkIns.filter(c => c.energyLevel !== null && c.energyLevel !== undefined);
    const avgEnergy = checkInsWithEnergy.length > 0
      ? Math.round((checkInsWithEnergy.reduce((sum, c) => sum + c.energyLevel, 0) / checkInsWithEnergy.length) * 10) / 10
      : 0;

    const checkInsWithSleep = checkIns.filter(c => c.sleepQuality !== null && c.sleepQuality !== undefined);
    const avgSleep = checkInsWithSleep.length > 0
      ? Math.round((checkInsWithSleep.reduce((sum, c) => sum + c.sleepQuality, 0) / checkInsWithSleep.length) * 10) / 10
      : 0;

    return {
      avgFeeling,
      avgPain,
      avgEnergy,
      avgSleep,
      totalCheckIns: checkIns.length
    };
  }, [checkIns, overviewData, activeView]);

  // Show error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
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
          ) : (!overviewData || overviewData.totalCompleted === 0) ? (
            <div className="text-center py-12">
              <BarChart3 className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500">No progress data yet</p>
              <p className="text-gray-400 text-sm mt-2">
                {isPatientView ? 'Start completing exercises to see your progress' : 'Patient has not completed any exercises yet'}
              </p>
            </div>
          ) : isPatientView ? (
            /* ========================================
               PATIENT OVERVIEW - Motivation & Progress
               ======================================== */
            <div className="space-y-4">
              {/* Top Row: 3 Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {/* Current Streak - Prominent */}
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 sm:p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium opacity-90">Current Streak</p>
                      <p className="text-3xl sm:text-4xl font-bold mt-1">{overviewStats.streak}</p>
                      <p className="text-xs opacity-90 mt-1">
                        {overviewStats.streak === 0 && "Start your streak today!"}
                        {overviewStats.streak >= 1 && overviewStats.streak <= 2 && "Keep it going!"}
                        {overviewStats.streak >= 3 && overviewStats.streak <= 6 && "You're on a roll!"}
                        {overviewStats.streak >= 7 && "Amazing consistency!"}
                      </p>
                    </div>
                    <Flame className="opacity-80" size={36} />
                  </div>
                </div>

                {/* Completion Rate - Visual */}
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 sm:p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium opacity-90">Completion Rate</p>
                      <p className="text-3xl sm:text-4xl font-bold mt-1">{overviewStats.consistencyScore}%</p>
                      <p className="text-xs opacity-90 mt-1">of prescribed exercises</p>
                    </div>
                    <div className="relative">
                      {/* Circular progress indicator */}
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
                          strokeDasharray={`${overviewStats.consistencyScore}, 100`}
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Next Milestone */}
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 sm:p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-medium opacity-90">Next Milestone</p>
                      {overviewStats.nextMilestone ? (
                        <>
                          <p className="text-sm sm:text-base font-semibold mt-2 leading-tight">
                            {overviewStats.nextMilestone.message}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm mt-2">Keep going!</p>
                      )}
                    </div>
                    <Target className="opacity-80" size={36} />
                  </div>
                </div>
              </div>

              {/* Weekly Activity Chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
                <h4 className="font-semibold text-gray-900 mb-4 text-sm sm:text-base">Weekly Activity</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-600">Last {timeRange} days</span>
                    <span className="font-medium text-gray-900">
                      {overviewStats.weeklyActivity.filter(d => d.count > 0).length} active days
                    </span>
                  </div>

                  {/* Bar visualization with schedule-aware color coding */}
                  <div className="relative h-24 sm:h-32">
                    <div className="absolute inset-0 flex items-end justify-between gap-0.5 sm:gap-1">
                      {overviewStats.weeklyActivity.map((day, index) => {
                        const maxCount = Math.max(...overviewStats.weeklyActivity.map(d => d.count), 1);
                        const heightPercent = (day.count / maxCount) * 100;

                        // Status comes from the backend
                        const status = (day as { status?: string }).status || 'rest';

                        // Color mapping based on status
                        const getBarColor = () => {
                          switch (status) {
                            case 'full': return 'bg-green-500 hover:bg-green-600';
                            case 'partial': return 'bg-yellow-500 hover:bg-yellow-600';
                            case 'missed': return 'bg-red-400 hover:bg-red-500';
                            case 'rest': return 'bg-gray-200';
                            case 'future': return 'bg-gray-100 border border-dashed border-gray-300';
                            default: return 'bg-gray-200';
                          }
                        };

                        return (
                          <div
                            key={index}
                            className="flex-1 flex flex-col items-center group relative"
                            style={{ minWidth: '8px' }}
                          >
                            {(status !== 'rest' && status !== 'future') && (
                              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
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
                              <span className="text-xs text-gray-500 mt-1 hidden sm:block">
                                {day.dayLabel.split(' ')[1]}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-200">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-green-500"></div>
                      <span>All done</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-yellow-500"></div>
                      <span>Partial</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-red-400"></div>
                      <span>Missed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-gray-200"></div>
                      <span>Rest</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Wins - Celebrate achievements */}
              {overviewStats.recentWins.length > 0 && (
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4 sm:p-6">
                  <h4 className="font-semibold text-amber-900 mb-3 flex items-center gap-2 text-sm sm:text-base">
                    <Trophy size={18} className="text-amber-600" />
                    Recent Wins
                  </h4>
                  <div className="space-y-2">
                    {overviewStats.recentWins.map((win, index) => (
                      <div key={index} className="flex items-center gap-3 text-sm text-amber-800">
                        <CheckCircle size={16} className="text-amber-600 flex-shrink-0" />
                        <span>{win.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weight Progression */}
              {overviewStats.weightProgression.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <TrendingUp size={18} className="text-green-600" />
                    Your Progress
                  </h4>
                  <div className="space-y-3">
                    {overviewStats.weightProgression.slice(0, 3).map((exercise, index) => (
                      <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-700 truncate pr-2">{exercise.exerciseName}</span>
                        <span className={`text-sm font-bold ${exercise.change > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                          {exercise.change > 0 ? '+' : ''}{exercise.change} kg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ==========================================
               CLINICIAN OVERVIEW - Comprehensive Dashboard
               ========================================== */
            <div className="space-y-4">
              {/* Alert Banner */}
              {overviewStats.alerts.length > 0 && (
                <div className={`rounded-xl p-4 ${
                  overviewStats.alerts[0].severity === 'critical'
                    ? 'bg-red-50 border border-red-200'
                    : overviewStats.alerts[0].severity === 'warning'
                    ? 'bg-yellow-50 border border-yellow-200'
                    : 'bg-green-50 border border-green-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {overviewStats.alerts[0].severity === 'critical' && (
                      <AlertTriangle className="text-red-600 flex-shrink-0" size={20} />
                    )}
                    {overviewStats.alerts[0].severity === 'warning' && (
                      <AlertTriangle className="text-yellow-600 flex-shrink-0" size={20} />
                    )}
                    {overviewStats.alerts[0].severity === 'success' && (
                      <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
                    )}
                    <div>
                      <p className={`font-medium ${
                        overviewStats.alerts[0].severity === 'critical'
                          ? 'text-red-800'
                          : overviewStats.alerts[0].severity === 'warning'
                          ? 'text-yellow-800'
                          : 'text-green-800'
                      }`}>
                        {overviewStats.alerts[0].message}
                      </p>
                      {overviewStats.alerts.length > 1 && (
                        <p className="text-sm text-gray-600 mt-1">
                          +{overviewStats.alerts.length - 1} more alert{overviewStats.alerts.length > 2 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Row 1: Adherence Metrics (2 cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Completion Rate */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                    {overviewStats.completionTrend === 'up' && <TrendingUp size={18} className="text-green-500" />}
                    {overviewStats.completionTrend === 'down' && <TrendingDown size={18} className="text-red-500" />}
                    {overviewStats.completionTrend === 'stable' && <Minus size={18} className="text-gray-400" />}
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{overviewStats.consistencyScore}%</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {overviewStats.completionTrend === 'up' && 'Improving'}
                    {overviewStats.completionTrend === 'down' && 'Declining'}
                    {overviewStats.completionTrend === 'stable' && 'Stable'}
                  </p>
                </div>

                {/* Consistency Score */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-600">Consistency</p>
                    <Flame size={18} className={overviewStats.streak > 0 ? 'text-orange-500' : 'text-gray-300'} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{overviewStats.streak} day{overviewStats.streak !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {overviewStats.totalCompleted} exercises completed
                  </p>
                </div>
              </div>

              {/* Row 2: Clinical Metrics (2 cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Avg RPE */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-600">Avg RPE</p>
                    {overviewStats.avgRpe.trend === 'up' && <TrendingUp size={18} className="text-yellow-500" />}
                    {overviewStats.avgRpe.trend === 'down' && <TrendingDown size={18} className="text-green-500" />}
                    {overviewStats.avgRpe.trend === 'stable' && <Minus size={18} className="text-gray-400" />}
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {overviewStats.avgRpe.value > 0 ? overviewStats.avgRpe.value : '—'}
                  </p>
                  <p className="text-xs mt-1">
                    {overviewStats.avgRpe.value > 0 ? (
                      <span className={
                        overviewStats.avgRpe.value >= 6 && overviewStats.avgRpe.value <= 8
                          ? 'text-green-600'
                          : 'text-yellow-600'
                      }>
                        {overviewStats.avgRpe.value >= 6 && overviewStats.avgRpe.value <= 8 ? 'In target zone (6-8)' : 'Outside target zone'}
                      </span>
                    ) : (
                      <span className="text-gray-500">No RPE data</span>
                    )}
                  </p>
                </div>

                {/* Avg Pain Level */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-600">Avg Pain Level</p>
                    {overviewStats.avgPain.trend === 'up' && <TrendingUp size={18} className="text-red-500" />}
                    {overviewStats.avgPain.trend === 'down' && <TrendingDown size={18} className="text-green-500" />}
                    {overviewStats.avgPain.trend === 'stable' && <Minus size={18} className="text-gray-400" />}
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {overviewStats.avgPain.value > 0 ? overviewStats.avgPain.value : '—'}
                  </p>
                  <p className="text-xs mt-1">
                    {overviewStats.avgPain.value > 0 ? (
                      <span className={
                        overviewStats.avgPain.value < 3
                          ? 'text-green-600'
                          : overviewStats.avgPain.value <= 5
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }>
                        {overviewStats.avgPain.value < 3 ? 'Low' : overviewStats.avgPain.value <= 5 ? 'Moderate' : 'High'}
                      </span>
                    ) : (
                      <span className="text-gray-500">No pain data</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Activity Overview */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
                <h4 className="font-semibold text-gray-900 mb-4 text-sm sm:text-base">Activity Overview</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-600">Last {timeRange} days</span>
                    <span className="font-medium text-gray-900">
                      {overviewStats.weeklyActivity.filter(d => d.count > 0).length} active days
                    </span>
                  </div>

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
                            {day.count > 0 && (
                              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                                {day.dayLabel}: {day.count} {day.count === 1 ? 'exercise' : 'exercises'}
                              </div>
                            )}

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
                </div>
              </div>

              {/* Check-In Summary */}
              {checkInSummary && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <Heart size={18} className="text-red-500" />
                    Check-In Summary
                    <span className="text-xs font-normal text-gray-500">({checkInSummary.totalCheckIns} check-ins)</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Overall Feeling */}
                    <div className="text-center">
                      <div className="text-2xl mb-1">
                        {checkInSummary.avgFeeling >= 4 ? '😊' : checkInSummary.avgFeeling >= 3 ? '😐' : '😔'}
                      </div>
                      <p className="text-lg font-bold text-gray-900">{checkInSummary.avgFeeling}/5</p>
                      <p className="text-xs text-gray-500">Overall Feeling</p>
                    </div>

                    {/* General Pain */}
                    <div className="text-center">
                      <div className="flex justify-center mb-1">
                        <Activity size={24} className={
                          checkInSummary.avgPain < 3 ? 'text-green-500' :
                          checkInSummary.avgPain <= 5 ? 'text-yellow-500' : 'text-red-500'
                        } />
                      </div>
                      <p className="text-lg font-bold text-gray-900">{checkInSummary.avgPain}/10</p>
                      <p className="text-xs text-gray-500">General Pain</p>
                    </div>

                    {/* Energy */}
                    <div className="text-center">
                      <div className="flex justify-center mb-1">
                        <Battery size={24} className={
                          checkInSummary.avgEnergy >= 4 ? 'text-green-500' :
                          checkInSummary.avgEnergy >= 3 ? 'text-yellow-500' : 'text-red-500'
                        } />
                      </div>
                      <p className="text-lg font-bold text-gray-900">{checkInSummary.avgEnergy}/5</p>
                      <p className="text-xs text-gray-500">Energy Level</p>
                    </div>

                    {/* Sleep */}
                    <div className="text-center">
                      <div className="flex justify-center mb-1">
                        <Moon size={24} className={
                          checkInSummary.avgSleep >= 4 ? 'text-green-500' :
                          checkInSummary.avgSleep >= 3 ? 'text-yellow-500' : 'text-red-500'
                        } />
                      </div>
                      <p className="text-lg font-bold text-gray-900">{checkInSummary.avgSleep}/5</p>
                      <p className="text-xs text-gray-500">Sleep Quality</p>
                    </div>
                  </div>
                </div>
              )}

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
