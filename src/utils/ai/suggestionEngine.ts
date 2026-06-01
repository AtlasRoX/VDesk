import { WorkspaceContext } from './contextEngine';

export interface SuggestionAction {
  label: string;
  actionKey: string;
  data?: unknown;
}

export interface Suggestion {
  id: string;
  type: 'alert' | 'optimization' | 'productivity' | 'general';
  title: string;
  description: string;
  explanation: string;
  actions: SuggestionAction[];
}

/**
 * Rules-based Suggestion Engine.
 * Formulates highly contextual, zero-fluff, completely actionable workspace suggestions
 * by executing deterministic checks against the live WorkspaceContext.
 */
export function generateSuggestions(context: WorkspaceContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // 1. EMERGENCY GATE: Headset Thermal Throttle Overheating
  if (context.streamState === 'overheating') {
    suggestions.push({
      id: 'thermal_throttle',
      type: 'alert',
      title: 'Headset Thermal Stress Detected',
      description: 'Headset temperature is critical. Throttling stream quality to prevent automatic shutdown.',
      explanation: 'Reduced bitrate and geometry to 720p reduces local GPU/decoder decode workload by 60%, aiding passive cooling.',
      actions: [
        { label: 'Cool Down Engine', actionKey: 'apply_performance_profile' },
        { label: 'Enable Focus Mode', actionKey: 'enable_focus' }
      ]
    });
  }

  // 2. NETWORK PERFORMANCE GATE: Congested WebRTC Link
  if (context.streamState === 'congested') {
    suggestions.push({
      id: 'network_congested',
      type: 'alert',
      title: 'High Network Latency / Packet Loss',
      description: `Rtt is ${context.latencyMs.toFixed(0)}ms with ${context.packetLoss.toFixed(1)}% packet drop. Connection unstable.`,
      explanation: 'Underlying Wi-Fi channel is congested. Reducing target bandwidth ceiling decreases packet collisions.',
      actions: [
        { label: 'Reduce Stream Bitrate', actionKey: 'throttle_bitrate' },
        { label: 'Switch to Loopback USB', actionKey: 'toggle_usb_mode' }
      ]
    });
  }

  // 3. PRODUCTIVITY MODE SUGGESTION: Active Coding Session
  if (context.activity === 'coding') {
    suggestions.push({
      id: 'coding_optimization',
      type: 'productivity',
      title: 'Active Development Session Detected',
      description: 'Optimize display parameters for code readability and IDE focus.',
      explanation: 'Activating focus mode dims ambient 3D environments to 0%, while reading mode enables high-contrast text contours.',
      actions: [
        { label: 'Enable Reading Mode', actionKey: 'enable_reading_mode' },
        { label: 'Apply Curvature Curve', actionKey: 'apply_coding_preset' }
      ]
    });
  }

  // 4. ENTERTAINMENT SUGGESTION: Watching Video content
  if (context.activity === 'watching') {
    suggestions.push({
      id: 'cinema_optimization',
      type: 'optimization',
      title: 'Theater Experience Available',
      description: 'Immersive media preset matching detected video playback context.',
      explanation: 'Transitions virtual canvas to 1.8x massive cinematic scale, tilts display down -5°, and toggles space cinema skybox.',
      actions: [
        { label: 'Activate Cinema Room', actionKey: 'apply_cinema_preset' },
        { label: 'Maximize Screen Canvas', actionKey: 'maximize_screen' }
      ]
    });
  }

  // 5. STATIC WORKSPACE SUGGESTION: Idle Workspace
  if (context.streamState === 'inactive') {
    suggestions.push({
      id: 'restore_workspace',
      type: 'general',
      title: 'Restore Yesterday\'s Workspace',
      description: 'Quick pairing is available. Spin up last active workspace automatically.',
      explanation: 'Loads persistent layouts including curvature, IPD offsets, and focus thresholds.',
      actions: [
        { label: 'Restore Workspace', actionKey: 'restore_last_workspace' },
        { label: 'Regenerate Session Token', actionKey: 'refresh_token' }
      ]
    });
  }

  return suggestions;
}
