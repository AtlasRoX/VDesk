import React from 'react';
import { ActivityType } from '../../utils/ai/workspaceIntelligence';

interface WorkspaceIntelligenceIndicatorProps {
  activity: ActivityType;
  confidence: number;
  reason: string;
  isAutotuning: boolean;
  isLocked: boolean;
  onToggleLock: () => void;
}

export default function WorkspaceIntelligenceIndicator({
  activity,
  confidence,
  reason,
  isAutotuning,
  isLocked,
  onToggleLock
}: WorkspaceIntelligenceIndicatorProps) {
  const getActivityIcon = () => {
    switch (activity) {
      case 'coding': return '💻';
      case 'watching': return '🎬';
      case 'reading': return '📖';
      case 'writing': return '✍️';
      case 'meetings': return '🤝';
      case 'design': return '🎨';
      case 'research': return '🔍';
      case 'learning': return '🎓';
      default: return '🧠';
    }
  };

  return (
    <div className="bg-zinc-950/40 border border-zinc-850 rounded-lg p-3.5 space-y-2.5 font-mono text-[10px] text-zinc-400">
      <div className="flex justify-between items-center border-b border-zinc-850/60 pb-2">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] text-zinc-500">
          {isLocked ? (
            <span className="text-zinc-650">🔒 Autotuning Locked</span>
          ) : (
            <>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-zinc-400">🧠 AI Autotuner Active</span>
            </>
          )}
        </div>

        <button
          onClick={onToggleLock}
          className={`px-2 py-0.5 border rounded text-[8px] font-bold transition select-none ${
            isLocked
              ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
              : 'bg-emerald-950/20 border-emerald-900 text-emerald-400'
          }`}
        >
          {isLocked ? 'UNLOCK AUTOTUNE' : 'LOCK CURRENT'}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Detected Workspace Activity</div>
          <div className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5 capitalize">
            <span>{getActivityIcon()}</span>
            <span>{activity}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Confidence</div>
          <div className="text-xs font-bold text-emerald-400 mt-0.5 font-mono">
            {Math.round(confidence * 100)}%
          </div>
        </div>
      </div>

      <div className="text-zinc-500 leading-normal border-t border-zinc-900 pt-2 text-[9px]">
        Reasoning: <span className="text-zinc-400">{reason}</span>
      </div>
    </div>
  );
}
