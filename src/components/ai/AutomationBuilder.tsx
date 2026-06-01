import React, { useState } from 'react';
import { parseNaturalLanguageAutomation, ParsedAutomation } from '../../utils/ai/automationEngine';
import { MemoryStore } from '../../utils/ai/memoryStore';

interface AutomationBuilderProps {
  onRuleAdded: () => void;
}

export default function AutomationBuilder({ onRuleAdded }: AutomationBuilderProps) {
  const [nlInput, setNlInput] = useState('');
  const [parsed, setParsed] = useState<ParsedAutomation | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNlInput(val);
    
    if (val.trim().length > 5) {
      setParsed(parseNaturalLanguageAutomation(val));
    } else {
      setParsed(null);
    }
  };

  const handleSaveRule = () => {
    if (!parsed || !parsed.isValid) return;

    MemoryStore.addAutomation({
      id: `auto_${Math.random().toString(36).slice(2, 9)}`,
      triggerName: parsed.triggerName,
      conditionDescription: parsed.conditionDescription,
      actionDescription: parsed.actionDescription,
      nlString: nlInput,
      isActive: true
    });

    MemoryStore.logActivity(
      'Registered workspace automation',
      `Parsed instruction: "${nlInput}"`,
      `Bound triggers: ${parsed.triggerName}`
    );

    setNlInput('');
    setParsed(null);
    onRuleAdded();
  };

  const handleDiscard = () => {
    setNlInput('');
    setParsed(null);
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-850 rounded-lg p-4 space-y-4 backdrop-blur-sm">
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Create Workspace Automation</label>
        <p className="text-[10px] text-zinc-500 font-mono">Map natural language intent into workspace triggers.</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={nlInput}
          onChange={handleInputChange}
          placeholder="e.g. When YouTube starts, switch to Cinema Mode"
          className="grow px-3 py-2 text-xs bg-zinc-955 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-blue-500 hover:border-zinc-700 transition placeholder-zinc-600 font-sans"
        />
      </div>

      {parsed && (
        <div className="bg-zinc-950/80 border border-zinc-850 border-dashed rounded p-3 space-y-2.5 font-mono text-[10px] text-zinc-400">
          <div className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] border-b border-zinc-850 pb-1.5 flex justify-between items-center">
            <span>Automation Rule Compiler</span>
            <span className="text-emerald-400">✓ COMPILED</span>
          </div>

          <div className="space-y-1.5">
            <div>
              <span className="text-zinc-500 font-bold">TRIGGER:</span>{' '}
              <span className="text-blue-400">{parsed.triggerName}</span>
            </div>
            <div>
              <span className="text-zinc-500 font-bold">MATCH:</span>{' '}
              <span>{parsed.conditionDescription}</span>
            </div>
            <div>
              <span className="text-zinc-500 font-bold">ACTION:</span>{' '}
              <span className="text-purple-400">{parsed.actionDescription}</span>
            </div>
          </div>

          <div className="bg-zinc-900/50 p-2 rounded text-zinc-400 leading-relaxed border border-zinc-850/50 whitespace-pre-line mt-1">
            {parsed.preview}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleDiscard}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 text-[10px] font-bold rounded border border-zinc-800 transition"
            >
              Discard
            </button>
            <button
              onClick={handleSaveRule}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-[10px] font-bold rounded transition active:scale-[0.98]"
            >
              Activate Automation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
