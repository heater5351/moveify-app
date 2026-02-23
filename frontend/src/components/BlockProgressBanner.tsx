import { useEffect, useState } from 'react';
import { TrendingUp, CheckCircle, PauseCircle } from 'lucide-react';
import { API_URL } from '../config';

type BlockStatus = {
  hasBlock: boolean;
  id?: number;
  currentWeek?: number;
  blockDuration?: number;
  status?: 'active' | 'completed' | 'paused';
  startDate?: string;
};

type Props = {
  programId: number;
};

export default function BlockProgressBanner({ programId }: Props) {
  const [block, setBlock] = useState<BlockStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBlock = async () => {
      try {
        const response = await fetch(`${API_URL}/blocks/${programId}`);
        if (response.ok) {
          const data = await response.json();
          setBlock(data);
        }
      } catch {
        // Silently ignore — block is optional
      } finally {
        setLoading(false);
      }
    };

    fetchBlock();
  }, [programId]);

  if (loading || !block || !block.hasBlock) return null;

  const { currentWeek = 1, blockDuration = 4, status = 'active' } = block;

  if (status === 'completed') {
    return (
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl p-4 mb-6 shadow-md flex items-center gap-3">
        <CheckCircle size={22} />
        <div>
          <p className="font-semibold">Block Complete!</p>
          <p className="text-sm text-white/80">All {blockDuration} weeks finished. Your clinician will review and assign a new block.</p>
        </div>
      </div>
    );
  }

  if (status === 'paused') {
    return (
      <div className="bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-xl p-4 mb-6 shadow-md flex items-center gap-3">
        <PauseCircle size={22} />
        <div>
          <p className="font-semibold">Program Paused</p>
          <p className="text-sm text-white/80">Your clinician has paused progression. Continue with your current prescription.</p>
        </div>
      </div>
    );
  }

  const progress = (currentWeek / blockDuration) * 100;

  return (
    <div className="bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white rounded-xl p-4 mb-6 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} />
          <h3 className="font-semibold text-lg">Periodization Block</h3>
        </div>
        <div className="text-sm font-medium bg-white bg-opacity-20 px-3 py-1 rounded-full">
          Week {currentWeek} / {blockDuration}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-white bg-opacity-20 rounded-full h-2 mb-2">
        <div
          className="bg-white h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-sm text-white/90">
        {currentWeek === blockDuration
          ? 'Final week — great work!'
          : `${blockDuration - currentWeek} week${blockDuration - currentWeek !== 1 ? 's' : ''} remaining in this block`}
      </p>
    </div>
  );
}
