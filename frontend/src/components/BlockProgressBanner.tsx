import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { API_URL } from '../config';

type PeriodizationCycle = {
  blockType: string;
  blockNumber: number;
  currentWeek: number;
  totalWeeks: number;
  intensityMultiplier: number;
};

type Props = {
  programId: number;
};

export default function BlockProgressBanner({ programId }: Props) {
  const [cycle, setCycle] = useState<PeriodizationCycle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCycle = async () => {
      try {
        const response = await fetch(`${API_URL}/programs/${programId}/cycle`);
        if (response.ok) {
          const data = await response.json();
          setCycle(data);
        }
      } catch (error) {
        console.error('Failed to fetch cycle:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCycle();
  }, [programId]);

  if (loading || !cycle) return null;

  const isIntro = cycle.blockType === 'introductory';
  const blockName = isIntro
    ? 'Introductory Block'
    : `Block ${cycle.blockNumber}`;

  const weekLabel = cycle.currentWeek === 1 && !isIntro
    ? `Week ${cycle.currentWeek} (Deload)`
    : `Week ${cycle.currentWeek}`;

  const progress = (cycle.currentWeek / cycle.totalWeeks) * 100;

  return (
    <div className="bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white rounded-xl p-4 mb-6 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} />
          <h3 className="font-semibold text-lg">{blockName}</h3>
        </div>
        <div className="text-sm font-medium bg-white bg-opacity-20 px-3 py-1 rounded-full">
          {weekLabel} / {cycle.totalWeeks}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-white bg-opacity-20 rounded-full h-2 mb-2">
        <div
          className="bg-white h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-sm text-white text-opacity-90">
        {isIntro
          ? 'Building foundation and technique'
          : cycle.currentWeek === 1
          ? 'Deload week - recovering and preparing for progression'
          : `Progressive overload - increasing volume`}
      </p>
    </div>
  );
}
