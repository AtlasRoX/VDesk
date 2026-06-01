import React from 'react';
import { ScreenContext } from '../../utils/ai/screenUnderstanding';

interface ScreenUnderstandingPanelProps {
  screenContext: ScreenContext | null;
  isLoading: boolean;
  onTriggerAction: (actionKey: string, data?: unknown) => void;
  onInspectScreen: () => void;
  isStreamingActive: boolean;
}

export default function ScreenUnderstandingPanel({
  screenContext,
  isLoading,
  onTriggerAction,
  onInspectScreen,
  isStreamingActive
}: ScreenUnderstandingPanelProps) {
  const getAppIcon = () => {
    if (!screenContext) return '🖥️';
    switch (screenContext.application) {
      case 'VS Code': return '📦';
      case 'Chrome': return '🌐';
      case 'Adobe Acrobat': return '📁';
      case 'Terminal': return '📟';
      case 'Figma': return '🎨';
      default: return '🖥️';
    }
  };

  const getContextBadgeStyle = () => {
    if (!screenContext) return 'text-zinc-500 border-zinc-800 bg-zinc-900/50';
    switch (screenContext.detectedContext) {
      case 'terminal_error':
        return 'text-red-400 border-red-900 bg-red-950/40 animate-pulse';
      case 'code':
        return 'text-purple-400 border-purple-900 bg-purple-950/40';
      case 'browser':
        return 'text-blue-400 border-blue-900 bg-blue-950/40';
      case 'dashboard_chart':
        return 'text-emerald-400 border-emerald-950 bg-emerald-950/20';
      default:
        return 'text-zinc-400 border-zinc-800 bg-zinc-900/40';
    }
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-850 rounded-lg p-4 space-y-4 backdrop-blur-sm">
      <div className="flex justify-between items-center border-b border-zinc-850/60 pb-2.5">
        <div className="space-y-0.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Screen Understanding</label>
          <p className="text-[10px] text-zinc-500 font-mono">Live Llama 3.2 Vision OCR and UI Recognition</p>
        </div>

        <button
          onClick={onInspectScreen}
          disabled={isLoading || !isStreamingActive}
          className={`px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-zinc-900 disabled:border-zinc-800 disabled:text-zinc-650 disabled:cursor-not-allowed border border-blue-700 text-white text-[10px] font-bold rounded transition active:scale-[0.98] select-none font-mono`}
        >
          {isLoading ? '📷 SCANNING...' : '📷 INSPECT SCREEN'}
        </button>
      </div>

      {!isStreamingActive && (
        <div className="p-4 bg-zinc-950/40 border border-zinc-850 border-dashed rounded text-center text-zinc-500 font-mono text-[10px]">
          ⚠️ Screen inspection requires an active streaming connection session.
        </div>
      )}

      {isStreamingActive && !screenContext && !isLoading && (
        <div className="p-4 bg-zinc-950/40 border border-zinc-850 border-dashed rounded text-center text-zinc-500 font-mono text-[10px]">
          Click &quot;Inspect Screen&quot; above to run active vision classification on the stream frame.
        </div>
      )}

      {isLoading && (
        <div className="p-8 flex flex-col items-center justify-center space-y-3">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider animate-pulse">Routing to meta/llama-3.2-90b-vision-instruct...</span>
        </div>
      )}

      {isStreamingActive && screenContext && !isLoading && (
        <div className="space-y-4 font-mono text-[10px]">
          {/* App classification header */}
          <div className="bg-zinc-950/60 border border-zinc-850 rounded p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[9px]">Classification</span>
              <span className={`px-2 py-0.5 border rounded-full text-[8px] font-bold uppercase tracking-wider ${getContextBadgeStyle()}`}>
                {screenContext.detectedContext.replace('_', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-zinc-400">
              <div>App: <span className="text-white font-bold flex items-center gap-1.5">{getAppIcon()} {screenContext.application}</span></div>
              <div className="truncate">Layout: <span className="text-zinc-300 font-sans">{screenContext.visualAnalysis}</span></div>
            </div>
          </div>

          {/* Compiler Warning card if error exists */}
          {screenContext.errorFound.hasError && (
            <div className="bg-red-950/20 border border-red-900 rounded p-3 space-y-1 text-red-200">
              <div className="text-red-400 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1">
                <span>⚠️ Compiler Error Detected</span>
                {screenContext.errorFound.line && (
                  <span className="px-1.5 py-0.5 bg-red-900/40 border border-red-800 text-[8px] rounded">
                    LINE {screenContext.errorFound.line}
                  </span>
                )}
              </div>
              <div className="text-[10px] leading-relaxed bg-red-950/40 border border-red-900/60 p-2 rounded whitespace-pre-wrap mt-1">
                {screenContext.errorFound.message}
              </div>
            </div>
          )}

          {/* Actionable buttons */}
          <div className="space-y-2">
            <div className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] border-b border-zinc-850 pb-1">
              Available Action Coordinates
            </div>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {screenContext.availableActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => onTriggerAction(action.actionKey, action.data)}
                  className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 hover:text-white rounded transition active:scale-[0.98] font-bold font-mono"
                >
                  🎯 {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* OCR text display */}
          {screenContext.ocrText && (
            <div className="space-y-1.5">
              <div className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] border-b border-zinc-850 pb-1">
                OCR Parsed Elements
              </div>
              <div className="bg-zinc-950/60 border border-zinc-850 p-2.5 rounded text-[9px] text-zinc-400 leading-normal max-h-32 overflow-y-auto whitespace-pre-wrap select-text">
                {screenContext.ocrText}
              </div>
            </div>
          )}

          {/* AI Suggestions */}
          <div className="space-y-1.5">
            <div className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] border-b border-zinc-850 pb-1">
              AI Recommendations
            </div>
            <ul className="space-y-1 list-disc list-inside text-zinc-400 font-sans leading-normal">
              {screenContext.aiSuggestions.map((sug, idx) => (
                <li key={idx} className="marker:text-zinc-650">{sug}</li>
              ))}
            </ul>
          </div>

          {/* Step-by-step User workflows */}
          <div className="space-y-1.5">
            <div className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] border-b border-zinc-850 pb-1">
              User Action Workflows
            </div>
            <ol className="space-y-1.5 list-decimal list-inside text-zinc-400 font-sans leading-normal">
              {screenContext.userWorkflows.map((flow, idx) => (
                <li key={idx} className="marker:text-zinc-600 font-medium">
                  <span className="text-zinc-300 pl-1">{flow}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
