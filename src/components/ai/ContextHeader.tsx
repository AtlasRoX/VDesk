import React from 'react';
import { WorkspaceContext } from '../../utils/ai/contextEngine';

interface ContextHeaderProps {
  context: WorkspaceContext;
}

export default function ContextHeader({ context }: ContextHeaderProps) {
  const getStreamBadgeStyle = () => {
    switch (context.streamState) {
      case 'overheating':
        return 'text-red-400 border-red-900 bg-red-950/40 animate-pulse';
      case 'congested':
        return 'text-amber-400 border-amber-900 bg-amber-950/40';
      case 'active':
        return 'text-emerald-400 border-emerald-950 bg-emerald-950/20';
      case 'paired':
        return 'text-blue-400 border-blue-950 bg-blue-950/20';
      default:
        return 'text-zinc-500 border-zinc-800 bg-zinc-900/50';
    }
  };

  const getActivityIcon = () => {
    switch (context.activity) {
      case 'coding': return '💻';
      case 'watching': return '🎬';
      case 'reading': return '📖';
      case 'research': return '🔍';
      default: return '💤';
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-850 rounded-lg p-4 space-y-3.5 backdrop-blur-sm shadow-md">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Workspace Context</span>
        <span className={`px-2 py-0.5 border rounded-full text-[9px] font-mono font-bold ${getStreamBadgeStyle()}`}>
          {context.streamState.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3.5 pt-1.5">
        <div className="space-y-0.5 border-r border-zinc-850/80 pr-2">
          <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">Detected App</div>
          <div className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5 truncate">
            <span>{context.app === 'VS Code' ? '📦' : context.app === 'YouTube' ? '🔴' : '🌐'}</span>
            <span>{context.app}</span>
          </div>
        </div>

        <div className="space-y-0.5 pl-1.5">
          <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">Active Activity</div>
          <div className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5 truncate">
            <span>{getActivityIcon()}</span>
            <span className="capitalize">{context.activity}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 pt-3.5 border-t border-zinc-850/80">
        <div className="space-y-0.5 border-r border-zinc-850/80 pr-2">
          <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">Workspace Mode</div>
          <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 mt-0.5 truncate">
            <span>🛡️</span>
            <span>{context.activeMode} Mode</span>
          </div>
        </div>

        <div className="space-y-0.5 pl-1.5">
          <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">Link Health</div>
          <div className="text-xs font-mono text-zinc-400 mt-0.5 truncate">
            {context.isStreaming ? (
              <span className="text-zinc-300 font-semibold">{context.fps} FPS · {context.latencyMs.toFixed(0)}ms Rtt</span>
            ) : (
              <span>Not Streaming</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
