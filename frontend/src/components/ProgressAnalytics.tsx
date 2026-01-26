import { useState, useEffect } from 'react';
import { TrendingUp, Flame, Calendar, BarChart3 } from 'lucide-react';

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

interface ProgressAnalyticsProps {
  patientId: number;
  apiUrl: string;
}

export const ProgressAnalytics = ({ patientId, apiUrl }: ProgressAnalyticsProps) => {
  const [analytics, setAnalytics] = useState<ProgramAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(30);

  useEffect(() => {
    fetchAnalytics();
  }, [patientId, timeRange]);

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

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  if (analytics.length === 0) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="mx-auto text-gray-400 mb-4" size={48} />
        <p className="text-gray-500">No progress data yet</p>
        <p className="text-gray-400 text-sm mt-2">Start completing exercises to see your progress</p>
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
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Progress Analytics</h3>
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
    </div>
  );
};
