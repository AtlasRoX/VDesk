import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ContextHeader from './ContextHeader';
import SuggestionCard from './SuggestionCard';
import AutomationBuilder from './AutomationBuilder';
import MemoryPanel from './MemoryPanel';
import AIChat from './AIChat';
import { deriveWorkspaceContext } from '../../utils/ai/contextEngine';
import { generateSuggestions } from '../../utils/ai/suggestionEngine';
import { MemoryStore } from '../../utils/ai/memoryStore';
import { classifyWorkspaceActivity, ActivityType } from '../../utils/ai/workspaceIntelligence';
import WorkspaceIntelligenceIndicator from './WorkspaceIntelligenceIndicator';
import { ScreenUnderstandingSystem, ScreenContext } from '../../utils/ai/screenUnderstanding';
import ScreenUnderstandingPanel from './ScreenUnderstandingPanel';
import { captureScreen } from '../../utils/ai/screenshot';
import { StreamingStats } from '../../utils/providers';
import { evaluateAutomations } from '../../utils/ai/automationRuntime';

interface AIPanelProps {
  connectionState: string;
  mediaSource: 'screenshare' | 'localvideo' | 'youtube';
  resolutionProfile: 'performance' | 'balanced' | 'quality' | 'ultra';
  streamingStats: StreamingStats | null;
  thermalThrottleAlert: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  
  // Workspace controls mutation callbacks from parent page.tsx
  setResolutionProfile: (val: 'performance' | 'balanced' | 'quality' | 'ultra') => void;
  setRemoteReadingMode: (val: boolean) => void;
  setRemoteFocusMode: (val: boolean) => void;
  setRemoteEnvironmentMode: (val: 'void' | 'workspace' | 'space' | 'cinema') => void;
  setRemoteScale: (val: number) => void;
  setRemoteDistance: (val: number) => void;
  setRemoteCurvature: (val: number) => void;
  setRemoteTilt: (val: number) => void;
  setRemoteSharpenStrength: (val: number) => void;
  setLocalOnlyMode: (val: boolean) => void;
  handleRefreshSessionToken: () => void;
  applyRemotePreset: (preset: 'coding' | 'movie' | 'presentation' | 'gaming') => void;
  
  // Missing visual enhancement setters
  setRemoteSupersampling: (val: number) => void;
  setRemoteHdrEnabled: (val: boolean) => void;
  setRemoteExposure: (val: number) => void;
}

export default function AIPanel({
  connectionState,
  mediaSource,
  resolutionProfile,
  streamingStats,
  thermalThrottleAlert,
  videoRef,
  setResolutionProfile,
  setRemoteReadingMode,
  setRemoteFocusMode,
  setRemoteEnvironmentMode,
  setRemoteScale,
  setRemoteDistance,
  setRemoteCurvature,
  setRemoteTilt,
  setRemoteSharpenStrength,
  setLocalOnlyMode,
  handleRefreshSessionToken,
  applyRemotePreset,
  setRemoteSupersampling,
  setRemoteHdrEnabled,
  setRemoteExposure
}: AIPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'cockpit' | 'automations' | 'memory'>('cockpit');
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [memoryTrigger, setMemoryTrigger] = useState(0);

  // Workspace Intelligence State Vectors
  const [detectedActivity, setDetectedActivity] = useState<ActivityType>('research');
  const [detectedConfidence, setDetectedConfidence] = useState(1.0);
  const [detectedReason, setDetectedReason] = useState('Default paired workspace initialized.');
  const [isAutotuningLocked, setIsAutotuningLocked] = useState(false);

  const keystrokesRef = useRef(0); // browser-side fallback counter
  const previousActivityRef = useRef<ActivityType>('research');
  const activityStabilityTicksRef = useRef(0);

  // Native foreground window info (populated when running inside Tauri)
  const [nativeWindowTitle, setNativeWindowTitle] = useState<string>('');
  const [nativeProcessName, setNativeProcessName] = useState<string>('');

  // Screen Understanding States
  const [screenContext, setScreenContext] = useState<ScreenContext | null>(null);
  const [isScreenLoading, setIsScreenLoading] = useState(false);
  const screenSystemRef = useRef<ScreenUnderstandingSystem | null>(null);

  // Dispatch Operational Actions directly onto parent workspace state sliders
  const handleTriggerAction = useCallback((actionKey: string) => {
    console.log(`AI Command Dispatcher: executing preset operation [${actionKey}]`);

    switch (actionKey) {
      case 'apply_performance_profile':
        setResolutionProfile('performance');
        MemoryStore.logActivity('Throttled stream ceiling', 'Applied performance profile ceiling to minimize temperature', 'Stable 720p');
        break;
      case 'enable_focus':
        setRemoteFocusMode(true);
        setRemoteEnvironmentMode('void');
        MemoryStore.logActivity('Activated Workspace Focus', 'Dimmed ambient skyboxes to 0% void black surrounding', 'High focus enabled');
        break;
      case 'throttle_bitrate':
        setResolutionProfile('performance');
        MemoryStore.logActivity('Decreased bandwidth ceiling', 'Engaged network throttling parameters to suppress packet collision rates', 'Stable connection');
        break;
      case 'toggle_usb_mode':
        setLocalOnlyMode(true);
        handleRefreshSessionToken();
        MemoryStore.logActivity('Restricted connection loops', 'Forced localhost tunnel USB mode to bypass STUN gathering times', 'USB Loop active');
        break;
      case 'enable_reading_mode':
        setRemoteReadingMode(true);
        setRemoteSharpenStrength(0.7);
        MemoryStore.logActivity('Enabled High-Contrast Reading Mode', 'Boosted CAS sharpness contours to 70%', 'Text contrast maximized');
        break;
      case 'apply_coding_preset':
        applyRemotePreset('coding');
        MemoryStore.logActivity('Restored standard coding metrics', 'Fitted curvature curve radius to 2.0m, focal height 1.8m', 'Ergonomics calibrated');
        break;
      case 'apply_cinema_preset':
        applyRemotePreset('movie');
        MemoryStore.logActivity('Activated Cinema skyboxes', 'Shifted environment canvas to Cinema preset values', 'Cinema active');
        break;
      case 'maximize_screen':
        setRemoteScale(1.8);
        setRemoteDistance(3.5);
        MemoryStore.logActivity('Enlarged display size', 'Stretched VR canvas dimensions to 1.8x focal scaling factors', 'Enhanced legibility');
        break;
      case 'restore_last_workspace':
        const mem = MemoryStore.getMemory();
        if (mem.lastWorkspace) {
          setRemoteScale(mem.lastWorkspace.scale);
          setRemoteDistance(mem.lastWorkspace.distance);
          setRemoteCurvature(mem.lastWorkspace.curvature);
          setRemoteEnvironmentMode(mem.lastWorkspace.environmentMode as "void" | "workspace" | "space" | "cinema");
          MemoryStore.logActivity('Restored last active snapshot', 'Loaded storage layout presets from memory buffer', 'Layout synchronized');
        }
        break;
      case 'refresh_token':
        handleRefreshSessionToken();
        break;
      default:
        break;
    }
    setMemoryTrigger((prev) => prev + 1);
  }, [
    setResolutionProfile,
    setRemoteFocusMode,
    setRemoteEnvironmentMode,
    setLocalOnlyMode,
    handleRefreshSessionToken,
    setRemoteReadingMode,
    setRemoteSharpenStrength,
    applyRemotePreset,
    setRemoteScale,
    setRemoteDistance,
    setRemoteCurvature
  ]);

  useEffect(() => {
    screenSystemRef.current = new ScreenUnderstandingSystem();
  }, []);

  const handleInspectScreen = async () => {
    if (!screenSystemRef.current) return;

    setIsScreenLoading(true);
    // Use the two-tier capture: native GDI first, WebRTC frame fallback
    const snapshot = await captureScreen(videoRef.current ?? null);
    if (!snapshot) {
      setIsScreenLoading(false);
      alert('Could not capture screen. Ensure the Tauri companion is running or screen broadcast is active.');
      return;
    }

    try {
      const parsed = await screenSystemRef.current.analyzeScreen(
        snapshot,
        'Analyze compile errors or standard editor codes layout visible on the screen.'
      );
      setScreenContext(parsed);

      MemoryStore.logActivity(
        'Inspected desktop screen buffer',
        `App classification: ${parsed.application} (${parsed.detectedContext})`,
        `Error status: ${parsed.errorFound.hasError ? 'ERROR ACTIVE' : 'CLEAN'}`
      );
    } catch (err) {
      console.error('Vision inspection failed:', err);
    } finally {
      setIsScreenLoading(false);
    }
  };

  // derive current context
  const context = useMemo(() => deriveWorkspaceContext(
    connectionState,
    mediaSource,
    resolutionProfile,
    streamingStats,
    thermalThrottleAlert,
    false, // remoteReadingMode (we will lift key bindings)
    false, // remoteFocusMode
    'workspace'
  ), [connectionState, mediaSource, resolutionProfile, streamingStats, thermalThrottleAlert]);

  const suggestions = useMemo(() => {
    return generateSuggestions(context).filter((item) => !dismissedIds.includes(item.id));
  }, [context, dismissedIds]);

  // ── Native keyboard telemetry polling ──────────────────────────────────
  // When running inside Tauri, poll the WH_KEYBOARD_LL hook counter every second
  // to get system-wide WPM (captures keystrokes in VS Code, terminals, etc.).
  // Outside Tauri we fall back to the browser keydown listener.
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

    if (isTauri) {
      // Tauri path: poll native telemetry every second
      const poll = async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const count = await invoke<number>('get_keyboard_telemetry');
          keystrokesRef.current += count;
        } catch { /* silently swallow if command not registered yet */ }
      };
      const id = setInterval(poll, 1000);
      return () => clearInterval(id);
    } else {
      // Browser fallback: local keydown listener (tab-focus only)
      const handleKeyDown = () => { keystrokesRef.current += 1; };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  // ── Native foreground window polling ────────────────────────────────────
  // Polls get_foreground_window every 2 seconds to feed real process/title
  // data into the workspace intelligence classifier.
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    if (!isTauri) return;

    const poll = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<{ title: string; process_name: string }>('get_foreground_window');
        if (info.title) setNativeWindowTitle(info.title);
        if (info.process_name) setNativeProcessName(info.process_name);
      } catch { /* ignore */ }
    };
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  // Workspace Intelligence auto-classifier periodic loop (ticks every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const keyCount = keystrokesRef.current;
      keystrokesRef.current = 0; // reset WPM tick counter
      const keypressWpm = Math.round((keyCount / 5) * (60 / 5));

      // Use native foreground window data when available (Tauri), otherwise
      // derive a best-effort guess from the streaming context.
      let processName = nativeProcessName || 'chrome';
      let windowTitle = nativeWindowTitle || 'Google Chrome';

      if (!nativeProcessName) {
        // Browser fallback: infer from streaming source
        if (mediaSource === 'youtube') {
          processName = 'youtube';
          windowTitle = 'YouTube Cinema player';
        } else if (mediaSource === 'localvideo') {
          processName = 'vlc';
          windowTitle = 'Local Video Casting';
        } else if (connectionState === 'connected') {
          processName = 'code';
          windowTitle = 'vr-desk — IDE';
        }
      }

      // Consolidate raw active sensors
      const signals = {
        processName,
        windowTitle,
        ocrTokens: processName === 'code' ? ['fn', 'pub', 'const', 'import'] : [],
        keypressWpm,
        mediaPlaying: mediaSource !== 'screenshare',
        bandwidthMbps: streamingStats ? (streamingStats.bitrate || 0) / 1_000_000 : 0,
        fps: streamingStats ? streamingStats.fps || 0 : 0,
        latencyMs: streamingStats ? streamingStats.rtt || 0 : 0,
        packetLoss: streamingStats ? streamingStats.packetLoss || 0 : 0
      };

      const classification = classifyWorkspaceActivity(signals);
      setDetectedActivity(classification.activity);
      setDetectedConfidence(classification.confidence);
      setDetectedReason(classification.reason);

      // Transition preset parameters quietly if stable & unlocked
      if (!isAutotuningLocked) {
        if (classification.activity === previousActivityRef.current) {
          activityStabilityTicksRef.current += 1;

          // Gate: Require at least 10 seconds of steady workload (2 consecutive ticks)
          if (activityStabilityTicksRef.current === 2) {
            console.log(`AI Workspace Intelligence: Quietly adapting layout presets to matches [${classification.activity}]`);
            const adj = classification.adjustments;

            setRemoteScale(adj.scale);
            setRemoteDistance(adj.distance);
            setRemoteCurvature(adj.curvature);
            setRemoteTilt(adj.tilt);
            setRemoteSharpenStrength(adj.sharpenStrength);
            setRemoteFocusMode(adj.focusMode);
            setRemoteReadingMode(adj.readingMode);
            setRemoteEnvironmentMode(adj.environmentMode);
            setRemoteSupersampling(adj.supersampling);
            setRemoteHdrEnabled(adj.hdrEnabled);
            setRemoteExposure(adj.exposure);

            MemoryStore.logActivity(
              `Adapted preset to ${classification.activity}`,
              `Workspace classified as ${classification.activity} (Reason: ${classification.reason})`,
              `Curvature: ${adj.curvature}m · Scale: ${adj.scale}x · Skybox: ${adj.environmentMode}`
            );
          }
        } else {
          previousActivityRef.current = classification.activity;
          activityStabilityTicksRef.current = 0;
        }
      }

      // Evaluate automations against the live telemetry metrics and current classification
      evaluateAutomations({
        connectionState,
        mediaSource,
        resolutionProfile,
        streamingStats,
        thermalThrottleAlert,
        detectedActivity: classification.activity
      }, handleTriggerAction);

    }, 5000);

    return () => clearInterval(interval);
  }, [
    connectionState,
    mediaSource,
    resolutionProfile,
    streamingStats,
    thermalThrottleAlert,
    isAutotuningLocked,
    context,
    nativeProcessName,
    nativeWindowTitle,
    setRemoteScale,
    setRemoteDistance,
    setRemoteCurvature,
    setRemoteTilt,
    setRemoteSharpenStrength,
    setRemoteFocusMode,
    setRemoteReadingMode,
    setRemoteEnvironmentMode,
    setRemoteSupersampling,
    setRemoteHdrEnabled,
    setRemoteExposure,
    handleTriggerAction
  ]);

  const handleDismissSuggestion = (id: string) => {
    setDismissedIds((prev) => [...prev, id]);
  };

  return (
    <>
      {/* Floating Toggle Icon Command Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 p-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 hover:border-zinc-700 text-white rounded-full shadow-2xl transition duration-150 flex items-center justify-center cursor-pointer select-none font-mono text-xs gap-1.5 active:scale-95 animate-pulse"
      >
        <span>AI COMMAND CENTER</span>
      </button>

      {/* Slide-out Sidebar Control Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[360px] bg-zinc-955/98 border-l border-zinc-850 z-40 transform transition-transform duration-200 ease-out shadow-2xl flex flex-col justify-between p-6 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="space-y-5 grow overflow-y-auto pr-1">
          {/* Main title */}
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-950 border border-blue-900 text-blue-400 text-[9px] font-mono font-bold tracking-wider">
              AI OPERATING LAYER ACTIVE
            </div>
            <h2 className="text-sm font-bold text-white font-mono mt-2.5">Workspace Co-Pilot</h2>
          </div>

          {/* Core Tabs Navigation */}
          <div className="grid grid-cols-3 gap-1 bg-zinc-900 p-1 border border-zinc-850 rounded">
            {([
              { id: 'cockpit', label: 'Command' },
              { id: 'automations', label: 'Automate' },
              { id: 'memory', label: 'Memory' }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-1.5 text-[10px] font-mono rounded font-bold transition select-none ${
                  activeTab === tab.id
                    ? 'bg-blue-600 border border-blue-700 text-white shadow'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Cockpit Dashboard */}
          {activeTab === 'cockpit' && (
            <div className="space-y-4">
              <ContextHeader context={context} />

              <WorkspaceIntelligenceIndicator
                activity={detectedActivity}
                confidence={detectedConfidence}
                reason={detectedReason}
                isAutotuning={true}
                isLocked={isAutotuningLocked}
                onToggleLock={() => setIsAutotuningLocked(!isAutotuningLocked)}
              />

              <ScreenUnderstandingPanel
                screenContext={screenContext}
                isLoading={isScreenLoading}
                onTriggerAction={handleTriggerAction}
                onInspectScreen={handleInspectScreen}
                isStreamingActive={connectionState === 'connected'}
              />

              {/* Suggestions Panel */}
              <div className="space-y-2.5">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Suggested Actions</div>
                {suggestions.length > 0 ? (
                  <div className="space-y-3">
                    {suggestions.map((item) => (
                      <SuggestionCard
                        key={item.id}
                        suggestion={item}
                        onTriggerAction={handleTriggerAction}
                        onDismiss={handleDismissSuggestion}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded text-center text-zinc-500 font-mono text-[10px]">
                    No contextual workspace optimizations found. Telemetry indicates stable operation.
                  </div>
                )}
              </div>

              {/* Secondary Chat Surface */}
              <AIChat context={context} onRuleTriggered={handleTriggerAction} videoRef={videoRef} />
            </div>
          )}

          {/* Tab 2: Automations Builder */}
          {activeTab === 'automations' && (
            <div className="space-y-4">
              <AutomationBuilder onRuleAdded={() => setActiveTab('memory')} />
            </div>
          )}

          {/* Tab 3: Memory Storage panel */}
          {activeTab === 'memory' && (
            <div className="space-y-4">
              <MemoryPanel key={memoryTrigger} onMemoryChanged={() => {}} />
            </div>
          )}
        </div>

        {/* Sidebar Footer info */}
        <div className="pt-4 border-t border-zinc-900 text-[8px] font-mono text-zinc-650 flex justify-between">
          <span>CO-PILOT CONTEXT PROTOCOL V1.0</span>
          <span>NVIDIA NIM MULTI-MODEL EDGE</span>
        </div>
      </div>
    </>
  );
}
