import { StreamingStats } from '../providers';

export interface WorkspaceContext {
  activity: 'coding' | 'research' | 'watching' | 'reading' | 'idle';
  app: 'VS Code' | 'Chrome' | 'YouTube' | 'Terminal' | 'Unknown';
  streamState: 'active' | 'congested' | 'overheating' | 'inactive' | 'paired';
  activeMode: 'Reading' | 'Focus' | 'Cinema' | 'Default';
  latencyMs: number;
  packetLoss: number;
  bandwidthMbps: number;
  fps: number;
  isPaired: boolean;
  isStreaming: boolean;
}

export function deriveWorkspaceContext(
  connectionState: string,
  mediaSource: 'screenshare' | 'localvideo' | 'youtube',
  resolutionProfile: string,
  streamingStats: StreamingStats | null,
  thermalThrottleAlert: boolean,
  remoteReadingMode: boolean,
  remoteFocusMode: boolean,
  remoteEnvironmentMode: string
): WorkspaceContext {
  const isStreaming = connectionState === 'connected';
  const isPaired = connectionState === 'paired' || isStreaming;

  // Determine current active mode
  let activeMode: 'Reading' | 'Focus' | 'Cinema' | 'Default' = 'Default';
  if (remoteReadingMode) {
    activeMode = 'Reading';
  } else if (remoteFocusMode) {
    activeMode = 'Focus';
  } else if (remoteEnvironmentMode === 'cinema') {
    activeMode = 'Cinema';
  }

  // Derive activity and application based on media state and environment
  let activity: 'coding' | 'research' | 'watching' | 'reading' | 'idle' = 'idle';
  let app: 'VS Code' | 'Chrome' | 'YouTube' | 'Terminal' | 'Unknown' = 'Unknown';

  if (isStreaming) {
    if (mediaSource === 'youtube' || mediaSource === 'localvideo') {
      activity = 'watching';
      app = mediaSource === 'youtube' ? 'YouTube' : 'Chrome';
    } else {
      // Screensharing mode triggers activity based on mode preferences
      if (remoteReadingMode) {
        activity = 'reading';
        app = 'Chrome';
      } else if (remoteEnvironmentMode === 'workspace' || remoteFocusMode) {
        activity = 'coding';
        app = 'VS Code';
      } else {
        activity = 'research';
        app = 'Chrome';
      }
    }
  }

  // Determine core networking performance
  const latencyMs = streamingStats ? streamingStats.rtt || 0 : 0;
  const packetLoss = streamingStats ? streamingStats.packetLoss || 0 : 0;
  const bandwidthMbps = streamingStats ? (streamingStats.bitrate || 0) / 1_000_000 : 0;
  const fps = streamingStats ? streamingStats.fps || 0 : 0;

  // Derive streamState warning classifications
  let streamState: 'active' | 'congested' | 'overheating' | 'inactive' | 'paired' = 'inactive';
  if (thermalThrottleAlert) {
    streamState = 'overheating';
  } else if (isStreaming) {
    if (packetLoss > 4.0 || latencyMs > 80.0) {
      streamState = 'congested';
    } else {
      streamState = 'active';
    }
  } else if (isPaired) {
    streamState = 'paired';
  }

  return {
    activity,
    app,
    streamState,
    activeMode,
    latencyMs,
    packetLoss,
    bandwidthMbps,
    fps,
    isPaired,
    isStreaming
  };
}
