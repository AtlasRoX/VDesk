import React, { useState } from 'react';
import { MemoryStore, WorkspaceMemory, SavedAutomation, ActivityRecord } from '../../utils/ai/memoryStore';

interface MemoryPanelProps {
  onMemoryChanged: () => void;
}

export default function MemoryPanel({ onMemoryChanged }: MemoryPanelProps) {
  const [memory, setMemory] = useState<WorkspaceMemory>(() => {
    return MemoryStore.getMemory();
  });

  const refreshMemory = () => {
    setMemory(MemoryStore.getMemory());
    onMemoryChanged();
  };

  const handleToggleMemorySystem = (enabled: boolean) => {
    MemoryStore.toggleMemorySystem(enabled);
    refreshMemory();
  };

  const handleToggleAutomation = (id: string, active: boolean) => {
    MemoryStore.toggleAutomation(id, active);
    refreshMemory();
  };

  const handleDeleteAutomation = (id: string) => {
    MemoryStore.deleteAutomation(id);
    refreshMemory();
  };

  const handleDeleteLog = (id: string) => {
    MemoryStore.deleteActivityRecord(id);
    refreshMemory();
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to erase all AI memory records? This deletes all automation rules and layout history.')) {
      MemoryStore.clearAll();
      refreshMemory();
    }
  };

  if (!memory) return null;

  return (
    <div className="bg-zinc-900/60 border border-zinc-850 rounded-lg p-4 space-y-4 backdrop-blur-sm">
      <div className="flex justify-between items-center border-b border-zinc-850 pb-2.5">
        <div className="space-y-0.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">AI Workspace Memory</label>
          <p className="text-[10px] text-zinc-500 font-mono">Explicit consent and control of context storage.</p>
        </div>

        <button
          onClick={() => handleToggleMemorySystem(!memory.enabled)}
          className={`px-2 py-0.5 border rounded text-[9px] font-bold font-mono transition ${
            memory.enabled
              ? 'bg-emerald-950/40 border-emerald-900 text-emerald-400'
              : 'bg-zinc-950 border-zinc-800 text-zinc-550'
          }`}
        >
          {memory.enabled ? 'ACTIVE' : 'MUTED'}
        </button>
      </div>

      {!memory.enabled ? (
        <div className="p-4 bg-zinc-950/60 border border-zinc-850 border-dashed rounded text-center text-zinc-500 font-mono text-[10px]">
          ⚠️ Memory system is disabled. No layout snapshots or activity logs are being recorded.
        </div>
      ) : (
        <div className="space-y-4 font-mono text-[10px]">
          {/* Snapshots info */}
          {memory.lastWorkspace ? (
            <div className="bg-zinc-950/40 border border-zinc-850 rounded p-3 space-y-1.5">
              <div className="text-zinc-500 font-bold uppercase tracking-wider text-[9px]">Last Stored Workspace Layout</div>
              <div className="grid grid-cols-2 gap-y-1 text-zinc-400">
                <div>Scale: <span className="text-zinc-200">{memory.lastWorkspace.scale}x</span></div>
                <div>Focal distance: <span className="text-zinc-200">{memory.lastWorkspace.distance}m</span></div>
                <div>Curvature: <span className="text-zinc-200">{memory.lastWorkspace.curvature}m</span></div>
                <div>Room: <span className="text-zinc-200 capitalize">{memory.lastWorkspace.environmentMode}</span></div>
              </div>
              <div className="text-[8px] text-zinc-650 pt-1">
                Saved: {new Date(memory.lastWorkspace.timestamp).toLocaleString()}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-zinc-955 border border-zinc-855 text-zinc-500 rounded text-center">
              No active layout snapshot stored yet.
            </div>
          )}

          {/* Automations list */}
          <div className="space-y-2">
            <div className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] border-b border-zinc-850 pb-1 flex justify-between items-center">
              <span>Active Automations ({memory.automations.length})</span>
            </div>

            {memory.automations.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {memory.automations.map((a: SavedAutomation) => (
                  <div key={a.id} className="p-2.5 bg-zinc-950/40 border border-zinc-850 rounded flex justify-between items-center gap-3">
                    <div className="space-y-1 grow">
                      <div className="text-zinc-200 leading-normal">{a.nlString}</div>
                      <div className="text-[8px] text-zinc-550 truncate max-w-[180px]">
                        Trigger: <span className="text-blue-500">{a.triggerName}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2.5 select-none">
                      <button
                        onClick={() => handleToggleAutomation(a.id, !a.isActive)}
                        className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition ${
                          a.isActive 
                            ? 'bg-emerald-950/20 border-emerald-900 text-emerald-400' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-550'
                        }`}
                      >
                        {a.isActive ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => handleDeleteAutomation(a.id)}
                        className="text-zinc-650 hover:text-red-400 transition text-[9px]"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2.5 bg-zinc-955 border border-zinc-855 text-zinc-500 rounded text-center">
                No active automation rules compiled.
              </div>
            )}
          </div>

          {/* Activity audit log */}
          <div className="space-y-2">
            <div className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] border-b border-zinc-850 pb-1">
              Recent AI Action Log (Telemetry Audit)
            </div>

            {memory.activityLog.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {memory.activityLog.map((log: ActivityRecord) => (
                  <div key={log.id} className="p-2.5 bg-zinc-950/40 border border-zinc-850 rounded relative group">
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      className="absolute top-2 right-2 text-zinc-650 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-[8px]"
                    >
                      ✕
                    </button>
                    <div className="text-zinc-200 font-bold">{log.actionTaken}</div>
                    <div className="text-zinc-400 leading-normal mt-0.5">{log.reason}</div>
                    <div className="text-[8px] text-zinc-550 mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()} · Outcome: {log.outcome}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2.5 bg-zinc-955 border border-zinc-855 text-zinc-550 rounded text-center">
                No telemetry activity records in buffer.
              </div>
            )}
          </div>

          {/* Erase button */}
          <div className="pt-2 border-t border-zinc-850 flex justify-end">
            <button
              onClick={handleClearAll}
              className="px-2.5 py-1 text-[9px] bg-red-950/20 hover:bg-red-950/50 text-red-400 border border-red-900 rounded transition font-bold"
            >
              ☢ Erase All AI Memories
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
