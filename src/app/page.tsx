"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { WebviewCaptureProvider, WebRTCStreamingProvider, StreamingStats } from "../utils/providers";
import { QRCodeSVG } from "qrcode.react";
import AIPanel from "../components/ai/AIPanel";
import { MemoryStore } from "../utils/ai/memoryStore";

const generateSvgPath = (data: number[], minVal: number, maxVal: number, width: number, height: number) => {
  if (data.length < 2) return "";
  const range = maxVal - minVal || 1;
  return data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - minVal) / range) * height;
    return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
};

interface TelemetryChartProps {
  title: string;
  data: number[];
  color?: string;
  unit?: string;
  minVal?: number;
  maxVal?: number;
  labelFormatter?: (v: number) => string;
}

function TelemetryMiniChart({
  title,
  data,
  color = "#3b82f6",
  unit = "",
  minVal = 0,
  maxVal = 100,
  labelFormatter = (v: number) => v.toFixed(0)
}: TelemetryChartProps) {
  const width = 320;
  const height = 100;
  const points = data.length > 0 ? data : [0, 0];
  
  const paddedPoints = [...points];
  while (paddedPoints.length < 30) {
    paddedPoints.unshift(paddedPoints[0] !== undefined ? paddedPoints[0] : 0);
  }
  
  const pathD = generateSvgPath(paddedPoints, minVal, maxVal, width, height);
  const areaD = pathD ? `${pathD} L ${width} ${height} L 0 ${height} Z` : "";
  const latestVal = points[points.length - 1] || 0;

  return (
    <div className="bg-zinc-950/70 border border-zinc-850 rounded-lg p-4 space-y-2 flex flex-col justify-between backdrop-blur-sm">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">{title}</span>
        <span className="text-xs font-bold font-mono" style={{ color }}>
          {labelFormatter(latestVal)}{unit}
        </span>
      </div>
      
      <div className="relative h-[100px] w-full mt-1.5 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full text-zinc-900" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="25" x2="320" y2="25" stroke="currentColor" strokeDasharray="2,4" />
          <line x1="0" y1="50" x2="320" y2="50" stroke="currentColor" strokeDasharray="2,4" />
          <line x1="0" y1="75" x2="320" y2="75" stroke="currentColor" strokeDasharray="2,4" />
        </svg>

        {pathD && (
          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={`grad-${title.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <path d={areaD} fill={`url(#grad-${title.replace(/[^a-zA-Z0-9]/g, '')})`} />
            <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
}

function LatencyTelemetryChart({
  history
}: {
  history: (StreamingStats & { timestamp: number })[];
}) {
  const width = 320;
  const height = 100;
  
  const maxVal = Math.max(
    50,
    ...history.map(s => Math.max(s.rtt || 0, (s.encodeLatency || 0) + (s.decodeLatency || 0)))
  );
  
  const getPaddedDataset = (key: keyof StreamingStats) => {
    const points = history.map(s => s[key] || 0);
    while (points.length < 30) {
      points.unshift(points[0] !== undefined ? points[0] : 0);
    }
    return points;
  };
  
  const rttPoints = getPaddedDataset("rtt");
  const encPoints = getPaddedDataset("encodeLatency");
  const decPoints = getPaddedDataset("decodeLatency");
  
  const rttPath = generateSvgPath(rttPoints, 0, maxVal, width, height);
  const encPath = generateSvgPath(encPoints, 0, maxVal, width, height);
  const decPath = generateSvgPath(decPoints, 0, maxVal, width, height);
  
  const latestRtt = history[history.length - 1]?.rtt || 0;
  const latestEnc = history[history.length - 1]?.encodeLatency || 0;
  const latestDec = history[history.length - 1]?.decodeLatency || 0;

  return (
    <div className="bg-zinc-950/70 border border-zinc-850 rounded-lg p-4 space-y-2 flex flex-col justify-between backdrop-blur-sm">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">RTT & Node Latencies</span>
        <span className="text-xs font-bold font-mono text-purple-400">
          {(latestRtt + latestEnc + latestDec).toFixed(0)}ms total
        </span>
      </div>
      
      <div className="relative h-[100px] w-full mt-1.5 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full text-zinc-900" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="25" x2="320" y2="25" stroke="currentColor" strokeDasharray="2,4" />
          <line x1="0" y1="50" x2="320" y2="50" stroke="currentColor" strokeDasharray="2,4" />
          <line x1="0" y1="75" x2="320" y2="75" stroke="currentColor" strokeDasharray="2,4" />
        </svg>

        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {rttPath && <path d={rttPath} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {encPath && <path d={encPath} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
          {decPath && <path d={decPath} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>
      
      <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 pt-1 mt-1 border-t border-zinc-900">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span>Ping: {latestRtt.toFixed(0)}ms</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>Encode: {latestEnc.toFixed(1)}ms</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span>Decode: {latestDec.toFixed(1)}ms</span>
        </div>
      </div>
    </div>
  );
}

export default function DesktopDashboard() {
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartAttemptedRef = useRef(false);
  const [captureActive, setCaptureActive] = useState(false);
  const [trackInfo, setTrackInfo] = useState<{
    label: string;
    width?: number;
    height?: number;
    frameRate?: number;
  } | null>(null);

  const [serverInfo, setServerInfo] = useState<{
    ip: string;
    port: number;
    token: string;
  } | null>(null);

  const [connectionState, setConnectionState] = useState("disconnected");
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(null);
  
  // Resolution profile state
  const [resolutionProfile, setResolutionProfile] = useState<"performance" | "balanced" | "quality" | "ultra">("balanced");

  // Local only and session security states
  const [localOnlyMode, setLocalOnlyMode] = useState<boolean>(false);
  const [tokenTimeRemaining, setTokenTimeRemaining] = useState<number>(300);
  const [isTokenExpired, setIsTokenExpired] = useState<boolean>(false);

  // Telemetry history and warnings
  const [statsHistory, setStatsHistory] = useState<(StreamingStats & { timestamp: number })[]>([]);
  const [thermalThrottleAlert, setThermalThrottleAlert] = useState<boolean>(false);

  // VR remote control states
  const [remoteScale, setRemoteScale] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const m = MemoryStore.getMemory();
      if (m.enabled && m.lastWorkspace && m.lastWorkspace.scale !== undefined) return m.lastWorkspace.scale;
    }
    return 1.0;
  });
  const [remoteDistance, setRemoteDistance] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const m = MemoryStore.getMemory();
      if (m.enabled && m.lastWorkspace && m.lastWorkspace.distance !== undefined) return m.lastWorkspace.distance;
    }
    return 2.0;
  });
  const [remoteCurvature, setRemoteCurvature] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const m = MemoryStore.getMemory();
      if (m.enabled && m.lastWorkspace && m.lastWorkspace.curvature !== undefined) return m.lastWorkspace.curvature;
    }
    return 3.0;
  });
  const [remoteHeightOffset, setRemoteHeightOffset] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const m = MemoryStore.getMemory();
      if (m.enabled && m.lastWorkspace && m.lastWorkspace.heightOffset !== undefined) return m.lastWorkspace.heightOffset;
    }
    return 0.0;
  });
  const [remoteTilt, setRemoteTilt] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const m = MemoryStore.getMemory();
      if (m.enabled && m.lastWorkspace && m.lastWorkspace.tilt !== undefined) return m.lastWorkspace.tilt;
    }
    return 0;
  });
  const [remoteSharpenStrength, setRemoteSharpenStrength] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const m = MemoryStore.getMemory();
      if (m.enabled && m.lastWorkspace && m.lastWorkspace.sharpenStrength !== undefined) return m.lastWorkspace.sharpenStrength;
    }
    return 0.3;
  });
  const [remoteEnvironmentMode, setRemoteEnvironmentMode] = useState<"void" | "workspace" | "space" | "cinema">(() => {
    if (typeof window !== "undefined") {
      const m = MemoryStore.getMemory();
      if (m.enabled && m.lastWorkspace && m.lastWorkspace.environmentMode !== undefined) {
        return m.lastWorkspace.environmentMode as "void" | "workspace" | "space" | "cinema";
      }
    }
    return "workspace";
  });
  const [remoteHudHidden, setRemoteHudHidden] = useState<boolean>(true);

  // Spacing, Lens and Calibration remote states
  const [remoteIpd, setRemoteIpd] = useState<number>(0.064);
  const [remoteDistortion, setRemoteDistortion] = useState<number>(0.08);
  const [remoteCalibrationMode, setRemoteCalibrationMode] = useState<boolean>(false);

  // Visual Enhancement Suite remote states
  const [remoteSupersampling, setRemoteSupersampling] = useState<number>(1.0);
  const [remoteAutoSupersampling, setRemoteAutoSupersampling] = useState<boolean>(true);
  const [remoteAntiScreenDoor, setRemoteAntiScreenDoor] = useState<boolean>(false);
  const [remoteHdrEnabled, setRemoteHdrEnabled] = useState<boolean>(false);
  const [remoteExposure, setRemoteExposure] = useState<number>(1.2);
  const [remoteHeadsetPreset, setRemoteHeadsetPreset] = useState<string>("custom");

  // Productivity modes remote states
  const [remoteReadingMode, setRemoteReadingMode] = useState<boolean>(false);
  const [remoteFocusMode, setRemoteFocusMode] = useState<boolean>(false);
  const [remotePresentationMode, setRemotePresentationMode] = useState<boolean>(false);

  // VR Media Center States
  const [mediaSource, setMediaSource] = useState<"screenshare" | "localvideo" | "youtube">("screenshare");
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string>("");
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  
  const [mediaPlaying, setMediaPlaying] = useState<boolean>(false);
  const [mediaTime, setMediaTime] = useState<number>(0);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mediaVolume, setMediaVolume] = useState<number>(0.8);

  const videoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const captureProviderRef = useRef<WebviewCaptureProvider | null>(null);
  const streamingProviderRef = useRef<WebRTCStreamingProvider | null>(null);

  interface RemoteWorkspaceUpdates {
    scale?: number;
    distance?: number;
    curvature?: number;
    heightOffset?: number;
    tilt?: number;
    sharpenStrength?: number;
    environmentMode?: "void" | "workspace" | "space" | "cinema";
    ipd?: number;
    distortion?: number;
    calibrationMode?: boolean;
    readingMode?: boolean;
    focusMode?: boolean;
    presentationMode?: boolean;
    supersampling?: number;
    autoSupersampling?: boolean;
    antiScreenDoor?: boolean;
    hdrEnabled?: boolean;
    exposure?: number;
    headsetPreset?: string;
  }

  const sendRemoteUpdate = useCallback((updates: RemoteWorkspaceUpdates) => {
    if (streamingProviderRef.current && streamingProviderRef.current.isControlChannelOpen()) {
      streamingProviderRef.current.sendControlMessage({
        type: "update_monitor",
        ...updates
      });
    }
  }, []);

  const applyRemotePreset = (preset: "coding" | "movie" | "presentation" | "gaming") => {
    setRemoteReadingMode(false);
    setRemoteFocusMode(false);
    setRemotePresentationMode(false);
    setRemoteHeadsetPreset("custom");

    switch (preset) {
      case "coding":
        setRemoteScale(1.0);
        setRemoteDistance(1.8);
        setRemoteCurvature(2.0);
        setRemoteHeightOffset(0.0);
        setRemoteTilt(0);
        setRemoteSharpenStrength(0.5);
        setRemoteEnvironmentMode("workspace");
        break;
      case "movie":
        setRemoteScale(1.8);
        setRemoteDistance(3.5);
        setRemoteCurvature(4.0);
        setRemoteHeightOffset(0.4);
        setRemoteTilt(-5);
        setRemoteSharpenStrength(0.1);
        setRemoteEnvironmentMode("cinema");
        break;
      case "presentation":
        setRemoteScale(1.1);
        setRemoteDistance(2.5);
        setRemoteCurvature(0.0);
        setRemoteHeightOffset(0.2);
        setRemoteTilt(0);
        setRemoteSharpenStrength(0.2);
        setRemoteEnvironmentMode("workspace");
        break;
      case "gaming":
        setRemoteScale(1.3);
        setRemoteDistance(1.8);
        setRemoteCurvature(1.5);
        setRemoteHeightOffset(0.0);
        setRemoteTilt(-2);
        setRemoteSharpenStrength(0.35);
        setRemoteEnvironmentMode("space");
        break;
    }
  };

  const applyRemoteHeadsetPreset = (preset: string) => {
    setRemoteHeadsetPreset(preset);
    switch (preset) {
      case "cardboard_v1":
        setRemoteIpd(0.060);
        setRemoteDistortion(0.05);
        setRemoteScale(0.9);
        break;
      case "cardboard_v2":
        setRemoteIpd(0.064);
        setRemoteDistortion(0.08);
        setRemoteScale(1.0);
        break;
      case "gear_vr":
        setRemoteIpd(0.062);
        setRemoteDistortion(0.12);
        setRemoteScale(1.05);
        break;
      case "daydream":
        setRemoteIpd(0.064);
        setRemoteDistortion(0.15);
        setRemoteScale(1.10);
        break;
      default:
        break;
    }
  };

  const triggerRemoteCalibrate = () => {
    if (streamingProviderRef.current && streamingProviderRef.current.isControlChannelOpen()) {
      streamingProviderRef.current.sendControlMessage({ type: "calibrate" });
    }
  };

  const toggleRemoteHud = () => {
    const nextHidden = !remoteHudHidden;
    setRemoteHudHidden(nextHidden);
    if (streamingProviderRef.current && streamingProviderRef.current.isControlChannelOpen()) {
      streamingProviderRef.current.sendControlMessage({ type: "set_hud", hidden: nextHidden });
    }
  };

  // Automatically push remote properties to mobile VR headset over DataChannel when changed
  useEffect(() => {
    sendRemoteUpdate({
      scale: remoteScale,
      distance: remoteDistance,
      curvature: remoteCurvature,
      heightOffset: remoteHeightOffset,
      tilt: remoteTilt,
      sharpenStrength: remoteSharpenStrength,
      environmentMode: remoteEnvironmentMode,
      ipd: remoteIpd,
      distortion: remoteDistortion,
      calibrationMode: remoteCalibrationMode,
      readingMode: remoteReadingMode,
      focusMode: remoteFocusMode,
      presentationMode: remotePresentationMode,
      supersampling: remoteSupersampling,
      autoSupersampling: remoteAutoSupersampling,
      antiScreenDoor: remoteAntiScreenDoor,
      hdrEnabled: remoteHdrEnabled,
      exposure: remoteExposure,
      headsetPreset: remoteHeadsetPreset,
    });
  }, [
    remoteScale,
    remoteDistance,
    remoteCurvature,
    remoteHeightOffset,
    remoteTilt,
    remoteSharpenStrength,
    remoteEnvironmentMode,
    remoteIpd,
    remoteDistortion,
    remoteCalibrationMode,
    remoteReadingMode,
    remoteFocusMode,
    remotePresentationMode,
    remoteSupersampling,
    remoteAutoSupersampling,
    remoteAntiScreenDoor,
    remoteHdrEnabled,
    remoteExposure,
    remoteHeadsetPreset,
    sendRemoteUpdate,
  ]);

  // Sync player progress stats to mobile client VR overlay
  useEffect(() => {
    if (connectionState !== "connected") return;

    const interval = setInterval(() => {
      let playing = false;
      let currentTime = 0;
      let duration = 0;
      let title = "";

      if (mediaSource === "localvideo" && localVideoRef.current) {
        playing = !localVideoRef.current.paused;
        currentTime = localVideoRef.current.currentTime;
        duration = localVideoRef.current.duration || 0;
        title = localVideoFile ? localVideoFile.name : "Local Video";
      } else if (mediaSource === "youtube" && youtubeId) {
        playing = mediaPlaying;
        currentTime = mediaTime;
        duration = mediaDuration;
        title = "YouTube Cinema";
      }

      if (title) {
        if (streamingProviderRef.current && streamingProviderRef.current.isControlChannelOpen()) {
          streamingProviderRef.current.sendControlMessage({
            type: "media_state",
            playing,
            currentTime,
            duration,
            title,
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionState, mediaSource, localVideoFile, youtubeId, mediaPlaying, mediaTime, mediaDuration]);

  // YouTube mock time tracking loop
  useEffect(() => {
    if (mediaSource !== "youtube" || !mediaPlaying) return;
    
    const interval = setInterval(() => {
      setMediaTime((t) => {
        if (t >= mediaDuration) {
          setMediaPlaying(false);
          return mediaDuration;
        }
        return t + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [mediaSource, mediaPlaying, mediaDuration]);

  // Initialize provider & fetch server info periodically
  useEffect(() => {
    captureProviderRef.current = new WebviewCaptureProvider();

    const fetchServerInfo = async () => {
      const isTauri =
        typeof window !== "undefined" &&
        (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

      if (isTauri) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const info = await invoke<{ ip: string; port: number; token: string; expires_in_secs: number; local_only: boolean }>(
            "get_server_info"
          );
          setServerInfo({
            ip: info.ip,
            port: info.port,
            token: info.token
          });
          setTokenTimeRemaining(info.expires_in_secs);
          setIsTokenExpired(info.expires_in_secs <= 0);
          setLocalOnlyMode(info.local_only);
        } catch (err) {
          console.error("Failed to fetch server info from Tauri backend:", err);
        }
      } else {
        // Fallback for browser testing (port 8080)
        setServerInfo({
          ip: "192.168.0.105",
          port: 8080,
          token: "dev-session-token",
        });
        setTokenTimeRemaining(280);
        setIsTokenExpired(false);
      }
    };

    fetchServerInfo();
    const serverInfoTimer = setInterval(fetchServerInfo, 1000);

    return () => {
      clearInterval(serverInfoTimer);
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    };
  }, []);



  // Periodic Snapshot Layout Autosave tick (using real live state values!)
  useEffect(() => {
    if (connectionState !== "connected") return;

    const interval = setInterval(() => {
      MemoryStore.saveWorkspaceLayout({
        scale: remoteScale,
        distance: remoteDistance,
        curvature: remoteCurvature,
        heightOffset: remoteHeightOffset,
        tilt: remoteTilt,
        environmentMode: remoteEnvironmentMode,
        sharpenStrength: remoteSharpenStrength
      });
      console.log("Autosaved current VR monitor workspace state to layout memory.");
    }, 30000);

    return () => clearInterval(interval);
  }, [
    connectionState,
    remoteScale,
    remoteDistance,
    remoteCurvature,
    remoteHeightOffset,
    remoteTilt,
    remoteEnvironmentMode,
    remoteSharpenStrength
  ]);

  const handleRefreshSessionToken = async () => {
    const isTauri =
      typeof window !== "undefined" &&
      (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const newToken = await invoke<string>("refresh_server_token");
        if (serverInfo) {
          setServerInfo({ ...serverInfo, token: newToken });
        }
        setTokenTimeRemaining(300);
        setIsTokenExpired(false);
      } catch (err) {
        console.error("Failed to refresh session token:", err);
      }
    } else {
      alert("Token refreshed (Sandbox Mode)");
    }
  };

  const handleToggleLocalOnly = async (val: boolean) => {
    setLocalOnlyMode(val);
    const isTauri =
      typeof window !== "undefined" &&
      (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("toggle_local_only", { localOnly: val });
        // Refresh token immediately to enforce clean session on settings change
        await invoke("refresh_server_token");
      } catch (err) {
        console.error("Failed to toggle local only mode:", err);
      }
    }
  };

  // WebRTC control message receiver for remote mobile playback actions
  const setupControlListeners = (provider: WebRTCStreamingProvider) => {
    provider.onControlMessageReceived((data) => {
      console.log("Desktop companion received remote action:", data);
      if (data.type === "media_action") {
        handleMediaAction(data.action as string, data.value);
      } else if (data.type === "thermal_stress" && data.level === "high") {
        setThermalThrottleAlert(true);
        handleProfileChange("performance");
      }
    });
  };

  const handleMediaAction = (action: string, value?: unknown) => {
    if (action === "thermal_stress_simulation") {
      setThermalThrottleAlert(true);
      handleProfileChange("performance");
      return;
    }
    if (mediaSource === "localvideo" && localVideoRef.current) {
      const video = localVideoRef.current;
      if (action === "play") {
        video.play().catch(console.error);
        setMediaPlaying(true);
      } else if (action === "pause") {
        video.pause();
        setMediaPlaying(false);
      } else if (action === "seek" && typeof value === "number") {
        video.currentTime = value;
        setMediaTime(value);
      } else if (action === "volume" && typeof value === "number") {
        video.volume = value;
        setMediaVolume(value);
      }
    } else if (mediaSource === "youtube") {
      const iframe = document.getElementById("youtube-media-player") as HTMLIFrameElement | null;
      if (!iframe || !iframe.contentWindow) return;

      if (action === "play") {
        iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        setMediaPlaying(true);
      } else if (action === "pause") {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        setMediaPlaying(false);
      } else if (action === "seek" && typeof value === "number") {
        iframe.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${value},true]}`, '*');
        setMediaTime(value);
      } else if (action === "volume" && typeof value === "number") {
        iframe.contentWindow.postMessage(`{"event":"command","func":"setVolume","args":[${value * 100}]}`, '*');
        setMediaVolume(value);
      }
    }
  };

  const ensureSignalingConnected = async () => {
    if (!streamingProviderRef.current && serverInfo) {
      const wsProtocol = "ws:";
      const signalingUrl = `${wsProtocol}//${serverInfo.ip}:${serverInfo.port}/ws/signaling`;

      console.log(`Desktop connecting to WebRTC signaling at ${signalingUrl}`);
      const provider = new WebRTCStreamingProvider();
      provider.setLocalOnly(localOnlyMode);
      streamingProviderRef.current = provider;
      provider.setProfileCeiling(resolutionProfile);

      provider.onConnectionStateChange((state) => {
        console.log("WebRTC Desktop state change:", state);
        setConnectionState(state);
      });

      setupControlListeners(provider);
      await provider.connect(signalingUrl, serverInfo.token, "desktop");
      setConnectionState("paired");

      // Stats Loop
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      statsIntervalRef.current = setInterval(async () => {
        if (streamingProviderRef.current) {
          const stats = await streamingProviderRef.current.getStats();
          setStreamingStats(stats);
          // Append to rolling telemetry history (keep last 30 seconds)
          setStatsHistory((prev) => {
            const next = [...prev, { ...stats, timestamp: Date.now() }];
            if (next.length > 30) {
              return next.slice(next.length - 30);
            }
            return next;
          });
        }
      }, 1000);
    }
  };

  const handleStartCapture = async () => {
    if (!captureProviderRef.current || !serverInfo) return;

    try {
      await captureProviderRef.current.initialize();
      // Initialize capture with current resolution profile
      await captureProviderRef.current.startCapture(resolutionProfile);

      const track = captureProviderRef.current.getVideoTrack();
      const audioTrack = captureProviderRef.current.getAudioTrack();
      if (!track) {
        throw new Error("No video track captured.");
      }

      const settings = track.getSettings();
      setTrackInfo({
        label: track.label,
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
      });

      track.onended = () => {
        console.log("Captured track ended by system/user.");
        handleStopCapture();
      };

      if (videoRef.current) {
        const stream = new MediaStream([track]);
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }

      setCaptureActive(true);

      // Ensure PeerConnection is open
      await ensureSignalingConnected();

      // Transmit video
      if (streamingProviderRef.current) {
        await streamingProviderRef.current.sendVideo(track);
        if (audioTrack) {
          await streamingProviderRef.current.sendAudio(audioTrack);
        }
      }

    } catch (err) {
      console.error("Desktop capture/streaming failed:", err);
      alert(`Streaming failed: ${err instanceof Error ? err.message : String(err)}`);
      handleStopCapture();
    }
  };

  useEffect(() => {
    if (serverInfo && !captureActive && !autoStartAttemptedRef.current) {
      const isTauri =
        typeof window !== "undefined" &&
        (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

      if (isTauri) {
        autoStartAttemptedRef.current = true;
        console.log("[vr-desk] Auto-initiating stream capture on startup...");
        const timer = setTimeout(() => {
          handleStartCapture();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverInfo, captureActive]);

  async function handleStopCapture() {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    if (streamingProviderRef.current) {
      await streamingProviderRef.current.disconnect();
      streamingProviderRef.current = null;
    }

    if (captureProviderRef.current) {
      await captureProviderRef.current.stopCapture();
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCaptureActive(false);
    setTrackInfo(null);
    setConnectionState("disconnected");
    setStreamingStats(null);
    setStatsHistory([]);
  };

  // Change resolution profile dynamically
  async function handleProfileChange(profile: "performance" | "balanced" | "quality" | "ultra") {
    setResolutionProfile(profile);

    if (captureActive && captureProviderRef.current) {
      await captureProviderRef.current.applyResolutionProfile(profile);
      
      // Update local diagnostics display
      const track = captureProviderRef.current.getVideoTrack();
      if (track) {
        const settings = track.getSettings();
        setTrackInfo({
          label: track.label,
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
        });
      }
    }

    if (streamingProviderRef.current) {
      streamingProviderRef.current.setProfileCeiling(profile);
    }
  };

  // Switch source dynamically (forces MediaStream request and replaceTrack)
  const handleSwitchSource = async () => {
    if (!captureActive) return;
    await handleStartCapture();
  };

  // Local Video File Processing
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLocalVideoFile(file);
      const url = URL.createObjectURL(file);
      setLocalVideoUrl(url);
      setMediaPlaying(false);
      setMediaTime(0);
    }
  };

  const handleLocalVideoMetadata = async () => {
    const video = localVideoRef.current;
    if (!video) return;

    setMediaDuration(video.duration || 0);

    // Capture direct video element stream and pipe to WebRTC
    try {
      await ensureSignalingConnected();
      
      const videoWithCapture = video as HTMLVideoElement & { captureStream?: () => MediaStream };
      const stream = videoWithCapture.captureStream ? videoWithCapture.captureStream() : null;
      if (stream && streamingProviderRef.current) {
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        if (videoTrack) {
          await streamingProviderRef.current.sendVideo(videoTrack);
          console.log("Casting local video file track directly...");
        }
        if (audioTrack) {
          await streamingProviderRef.current.sendAudio(audioTrack);
          console.log("Casting local video audio track directly...");
        }
        setCaptureActive(true);
      }
    } catch (err) {
      console.warn("Failed to capture local video stream:", err);
    }
  };

  const handleLocalPlayToggle = () => {
    if (localVideoRef.current) {
      if (localVideoRef.current.paused) {
        localVideoRef.current.play().catch(console.error);
        setMediaPlaying(true);
      } else {
        localVideoRef.current.pause();
        setMediaPlaying(false);
      }
    }
  };

  const handleLocalSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMediaTime(val);
    if (localVideoRef.current) {
      localVideoRef.current.currentTime = val;
    }
  };

  const onVideoTimeUpdate = () => {
    if (localVideoRef.current) {
      setMediaTime(localVideoRef.current.currentTime);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // YouTube Cinema parsing and controls
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleLoadYoutube = () => {
    const id = getYoutubeId(youtubeUrl);
    if (id) {
      setYoutubeId(id);
      setMediaPlaying(true);
      setMediaTime(0);
      setMediaDuration(600); // 10 minute seek default
      
      // Auto-trigger signaling so control channels bind
      ensureSignalingConnected();
    } else {
      alert("Invalid YouTube URL. Please enter a valid watch link.");
    }
  };

  const handleYoutubePlayToggle = () => {
    const iframe = document.getElementById("youtube-media-player") as HTMLIFrameElement | null;
    if (!iframe || !iframe.contentWindow) return;

    if (mediaPlaying) {
      iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      setMediaPlaying(false);
    } else {
      iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      setMediaPlaying(true);
    }
  };

  const handleYoutubeSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMediaTime(val);
    const iframe = document.getElementById("youtube-media-player") as HTMLIFrameElement | null;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${val},true]}`, '*');
    }
  };

  const pairingUrl = serverInfo
    ? `https://vdesk-theta.vercel.app/mobile/test-xr/?token=${serverInfo.token}&ip=${serverInfo.ip}&port=${serverInfo.port}`
    : "";

  const getStatusColor = () => {
    switch (connectionState) {
      case "connected":
        return "text-emerald-400 border-emerald-950 bg-emerald-950/20";
      case "connecting":
      case "checking":
        return "text-amber-400 border-amber-950 bg-amber-950/20";
      case "paired":
        return "text-blue-400 border-blue-950 bg-blue-950/20";
      case "disconnected":
        return "text-red-400 border-red-950 bg-red-950/20";
      default:
        return "text-zinc-400 border-zinc-800 bg-zinc-900/50";
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-sans space-y-6">
      {/* Thermal Overheat Alert Warning Banner */}
      {thermalThrottleAlert && (
        <div className="w-full max-w-4xl bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-lg flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-red-900/60 border border-red-700 rounded text-red-200">WARNING</span>
            <span>HEADSET OVERHEATING DETECTED: Throttling resolution profile to 720p (Performance) to cool down.</span>
          </div>
          <button 
            onClick={() => setThermalThrottleAlert(false)} 
            className="text-[10px] uppercase font-mono px-2 py-0.5 border border-red-800 rounded bg-red-900/30 hover:bg-red-900/60 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-2xl flex flex-col md:flex-row">
        
        {/* Left Side: Desktop Status & Pairing QR Code */}
        <div className="p-8 md:w-1/2 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-800">
          <div className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-800 text-blue-400 text-[10px] font-mono font-medium">
                ENGINE ACTIVE
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white mt-3">VR Desktop Companion</h1>
              <p className="text-xs text-zinc-400 mt-1">
                Local streaming server engine. Scan the QR code below using your phone to start the VR session.
              </p>
            </div>

            {/* Pairing methods */}
            <div className="space-y-4">
              {/* Dynamic QR Code Target */}
              <div className="flex flex-col items-center justify-center p-6 bg-zinc-950 border border-zinc-800 rounded-md">
                <div className="w-48 h-48 bg-white p-1.5 rounded flex items-center justify-center relative shadow-inner overflow-hidden">
                  {serverInfo ? (
                    <>
                      <QRCodeSVG 
                        value={pairingUrl} 
                        size={180} 
                        includeMargin={false} 
                        className={isTokenExpired ? "blur-[2px] opacity-40 select-none pointer-events-none" : ""} 
                      />
                      {isTokenExpired && (
                        <div className="absolute inset-0 bg-zinc-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-3 text-center gap-2">
                          <span className="text-zinc-400 text-[10px] font-mono leading-tight">Session token has expired.</span>
                          <button
                            onClick={handleRefreshSessionToken}
                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-[10px] font-bold rounded shadow transition active:scale-[0.98]"
                          >
                            Regenerate Token
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full bg-zinc-800 animate-pulse rounded" />
                  )}
                </div>
                {serverInfo && !isTokenExpired && (
                  <div className="flex justify-between items-center w-full max-w-xs text-[10px] font-mono text-zinc-500 mt-3 px-1">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Token active
                    </span>
                    <span>
                      Expires in: {Math.floor(tokenTimeRemaining / 60)}:{(tokenTimeRemaining % 60) < 10 ? "0" : ""}{tokenTimeRemaining % 60}
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-zinc-400 font-mono mt-3 text-center truncate w-full max-w-xs">
                  PAIRS TO: <span className="text-zinc-200">{pairingUrl || "Initializing server..."}</span>
                </p>
              </div>

              {/* Local-only Enforcement Toggle */}
              <div className="p-3.5 bg-zinc-950 border border-zinc-850 rounded text-[11px] flex justify-between items-center">
                <div className="space-y-0.5">
                  <div className="font-semibold text-zinc-200 font-mono uppercase text-[10px]">Localhost-Only USB Mode</div>
                  <div className="text-[10px] text-zinc-500 leading-normal">Restrict stream to loopback (blocks LAN/Wi-Fi connection entirely)</div>
                </div>
                <button
                  onClick={() => handleToggleLocalOnly(!localOnlyMode)}
                  className={`px-3 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    localOnlyMode
                      ? "bg-emerald-950 border-emerald-800 text-emerald-400 font-bold"
                      : "bg-zinc-900 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {localOnlyMode ? "ACTIVE" : "INACTIVE"}
                </button>
              </div>

              {/* USB Mode instructions */}
              <div className="p-3.5 bg-zinc-950/60 border border-zinc-850 rounded text-[11px] space-y-2">
                <div className="font-semibold text-zinc-300 font-mono text-[10px] uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                  High-Speed USB Mode
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Connect your phone via USB cable and enable <span className="text-zinc-200 font-medium">USB Debugging</span>. 
                  Tauri auto-configures port forwarding so you can load <a href={`http://localhost:${serverInfo?.port || 8080}/mobile/test-xr/`} className="text-blue-400 font-semibold underline" target="_blank" rel="noopener noreferrer">http://localhost:{serverInfo?.port || 8080}/mobile/test-xr/</a> directly on your phone with zero setup and zero latency!
                </p>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-zinc-500 leading-relaxed font-mono mt-6">
            Everything runs locally on your Wi-Fi or USB connection. Localhost origins (USB Mode) are treated as secure contexts by default in mobile Chrome.
          </div>
        </div>

        {/* Right Side: Broadcasting & WebRTC Control */}
        <div className="p-8 md:w-1/2 flex flex-col justify-between bg-zinc-900/50">
          <div className="space-y-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Broadcasting & Media Center
              </h2>
              
              {/* Media source selectors */}
              <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 border border-zinc-850 rounded-md mt-2.5">
                {([
                  { id: "screenshare", label: "Screen" },
                  { id: "localvideo", label: "Video" },
                  { id: "youtube", label: "YouTube" }
                ] as const).map((src) => (
                  <button
                    key={src.id}
                    onClick={() => {
                      handleStopCapture();
                      setMediaSource(src.id);
                    }}
                    className={`py-1.5 text-[11px] font-mono rounded font-semibold transition ${
                      mediaSource === src.id
                        ? "bg-blue-600 border border-blue-700 text-white"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
                    }`}
                  >
                    {src.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Connection status badge */}
            {captureActive && (
              <div className={`p-2.5 border rounded text-xs font-mono flex items-center justify-between ${getStatusColor()}`}>
                <span>LINK STATUS:</span>
                <span className="font-bold">{connectionState.toUpperCase()}</span>
              </div>
            )}

            {/* Render selected Media View */}
            {mediaSource === "screenshare" && (
              <div className="space-y-5">
                {/* Video preview or placeholder */}
                <div className="aspect-video w-full bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden flex items-center justify-center relative">
                  {captureActive ? (
                    <video ref={videoRef} className="w-full h-full object-contain" muted playsInline />
                  ) : (
                    <div className="text-center p-4">
                      <span className="text-zinc-600 block text-xs font-mono mb-2">[NO CAPTURE]</span>
                      <span className="text-xs text-zinc-500 block mt-2">No capture active</span>
                    </div>
                  )}
                </div>

                {/* Resolution Profiles Button Group */}
                <div className="space-y-2">
                  <label className="text-[10px] text-zinc-500 uppercase block font-mono">Stream Quality Profile</label>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { id: "performance", label: "720p" },
                      { id: "balanced", label: "1080p" },
                      { id: "quality", label: "1440p" },
                      { id: "ultra", label: "4K" },
                    ] as const).map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => handleProfileChange(profile.id)}
                        className={`py-1.5 text-xs font-semibold rounded border transition ${
                          resolutionProfile === profile.id
                            ? "bg-blue-600 border-blue-700 text-white"
                            : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {profile.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {mediaSource === "localvideo" && (
              <div className="space-y-4">
                {/* Direct file selector */}
                {!localVideoFile ? (
                  <label className="flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-8 bg-zinc-950/60 hover:bg-zinc-950 transition cursor-pointer select-none">
                    <span className="text-xs text-zinc-500 font-mono mb-2">[VIDEO FILE]</span>
                    <span className="text-xs text-zinc-300 font-semibold">Select Local Video File</span>
                    <span className="text-[10px] text-zinc-500 mt-1">Direct stream to VR mesh with Spatial Audio</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="space-y-3">
                    <div className="aspect-video w-full bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden relative">
                      <video
                        ref={localVideoRef}
                        src={localVideoUrl}
                        onLoadedMetadata={handleLocalVideoMetadata}
                        onTimeUpdate={onVideoTimeUpdate}
                        className="w-full h-full object-contain"
                        playsInline
                        muted={false} // Spatial audio feeds from this element source
                      />
                    </div>
                    
                    {/* Media controls */}
                    <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-md space-y-2">
                      <div className="text-xs text-zinc-300 font-mono truncate">{localVideoFile.name}</div>
                      
                      {/* Seek bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-500">{formatTime(mediaTime)}</span>
                        <input
                          type="range"
                          min="0"
                          max={mediaDuration || 100}
                          value={mediaTime}
                          onChange={handleLocalSeekChange}
                          className="grow h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <span className="text-[10px] font-mono text-zinc-500">{formatTime(mediaDuration)}</span>
                      </div>

                      {/* Control buttons */}
                      <div className="flex justify-between items-center mt-2.5">
                        <button
                          onClick={handleLocalPlayToggle}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded transition active:scale-[0.98]"
                        >
                          {mediaPlaying ? "Pause" : "Play"}
                        </button>
                        
                        <label className="text-[10px] text-zinc-500 font-mono cursor-pointer hover:text-zinc-300 transition">
                          Change file...
                          <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mediaSource === "youtube" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter YouTube URL (watch link)"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="grow px-3 py-2 text-xs bg-zinc-955 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-blue-500 transition"
                  />
                  <button
                    onClick={handleLoadYoutube}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded transition active:scale-[0.98]"
                  >
                    Load
                  </button>
                </div>

                {youtubeId ? (
                  <div className="space-y-3">
                    <div className="aspect-video w-full bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden relative">
                      {/* Embed player */}
                      <iframe
                        id="youtube-media-player"
                        src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}&autoplay=1&controls=0`}
                        className="w-full h-full border-0"
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                      />
                    </div>
                    
                    {/* Remote Player Controls */}
                    <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-md space-y-2">
                      <div className="text-xs text-zinc-300 font-mono truncate">YouTube Cinema: Active</div>
                      
                      {/* Seek bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-500">{formatTime(mediaTime)}</span>
                        <input
                          type="range"
                          min="0"
                          max={mediaDuration || 600}
                          value={mediaTime}
                          onChange={handleYoutubeSeekChange}
                          className="grow h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <span className="text-[10px] font-mono text-zinc-500">{formatTime(mediaDuration)}</span>
                      </div>

                      {/* Control buttons */}
                      <div className="flex justify-between items-center mt-2.5">
                        <button
                          onClick={handleYoutubePlayToggle}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded transition active:scale-[0.98]"
                        >
                          {mediaPlaying ? "Pause" : "Play"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center border border-zinc-800 rounded-lg p-8 bg-zinc-950/60 text-zinc-500 text-center text-xs">
                    <span className="text-zinc-650 block text-[10px] font-mono mb-2">[YOUTUBE]</span>
                    <span className="mt-2 font-mono">YouTube embed coordinates will load here</span>
                  </div>
                )}
              </div>
            )}

            {trackInfo && mediaSource === "screenshare" && (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono space-y-1.5">
                <div className="text-zinc-500 uppercase font-bold text-[9px] mb-1">Source Diagnostics</div>
                <div className="truncate"><span className="text-zinc-500">Source:</span> {trackInfo.label}</div>
                <div><span className="text-zinc-500">Geometry:</span> {trackInfo.width} x {trackInfo.height}</div>
                <div><span className="text-zinc-500">Framerate:</span> {trackInfo.frameRate} FPS</div>
                <div><span className="text-zinc-500">Max Bandwidth:</span> {resolutionProfile === "ultra" ? "25 Mbps" : resolutionProfile === "quality" ? "16 Mbps" : resolutionProfile === "balanced" ? "8 Mbps" : "4 Mbps"}</div>
              </div>
            )}

            {/* Stats display if streaming active */}
            {streamingStats && connectionState === "connected" && (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono space-y-1">
                <div className="text-zinc-500 uppercase font-bold text-[9px] mb-1">WebRTC Link Telemetry</div>
                <div className="grid grid-cols-2 gap-y-1">
                  <div>FPS: <span className="text-white font-bold">{streamingStats.fps}</span></div>
                  <div>Bitrate: <span className="text-white font-bold">{(streamingStats.bitrate / 1_000_000).toFixed(2)} Mbps</span></div>
                  <div>RTT: <span className="text-white font-bold">{streamingStats.rtt.toFixed(0)} ms</span></div>
                  <div>Loss: <span className="text-white font-bold">{streamingStats.packetLoss.toFixed(1)}%</span></div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8">
            {mediaSource === "screenshare" ? (
              !captureActive ? (
                <button
                  onClick={handleStartCapture}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm rounded shadow-lg transition active:scale-[0.98]"
                >
                  Start Desktop Stream
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleSwitchSource}
                    className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-sm rounded shadow transition active:scale-[0.98]"
                  >
                    Change Source
                  </button>
                  <button
                    onClick={handleStopCapture}
                    className="py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold text-sm rounded shadow transition active:scale-[0.98]"
                  >
                    Stop Stream
                  </button>
                </div>
              )
            ) : (
              captureActive && (
                <button
                  onClick={handleStopCapture}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold text-sm rounded shadow transition active:scale-[0.98]"
                >
                  Stop Media Stream
                </button>
              )
            )}
          </div>
        </div>

      </div>

      {/* Remote VR Control Panel (Active only when connected) */}
      {connectionState === "connected" && (
        <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-lg p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-850 pb-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-[10px] font-mono font-medium">
                LINK ACTIVE
              </div>
              <h2 className="text-base font-bold tracking-tight text-white mt-2">Headset Remote Controls</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Calibrate and transform the mobile virtual monitor in real-time. Changes sync instantly over WebRTC.
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={triggerRemoteCalibrate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold rounded shadow transition active:scale-[0.98] flex items-center gap-1"
              >
                Recenter Horizon
              </button>
              <button
                onClick={toggleRemoteHud}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-300 text-xs font-semibold rounded border border-zinc-750 transition active:scale-[0.98]"
              >
                {remoteHudHidden ? "Show Headset HUD" : "Hide Headset HUD"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left side: presets, transforms, and lens/IPD calibration */}
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Workspace Presets</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { id: "coding", label: "Coding" },
                    { id: "movie", label: "Cinema" },
                    { id: "presentation", label: "Board" },
                    { id: "gaming", label: "Gaming" },
                  ] as const).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyRemotePreset(preset.id)}
                      className="px-3 py-2 text-center text-xs bg-zinc-955 border border-zinc-855 hover:bg-zinc-855 hover:border-zinc-750 text-zinc-300 rounded font-medium transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Size */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Scale Size</span>
                    <span className="font-mono text-zinc-300">{remoteScale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="3.0"
                    step="0.05"
                    value={remoteScale}
                    onChange={(e) => {
                      setRemoteScale(parseFloat(e.target.value));
                      setRemoteHeadsetPreset("custom");
                    }}
                    className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Distance */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Focal Distance</span>
                    <span className="font-mono text-zinc-300">{remoteDistance.toFixed(1)}m</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="6.0"
                    step="0.1"
                    value={remoteDistance}
                    onChange={(e) => setRemoteDistance(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Curvature */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Curved Bending</span>
                    <span className="font-mono text-zinc-300">{remoteCurvature > 0 ? `${remoteCurvature.toFixed(1)}m radius` : "Flat"}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="5.0"
                    step="0.1"
                    value={remoteCurvature}
                    onChange={(e) => setRemoteCurvature(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* HeightOffset */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Raise / Lower</span>
                    <span className="font-mono text-zinc-300">{remoteHeightOffset > 0 ? `+${remoteHeightOffset.toFixed(2)}m` : `${remoteHeightOffset.toFixed(2)}m`}</span>
                  </div>
                  <input
                    type="range"
                    min="-1.5"
                    max="1.5"
                    step="0.05"
                    value={remoteHeightOffset}
                    onChange={(e) => setRemoteHeightOffset(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-855 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              {/* Lens & IPD Calibration */}
              <div className="space-y-4 pt-4 border-t border-zinc-850">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Lens & IPD Calibration</label>
                
                {/* Headset Profile Select */}
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-500 block font-mono mb-1">Headset Profile</label>
                  <select
                    value={remoteHeadsetPreset}
                    onChange={(e) => applyRemoteHeadsetPreset(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-blue-500 hover:bg-zinc-900 transition"
                  >
                    <option value="custom">Custom Calibrated</option>
                    <option value="cardboard_v1">Google Cardboard V1</option>
                    <option value="cardboard_v2">Google Cardboard V2</option>
                    <option value="gear_vr">Samsung GearVR</option>
                    <option value="daydream">Daydream View</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* IPD Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">IPD spacing</span>
                      <span className="font-mono text-zinc-300">{Math.round(remoteIpd * 1000)}mm</span>
                    </div>
                    <input
                      type="range"
                      min="0.050"
                      max="0.075"
                      step="0.001"
                      value={remoteIpd}
                      onChange={(e) => {
                        setRemoteIpd(parseFloat(e.target.value));
                        setRemoteHeadsetPreset("custom");
                      }}
                      className="w-full h-1 bg-zinc-855 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {/* Distortion Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Lens Distortion</span>
                      <span className="font-mono text-zinc-300">{remoteDistortion.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="0.3"
                      step="0.01"
                      value={remoteDistortion}
                      onChange={(e) => {
                        setRemoteDistortion(parseFloat(e.target.value));
                        setRemoteHeadsetPreset("custom");
                      }}
                      className="w-full h-1 bg-zinc-855 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="remoteCalibrationMode"
                    checked={remoteCalibrationMode}
                    onChange={(e) => setRemoteCalibrationMode(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="remoteCalibrationMode" className="text-xs text-zinc-300 cursor-pointer select-none">
                    Enable Stereo Calibration Grid
                  </label>
                </div>
              </div>
            </div>

            {/* Right side: tilt, sharpen, environments, and productivity modes */}
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tilt */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Tilt Angle</span>
                    <span className="font-mono text-zinc-300">{remoteTilt}°</span>
                  </div>
                  <input
                    type="range"
                    min="-30"
                    max="30"
                    step="1"
                    value={remoteTilt}
                    onChange={(e) => setRemoteTilt(parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Sharpening */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">CAS Sharpening</span>
                    <span className="font-mono text-zinc-300">{(remoteSharpenStrength * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={remoteSharpenStrength}
                    onChange={(e) => setRemoteSharpenStrength(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Environment Room</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { id: "workspace", label: "Office" },
                    { id: "cinema", label: "Cinema" },
                    { id: "space", label: "Space" },
                    { id: "void", label: "Void" },
                  ] as const).map((env) => (
                    <button
                      key={env.id}
                      onClick={() => setRemoteEnvironmentMode(env.id)}
                      className={`px-3 py-2 text-center text-xs rounded font-medium border transition ${
                        remoteEnvironmentMode === env.id
                          ? "bg-blue-600 border-blue-700 text-white"
                          : "bg-zinc-950 border-zinc-855 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {env.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Productivity View Modes */}
              <div className="space-y-3 pt-4 border-t border-zinc-850">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Productivity View Modes</label>
                
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="remoteReadingMode"
                      checked={remoteReadingMode}
                      onChange={(e) => setRemoteReadingMode(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <label htmlFor="remoteReadingMode" className="text-xs font-semibold text-zinc-200 cursor-pointer select-none">
                        Reading Mode
                      </label>
                      <p className="text-[10px] text-zinc-500">Optimizes text clarity (boosts sharpening to 70%, increases contrast to 125%, dims background)</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="remoteFocusMode"
                      checked={remoteFocusMode}
                      onChange={(e) => setRemoteFocusMode(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <label htmlFor="remoteFocusMode" className="text-xs font-semibold text-zinc-200 cursor-pointer select-none">
                        Focus Mode
                      </label>
                      <p className="text-[10px] text-zinc-500">Dims environment and highlights monitor (pure black surroundings)</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="remotePresentationMode"
                      checked={remotePresentationMode}
                      onChange={(e) => setRemotePresentationMode(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <label htmlFor="remotePresentationMode" className="text-xs font-semibold text-zinc-200 cursor-pointer select-none">
                        Presentation Mode
                      </label>
                      <p className="text-[10px] text-zinc-500">Large screen viewing (scales to 1.8x, translates display to high cinema position)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Enhancement Suite */}
              <div className="space-y-4 pt-4 border-t border-zinc-850">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Visual Enhancement Suite</label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Anti Screen Door */}
                  <div className="flex items-center justify-between text-xs p-1 bg-zinc-950/40 border border-zinc-850/60 rounded px-2.5">
                    <span className="text-zinc-400">SDE Grid Diffusion</span>
                    <button
                      onClick={() => setRemoteAntiScreenDoor(prev => !prev)}
                      className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded border transition ${
                        remoteAntiScreenDoor
                          ? "bg-emerald-950 border-emerald-800 text-emerald-400 font-bold"
                          : "bg-zinc-900 border-zinc-800 text-zinc-500"
                      }`}
                    >
                      {remoteAntiScreenDoor ? "ON" : "OFF"}
                    </button>
                  </div>

                  {/* HDR Simulation */}
                  <div className="flex items-center justify-between text-xs p-1 bg-zinc-950/40 border border-zinc-850/60 rounded px-2.5">
                    <span className="text-zinc-400">HDR Simulation</span>
                    <button
                      onClick={() => setRemoteHdrEnabled(prev => !prev)}
                      className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded border transition ${
                        remoteHdrEnabled
                          ? "bg-emerald-950 border-emerald-800 text-emerald-400 font-bold"
                          : "bg-zinc-900 border-zinc-800 text-zinc-500"
                      }`}
                    >
                      {remoteHdrEnabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* HDR Exposure (Conditional) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">HDR Exposure</span>
                      <span className="font-mono text-zinc-300">{remoteExposure.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      disabled={!remoteHdrEnabled}
                      value={remoteExposure}
                      onChange={(e) => setRemoteExposure(parseFloat(e.target.value))}
                      className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                        !remoteHdrEnabled ? "opacity-50 cursor-not-allowed bg-zinc-900" : "bg-zinc-850"
                      }`}
                    />
                  </div>

                  {/* Dynamic Supersampling */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Dynamic Supersampling</span>
                      <button
                        onClick={() => setRemoteAutoSupersampling(prev => !prev)}
                        className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded border transition ${
                          remoteAutoSupersampling
                            ? "bg-emerald-950 border-emerald-800 text-emerald-400 font-bold"
                            : "bg-zinc-900 border-zinc-800 text-zinc-500"
                        }`}
                      >
                        {remoteAutoSupersampling ? "AUTO" : "MANUAL"}
                      </button>
                    </div>
                    {/* Supersampling Slider */}
                    <div className="space-y-1 mt-1">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                        <span>SS Factor</span>
                        <span>{remoteSupersampling.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="1.8"
                        step="0.1"
                        disabled={remoteAutoSupersampling}
                        value={remoteSupersampling}
                        onChange={(e) => setRemoteSupersampling(parseFloat(e.target.value))}
                        className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                          remoteAutoSupersampling ? "opacity-50 cursor-not-allowed bg-zinc-900" : "bg-zinc-855"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Telemetry Dashboard Section */}
      {connectionState === "connected" && statsHistory.length > 0 && (
        <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-850 pb-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-white font-mono uppercase">WebRTC Telemetry Dashboard</h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">Real-time rolling performance diagnostics (last 30 seconds)</p>
            </div>
            {/* Simulation of Thermal Overheat */}
            <button 
              onClick={() => {
                handleMediaAction("thermal_stress_simulation"); 
              }}
              className="px-2.5 py-1 bg-red-950/40 hover:bg-red-950/70 border border-red-900 text-red-400 text-[10px] font-mono rounded transition active:scale-[0.98]"
            >
              [STRESS] Sim Overheat
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TelemetryMiniChart
              title="Stream Framerate"
              data={statsHistory.map(s => s.fps)}
              color="#10b981"
              unit=" FPS"
              minVal={0}
              maxVal={70}
            />
            <TelemetryMiniChart
              title="Transmission Bandwidth"
              data={statsHistory.map(s => s.bitrate / 1_000_000)}
              color="#3b82f6"
              unit=" Mbps"
              minVal={0}
              maxVal={30}
              labelFormatter={(v) => v.toFixed(2)}
            />
            <LatencyTelemetryChart
              history={statsHistory}
            />
          </div>
        </div>
      )}

      {/* AI Operating Layer Control Command Panel */}
      <AIPanel
        connectionState={connectionState}
        mediaSource={mediaSource}
        resolutionProfile={resolutionProfile}
        streamingStats={streamingStats}
        thermalThrottleAlert={thermalThrottleAlert}
        videoRef={videoRef}
        setResolutionProfile={handleProfileChange}
        setRemoteReadingMode={setRemoteReadingMode}
        setRemoteFocusMode={setRemoteFocusMode}
        setRemoteEnvironmentMode={setRemoteEnvironmentMode}
        setRemoteScale={setRemoteScale}
        setRemoteDistance={setRemoteDistance}
        setRemoteCurvature={setRemoteCurvature}
        setRemoteTilt={setRemoteTilt}
        setRemoteSharpenStrength={setRemoteSharpenStrength}
        setLocalOnlyMode={handleToggleLocalOnly}
        handleRefreshSessionToken={handleRefreshSessionToken}
        applyRemotePreset={applyRemotePreset}
        setRemoteSupersampling={setRemoteSupersampling}
        setRemoteHdrEnabled={setRemoteHdrEnabled}
        setRemoteExposure={setRemoteExposure}
      />
    </main>
  );
}
