import React, { useState } from 'react';
import { Suggestion, SuggestionAction } from '../../utils/ai/suggestionEngine';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onTriggerAction: (actionKey: string, data?: unknown) => void;
  onDismiss: (id: string) => void;
}

export default function SuggestionCard({ suggestion, onTriggerAction, onDismiss }: SuggestionCardProps) {
  const [showExplanation, setShowExplanation] = useState(false);

  const getBorderColor = () => {
    switch (suggestion.type) {
      case 'alert': return 'border-red-900 bg-red-950/10 hover:bg-red-950/20';
      case 'optimization': return 'border-blue-900 bg-blue-950/10 hover:bg-blue-950/20';
      case 'productivity': return 'border-purple-900 bg-purple-950/10 hover:bg-purple-950/20';
      default: return 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/60';
    }
  };

  const getBadgeStyle = () => {
    switch (suggestion.type) {
      case 'alert': return 'text-red-400 bg-red-950/50 border-red-900';
      case 'optimization': return 'text-blue-400 bg-blue-950/50 border-blue-900';
      case 'productivity': return 'text-purple-400 bg-purple-950/50 border-purple-900';
      default: return 'text-zinc-400 bg-zinc-950/50 border-zinc-800';
    }
  };

  return (
    <div className={`border rounded-lg p-4 space-y-3 transition duration-150 backdrop-blur-sm relative group ${getBorderColor()}`}>
      {/* Dismiss trigger */}
      <button
        onClick={() => onDismiss(suggestion.id)}
        className="absolute top-3.5 right-3.5 text-zinc-500 hover:text-zinc-350 transition text-[10px] font-mono select-none"
      >
        ✕
      </button>

      <div className="space-y-1 pr-6">
        <div className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 border rounded text-[8px] font-mono font-bold uppercase tracking-wider ${getBadgeStyle()}`}>
            {suggestion.type}
          </span>
        </div>
        <h3 className="text-xs font-bold text-white mt-1.5">{suggestion.title}</h3>
        <p className="text-[11px] text-zinc-400 leading-normal">{suggestion.description}</p>
      </div>

      {/* Dynamic Operational Action Buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        {suggestion.actions.map((act, index) => (
          <button
            key={index}
            onClick={() => onTriggerAction(act.actionKey, act.data)}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-[10px] rounded transition active:scale-[0.98]"
          >
            {act.label}
          </button>
        ))}
      </div>

      {/* Ergonomic Explainability Toggler */}
      <div className="pt-2 border-t border-zinc-850/60">
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="text-[9px] font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition"
        >
          <span>{showExplanation ? '▼' : '▶'}</span>
          <span>Explain active logic optimization</span>
        </button>

        {showExplanation && (
          <div className="mt-2 text-[10px] text-zinc-400 font-mono leading-relaxed bg-zinc-950/60 p-2.5 rounded border border-zinc-850 border-dashed">
            {suggestion.explanation}
          </div>
        )}
      </div>
    </div>
  );
}
