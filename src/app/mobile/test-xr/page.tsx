"use client";

import React, { useState, useRef, useEffect } from "react";
import { VRScene } from "../../../components/VRScene";
import { WebRTCStreamingProvider } from "../../../utils/providers";
import * as THREE from "three";

export default function TestXRPage() {
  const [sharpenStrength, setSharpenStrength] = useState<number>(0.3);
  const [environmentMode, setEnvironmentMode] = useState<"void" | "workspace" | "space" | "cinema">("workspace");
  
  const [xrSupported, setXrSupported] = useState<boolean | null>(null);
  const [inXR, setInXR] = useState<boolean>(false);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  // WebRTC Streaming State
  const [token, setToken] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>("disconnected");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [streamingStats, setStreamingStats] = useState<{
    fps: number;
    bitrate: number;
    packetLoss: number;
    rtt: number;
    encodeLatency?: number;
    decodeLatency?: number;
  } | null>(null);
  const [thermalWarning, setThermalWarning] = useState<boolean>(false);
  const thermalTicksRef = useRef<number>(0);
  const [supportedCodecs, setSupportedCodecs] = useState<string[]>([]);
  const [screenSpecs, setScreenSpecs] = useState<{ width: number; height: number; dpr: number } | null>(null);

  // 3D Monitor Geometry & Position States
  const [scale, setScale] = useState<number>(1.0); // Size factor (0.5 to 3.0)
  const [distance, setDistance] = useState<number>(2.0); // Distance in meters (1.0 to 5.0)
  const [curvature, setCurvature] = useState<number>(3.0); // Curve radius (0 for flat, 1.0 to 5.0 for curved)
  const [heightOffset, setHeightOffset] = useState<number>(0.0); // Height offset (-1.0 to 1.0)
  const [tilt, setTilt] = useState<number>(0); // Tilt angle in degrees (-30 to 30)

  // Spacing, Lens, and Calibration
  const [ipd, setIpd] = useState<number>(0.064); // Eye spacing in meters (0.050 to 0.075)
  const [distortion, setDistortion] = useState<number>(0.08); // Lens distortion coefficient (0.0 to 0.3)
  const [calibrationMode, setCalibrationMode] = useState<boolean>(false); // Show green crosshair grid

  // Productivity modes
  const [readingMode, setReadingMode] = useState<boolean>(false);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [presentationMode, setPresentationMode] = useState<boolean>(false);

  // Spatial Audio & Media Player Sync states
  const [spatialAudioEnabled, setSpatialAudioEnabled] = useState<boolean>(true);
  const [mediaPlaying, setMediaPlaying] = useState<boolean>(false);
  const [mediaTitle, setMediaTitle] = useState<string>("");
  const [mediaTime, setMediaTime] = useState<number>(0);
  const [mediaDuration, setMediaDuration] = useState<number>(0);

  // Stereo split screen & head tracking states (both ON by default)
  const [gyroEnabled, setGyroEnabled] = useState<boolean>(true);
  const [calibrateTrigger, setCalibrateTrigger] = useState<number>(0);
  const [hideSidebar, setHideSidebar] = useState<boolean>(true); // Hidden by default inside VR Box

  // Visual Enhancement Suite States
  const [supersampling, setSupersampling] = useState<number>(1.0);
  const [autoSupersampling, setAutoSupersampling] = useState<boolean>(true);
  const [antiScreenDoor, setAntiScreenDoor] = useState<boolean>(false);
  const [hdrEnabled, setHdrEnabled] = useState<boolean>(false);
  const [exposure, setExposure] = useState<number>(1.2);
  const [headsetPreset, setHeadsetPreset] = useState<string>("custom");

  // Manual configuration inputs
  const [manualIp, setManualIp] = useState("");
  const [manualPort, setManualPort] = useState("8080");
  const [manualToken, setManualToken] = useState("");

  const [customIp, setCustomIp] = useState<string | null>(null);
  const [customPort, setCustomPort] = useState<string | null>(null);

  // PIN pairing state — lets user enter 6-digit code from PC companion
  const [pinInput, setPinInput] = useState("");
  const [pinPairingError, setPinPairingError] = useState<string | null>(null);
  const [pinPairingLoading, setPinPairingLoading] = useState(false);

  // Battery API thermal state (real device temperature proxy)
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batteryCharging, setBatteryCharging] = useState<boolean>(false);
  const batteryRef = useRef<unknown>(null);

  const streamingProviderRef = useRef<WebRTCStreamingProvider | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const connectionStateRef = useRef<string>("disconnected");
  const autoSupersamplingRef = useRef<boolean>(true);

  useEffect(() => {
    autoSupersamplingRef.current = autoSupersampling;
  }, [autoSupersampling]);

  // Format time utility (MM:SS)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Helper to send actions back to Desktop Host
  function sendMediaAction(action: "play" | "pause" | "seek" | "volume", value?: unknown) {
    if (streamingProviderRef.current && streamingProviderRef.current.isControlChannelOpen()) {
      streamingProviderRef.current.sendControlMessage({
        type: "media_action",
        action,
        value,
      });
    }
  }

  // Pre-declared preset and calibration handlers to avoid TDZ rules
  function applyPreset(preset: string) {
    setHeadsetPreset("custom");
    switch (preset) {
      // Monitor geometry presets
      case "coding":
        setScale(1.0);
        setDistance(1.8);
        setCurvature(2.0);
        setHeightOffset(0.0);
        setTilt(0);
        setSharpenStrength(0.5);
        setEnvironmentMode("workspace");
        break;
      case "movie":
        setScale(1.8);
        setDistance(3.5);
        setCurvature(4.0);
        setHeightOffset(0.4);
        setTilt(-5);
        setSharpenStrength(0.1);
        setEnvironmentMode("cinema");
        break;
      case "presentation":
        setScale(1.1);
        setDistance(2.5);
        setCurvature(0.0);
        setHeightOffset(0.2);
        setTilt(0);
        setSharpenStrength(0.2);
        setEnvironmentMode("workspace");
        break;
      case "gaming":
        setScale(1.3);
        setDistance(1.8);
        setCurvature(1.5);
        setHeightOffset(0.0);
        setTilt(-2);
        setSharpenStrength(0.35);
        setEnvironmentMode("space");
        break;
      // Environment/visual presets from DataChannel
      case "void":
        setEnvironmentMode("void");
        break;
      case "cinema":
        setEnvironmentMode("cinema");
        setSupersampling(1.2);
        setHdrEnabled(true);
        break;
      case "workspace":
        setEnvironmentMode("workspace");
        setSupersampling(1.0);
        break;
      case "space":
        setEnvironmentMode("space");
        break;
      case "performance":
        setSupersampling(0.8);
        setAntiScreenDoor(false);
        setHdrEnabled(false);
        break;
      case "quality":
        setSupersampling(1.4);
        setAntiScreenDoor(true);
        setHdrEnabled(true);
        break;
      default:
        console.warn("Unknown preset:", preset);
    }
  }


  function applyHeadsetPreset(preset: string) {
    setHeadsetPreset(preset);
    switch (preset) {
      case "cardboard_v1":
        setIpd(0.060);
        setDistortion(0.05);
        setScale(0.9);
        break;
      case "cardboard_v2":
        setIpd(0.064);
        setDistortion(0.08);
        setScale(1.0);
        break;
      case "gear_vr":
        setIpd(0.062);
        setDistortion(0.12);
        setScale(1.05);
        break;
      case "daydream":
        setIpd(0.064);
        setDistortion(0.15);
        setScale(1.10);
        break;
    }
  }

  // Trigger gyroscope recenter on the VR scene
  function triggerCalibrate() {
    setCalibrateTrigger((prev) => prev + 1);
  }

  // Check if WebXR is supported and detect device details
  useEffect(() => {
    if (typeof window !== "undefined") {
      setTimeout(() => {
        setScreenSpecs({
          width: window.screen.width,
          height: window.screen.height,
          dpr: window.devicePixelRatio,
        });

        // Check client_id fingerprint trust status
        let clientId = localStorage.getItem("vr_desk_client_id");
        if (!clientId) {
          clientId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
          localStorage.setItem("vr_desk_client_id", clientId);
        }

        // Parse pairing token from query string
        const urlParams = new URLSearchParams(window.location.search);
        const pairingToken = urlParams.get("token");
        const ipParam = urlParams.get("ip");
        const portParam = urlParams.get("port");

        if (ipParam) setCustomIp(ipParam);
        if (portParam) setCustomPort(portParam);

        if (pairingToken) {
          setToken(pairingToken);
        } else {
          // If no token in URL, query companion trust API to auto-fetch active token
          const tryTrustedPair = async () => {
            try {
              const res = await fetch(`/api/pair_trusted?client_id=${clientId}`);
              const data = await res.json();
              if (data.success && data.token) {
                console.log("Auto-paired with trusted companion. Token:", data.token);
                setToken(data.token);
              }
            } catch (err) {
              console.warn("Trusted pairing query failed (companion server might be offline):", err);
            }
          };
          tryTrustedPair();
        }

        if (navigator.xr) {
          navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
            setXrSupported(supported);
          });
        } else {
          setXrSupported(false);
        }

        // Detect codec capabilities
        type capabilitiesType = { getCapabilities?: (kind: string) => { codecs?: Array<{ mimeType: string }> } };
        const receiver = RTCRtpReceiver as unknown as capabilitiesType;
        if (typeof RTCRtpReceiver !== "undefined" && receiver.getCapabilities) {
          try {
            const capabilities = receiver.getCapabilities("video");
            if (capabilities && capabilities.codecs) {
              const codecs = capabilities.codecs
                .map((c: { mimeType: string }) => c.mimeType.replace("video/", ""))
                .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index);
              setSupportedCodecs(codecs);
            }
          } catch (err) {
            console.warn("Codec detection failed:", err);
          }
        }
      }, 0);
    }
  }, []);

  // Battery API — real device thermal stress proxy.
  // Subscribes to level/charging changes throughout the VR session lifetime.
  useEffect(() => {
    let cancelled = false;

    const initBattery = async () => {
      try {
        const nav = navigator as Navigator & {
          getBattery?: () => Promise<{
            level: number;
            charging: boolean;
            addEventListener: (e: string, cb: () => void) => void;
            removeEventListener: (e: string, cb: () => void) => void;
          }>;
        };
        if (!nav.getBattery) return;

        const battery = await nav.getBattery();
        batteryRef.current = battery;

        const update = () => {
          if (!cancelled) {
            setBatteryLevel(battery.level);
            setBatteryCharging(battery.charging);
          }
        };

        update(); // read initial state
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
      } catch (err) {
        console.warn('[vr-desk] Battery API unavailable on this device:', err);
      }
    };

    initBattery();
    return () => { cancelled = true; };
  }, []);


  // WebRTC Connection logic

  useEffect(() => {
    if (!token || token === "demo") {
      if (token === "demo") {
        setTimeout(() => {
          setConnectionState("demo_sandbox");
        }, 0);
        connectionStateRef.current = "demo_sandbox";
      }
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const ipParam = urlParams.get("ip");
    const portParam = urlParams.get("port");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const signalingUrl = ipParam && portParam
      ? `wss://${ipParam}:${portParam}/ws/signaling`
      : `${protocol}//${window.location.host}/ws/signaling`;

    console.log(`Connecting to signaling at ${signalingUrl} with token ${token}`);
    const provider = new WebRTCStreamingProvider();
    
    // Auto-detect local loopback context (USB Mode) to disable STUN server
    const isLocal = typeof window !== "undefined" && 
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    provider.setLocalOnly(isLocal);
    
    streamingProviderRef.current = provider;

    provider.onConnectionStateChange((state) => {
      console.log("WebRTC Connection State changed:", state);
      setConnectionState(state);
      connectionStateRef.current = state;

      // Auto-register as trusted on first successful peer connection
      if (state === "connected" && token && token !== "demo") {
        const clientId = localStorage.getItem("vr_desk_client_id");
        if (clientId) {
          fetch("/api/register_trust", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: clientId,
              device_name: navigator.userAgent.substring(0, 40) || "Mobile VR Headset",
            }),
          })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log("Device successfully registered as trusted companion.");
            }
          })
          .catch((err) => console.warn("Failed to register trust:", err));
        }
      }
    });

    provider.onTrackReceived = (receivedStream) => {
      console.log("Desktop stream track received on mobile:", receivedStream);
      setStream(receivedStream);
    };

    // Receive transformation properties and control actions from Desktop App via DataChannel
    provider.onControlMessageReceived((data) => {
      console.log("Control message received via WebRTC DataChannel:", data);
      if (data.type === "update_monitor") {
        if (data.scale !== undefined) setScale(data.scale);
        if (data.distance !== undefined) setDistance(data.distance);
        if (data.curvature !== undefined) setCurvature(data.curvature);
        if (data.heightOffset !== undefined) setHeightOffset(data.heightOffset);
        if (data.tilt !== undefined) setTilt(data.tilt);
        if (data.sharpenStrength !== undefined) setSharpenStrength(data.sharpenStrength);
        if (data.environmentMode !== undefined) setEnvironmentMode(data.environmentMode);
        
        // Lens, IPD and Calibration
        if (data.ipd !== undefined) setIpd(data.ipd);
        if (data.distortion !== undefined) setDistortion(data.distortion);
        if (data.calibrationMode !== undefined) setCalibrationMode(data.calibrationMode);

        // Productivity modes
        if (data.readingMode !== undefined) setReadingMode(data.readingMode);
        if (data.focusMode !== undefined) setFocusMode(data.focusMode);
        if (data.presentationMode !== undefined) setPresentationMode(data.presentationMode);

        // Visual Enhancement Suite
        if (data.supersampling !== undefined) setSupersampling(data.supersampling);
        if (data.autoSupersampling !== undefined) setAutoSupersampling(data.autoSupersampling);
        if (data.antiScreenDoor !== undefined) setAntiScreenDoor(data.antiScreenDoor);
        if (data.hdrEnabled !== undefined) setHdrEnabled(data.hdrEnabled);
        if (data.exposure !== undefined) setExposure(data.exposure);
        if (data.headsetPreset !== undefined) {
          setHeadsetPreset(data.headsetPreset);
          const p = data.headsetPreset;
          if (p === "cardboard_v1") {
            setIpd(0.060); setDistortion(0.05); setScale(0.9);
          } else if (p === "cardboard_v2") {
            setIpd(0.064); setDistortion(0.08); setScale(1.0);
          } else if (p === "gear_vr") {
            setIpd(0.062); setDistortion(0.12); setScale(1.05);
          } else if (p === "daydream") {
            setIpd(0.064); setDistortion(0.15); setScale(1.10);
          }
        }
      } else if (data.type === "media_state") {
        if (data.playing !== undefined) setMediaPlaying(data.playing);
        if (data.currentTime !== undefined) setMediaTime(data.currentTime);
        if (data.duration !== undefined) setMediaDuration(data.duration);
        if (data.title !== undefined) setMediaTitle(data.title);
      } else if (data.type === "preset") {
        if (data.preset !== undefined) {
          applyPreset(data.preset);
        }
      } else if (data.type === "calibrate") {
        triggerCalibrate();
      } else if (data.type === "toggle_hud") {
        setHideSidebar((prev) => !prev);
      } else if (data.type === "set_hud") {
        if (data.hidden !== undefined) {
          setHideSidebar(data.hidden);
        }
      }
    });

    const connectPeer = async () => {
      try {
        setConnectionState("connecting");
        connectionStateRef.current = "connecting";
        await provider.connect(signalingUrl, token, "mobile");
        setConnectionState("paired");
        connectionStateRef.current = "paired";
      } catch (err) {
        console.error("Signaling connection failed:", err);
        setConnectionState("failed");
        connectionStateRef.current = "failed";
      }
    };

    connectPeer();

    // Stats fetching loop
    const statsTimer = setInterval(async () => {
      if (streamingProviderRef.current) {
        const stats = await streamingProviderRef.current.getStats();
        setStreamingStats(stats);

        // ── Thermal stress detection (Battery API + latency heuristic) ──
        if (connectionStateRef.current === "connected" && stats) {
          const fps = stats.fps;
          const decLat = stats.decodeLatency || 0;

          // Dynamic Supersampling control loop
          if (autoSupersamplingRef.current) {
            if (fps >= 58 && decLat < 12) {
              setSupersampling((prev) => Math.min(1.8, parseFloat((prev + 0.1).toFixed(1))));
            } else if (fps < 48 || decLat > 16) {
              setSupersampling(1.0);
            }
          }

          // Real thermal warning: Battery API takes priority over latency heuristic
          const isBatteryThermal =
            batteryLevel !== null &&
            (
              (batteryLevel < 0.15 && batteryCharging) || // charging under heavy VR load
              batteryLevel < 0.05                          // critically low battery
            );

          const isLatencyThermal =
            batteryLevel === null && // only use latency heuristic when Battery API unavailable
            fps > 0 &&
            (decLat > 20 || fps < 40);

          if (isBatteryThermal || isLatencyThermal) {
            thermalTicksRef.current += 1;
            if (thermalTicksRef.current >= 5) {
              setThermalWarning(true);
              if (streamingProviderRef.current?.isControlChannelOpen()) {
                streamingProviderRef.current.sendControlMessage({
                  type: "thermal_stress",
                  level: isBatteryThermal ? "battery_critical" : "high",
                  batteryLevel: batteryLevel ?? undefined,
                });
              }
            }
          } else {
            thermalTicksRef.current = 0;
            setThermalWarning(false);
          }
        } else {
          thermalTicksRef.current = 0;
          setThermalWarning(false);
        }
      }
    }, 1000);

    return () => {
      clearInterval(statsTimer);
      if (streamingProviderRef.current) {
        streamingProviderRef.current.disconnect();
      }
      streamingProviderRef.current = null;
      setStream(null);
      setConnectionState("disconnected");
      connectionStateRef.current = "disconnected";
    };
  }, [token]);

  // Keep WebRTC Audio track alive in mobile Chrome
  useEffect(() => {
    if (stream && audioElRef.current) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioElRef.current.srcObject = new MediaStream([audioTracks[0]]);
        audioElRef.current.volume = 0.001; // low volume so spatial audio is the dominant sound source
        audioElRef.current.play().catch((err) => {
          console.warn("Autoplay block or delay on mobile Chrome audio element:", err);
        });
      }
    }
  }, [stream]);

  // Keyboard shortcut controller for repositioning monitor inside VR using laptop keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside configuration form fields
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") {
        return;
      }

      switch (e.key) {
        // Preset hotkeys (1 - 4)
        case "1":
          applyPreset("coding");
          break;
        case "2":
          applyPreset("movie");
          break;
        case "3":
          applyPreset("presentation");
          break;
        case "4":
          applyPreset("gaming");
          break;

        // Size / Scale adjustments ( - / + )
        case "-":
          setScale((s) => Math.max(0.4, s - 0.05));
          break;
        case "=":
        case "+":
          setScale((s) => Math.min(3.0, s + 0.05));
          break;

        // Distance adjustments ( [ / ] )
        case "[":
          setDistance((d) => Math.max(1.0, d - 0.1));
          break;
        case "]":
          setDistance((d) => Math.min(6.0, d + 0.1));
          break;

        // Height adjustments ( Up / Down arrow )
        case "ArrowUp":
          e.preventDefault();
          setHeightOffset((h) => Math.min(1.5, h + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          setHeightOffset((h) => Math.max(-1.5, h - 0.05));
          break;

        // Curvature / Bending radius adjustments ( Left / Right arrow )
        case "ArrowLeft":
          e.preventDefault();
          setCurvature((c) => {
            if (c <= 0) return 4.0;
            return Math.max(1.0, c - 0.1);
          });
          break;
        case "ArrowRight":
          e.preventDefault();
          setCurvature((c) => {
            if (c >= 5.0) return 0.0; // Flat screen
            if (c <= 0) return 0.0;
            return c + 0.1;
          });
          break;

        // Tilt adjustments ( ; / ' )
        case ";":
          setTilt((t) => Math.max(-30, t - 1));
          break;
        case "'":
          setTilt((t) => Math.min(30, t + 1));
          break;

        // Calibration / Centering hotkeys (Space and c)
        case " ":
        case "c":
          e.preventDefault();
          triggerCalibrate();
          break;

        // Calibration grid toggle
        case "g":
          setCalibrationMode((prev) => !prev);
          break;

        // Reading mode toggle
        case "r":
          setReadingMode((prev) => !prev);
          break;

        // Focus mode toggle
        case "f":
          setFocusMode((prev) => !prev);
          break;

        // Presentation mode toggle
        case "p":
          setPresentationMode((prev) => !prev);
          break;

        // Spatial Audio toggle
        case "s":
          setSpatialAudioEnabled((prev) => !prev);
          break;

        // Media Controls: Play/Pause (k)
        case "k":
          e.preventDefault();
          sendMediaAction(mediaPlaying ? "pause" : "play");
          break;

        // Media Controls: Seek Backward 10s (j)
        case "j":
          e.preventDefault();
          sendMediaAction("seek", Math.max(0, mediaTime - 10));
          break;

        // Media Controls: Seek Forward 10s (l)
        case "l":
          e.preventDefault();
          sendMediaAction("seek", Math.min(mediaDuration, mediaTime + 10));
          break;

        // Toggle Sidebar visibility hotkeys (h and Escape)
        case "h":
        case "Escape":
          e.preventDefault();
          setHideSidebar((prev) => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [token, mediaPlaying, mediaTime, mediaDuration]);



  const handleManualConnect = () => {
    if (!manualIp || !manualToken) {
      alert("Please fill in the host IP address and token.");
      return;
    }
    const cleanIp = manualIp.trim().replace(/^https?:\/\//i, "");
    const cleanToken = manualToken.trim();
    const cleanPort = manualPort.trim() || "8080";
    
    // Redirect to local page path preserving the HTTPS context (handles Vercel fallback)
    window.location.href = `/mobile/test-xr/?token=${cleanToken}&ip=${cleanIp}&port=${cleanPort}`;
  };

  /**
   * PIN pairing handler: sends the 6-digit PIN to the companion server.
   * On success, redirects to the current host with the returned session token.
   */
  const handlePinPairing = async () => {
    if (pinInput.trim().length !== 6 || !/^\d{6}$/.test(pinInput.trim())) {
      setPinPairingError("Please enter a valid 6-digit numeric PIN.");
      return;
    }

    setPinPairingLoading(true);
    setPinPairingError(null);

    try {
      let clientId = localStorage.getItem("vr_desk_client_id");
      if (!clientId) {
        clientId = crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem("vr_desk_client_id", clientId);
      }

      const res = await fetch("/api/pair_by_pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: pinInput.trim(),
          client_id: clientId,
          device_name: navigator.userAgent.substring(0, 60) || "Mobile VR Headset",
        }),
      });

      const data = await res.json();
      if (data.success && data.token) {
        // Paired successfully — store trust and redirect with token
        console.log("PIN pairing successful. Token:", data.token);
        const redirectUrl = `${window.location.pathname}?token=${data.token}`;
        window.location.href = redirectUrl;
      } else {
        setPinPairingError(data.reason || "PIN pairing failed. Please try again.");
      }
    } catch (err) {
      console.error("PIN pairing request failed:", err);
      setPinPairingError("Could not reach companion server. Check your Wi-Fi connection.");
    } finally {
      setPinPairingLoading(false);
    }
  };



  const handleEnterVR = async () => {
    if (!navigator.xr || !glRef.current) {
      alert("WebXR is not supported or renderer is not initialized.");
      return;
    }

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"],
      });

      session.addEventListener("end", () => {
        setInXR(false);
      });

      await glRef.current.xr.setSession(session);
      setInXR(true);
    } catch (err) {
      console.error("Error starting XR session:", err);
      alert(`Failed to enter VR: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case "connected":
        return "text-emerald-400 border-emerald-900 bg-emerald-950/20";
      case "connecting":
      case "checking":
        return "text-amber-400 border-amber-900 bg-amber-950/20";
      case "paired":
        return "text-blue-400 border-blue-900 bg-blue-950/20";
      case "demo_sandbox":
        return "text-indigo-400 border-indigo-900 bg-indigo-950/20";
      case "disconnected":
      case "failed":
        return "text-red-400 border-red-900 bg-red-950/20";
      default:
        return "text-zinc-400 border-zinc-800 bg-zinc-900/50";
    }
  };

  const getStatusText = () => {
    if (connectionState === "demo_sandbox") return "DEMO SANDBOX";
    return connectionState.toUpperCase();
  };

  // If no pairing token is found, display the configuration dashboard
  if (!token) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-950 border border-blue-900 text-blue-400 text-[10px] font-mono">
              VR DESKTOP CLIENT
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white mt-2">Pairing Configuration</h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Scan the QR code displayed on your PC Companion App to pair, or enter your local desktop stream details below.
            </p>
          </div>

          <hr className="border-zinc-800" />

          {/* Manual Input Form */}
          <div className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              Manual Connection
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase block font-mono mb-1">Companion PC IP</label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.0.105"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-[10px] text-zinc-500 uppercase block font-mono mb-1">Port</label>
                  <input
                    type="text"
                    placeholder="8080"
                    value={manualPort}
                    onChange={(e) => setManualPort(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-blue-500 transition"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 uppercase block font-mono mb-1">Pairing Token</label>
                  <input
                    type="text"
                    placeholder="Token string"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <button
                onClick={handleManualConnect}
                className="w-full py-2.5 mt-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold rounded shadow transition active:scale-[0.98]"
              >
                Connect to Host
              </button>
            </div>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="grow border-t border-zinc-800"></div>
            <span className="shrink mx-4 text-zinc-600 text-[10px] uppercase font-mono">Or pair via PIN</span>
            <div className="grow border-t border-zinc-800"></div>
          </div>

          {/* PIN Pairing Section */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              6-Digit Companion PIN
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Open the VR-Desk companion app on your PC and enter the 6-digit PIN shown in the Security panel.
            </p>
            <div className="flex gap-2">
              <input
                id="pin-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={pinInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPinInput(v);
                  if (pinPairingError) setPinPairingError(null);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePinPairing(); }}
                className="flex-1 px-3 py-2 text-center text-lg font-mono tracking-[0.5em] bg-zinc-950 border border-zinc-700 rounded text-zinc-100 outline-none focus:border-emerald-500 transition"
              />
              <button
                id="pin-pair-btn"
                onClick={handlePinPairing}
                disabled={pinPairingLoading || pinInput.length < 6}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded shadow transition active:scale-[0.98]"
              >
                {pinPairingLoading ? "Pairing…" : "Pair"}
              </button>
            </div>
            {pinPairingError && (
              <div className="text-[10px] text-red-400 font-mono bg-red-950/20 border border-red-900/40 rounded px-3 py-1.5">
                {pinPairingError}
              </div>
            )}
          </div>

          <div className="relative flex py-2 items-center">
            <div className="grow border-t border-zinc-800"></div>
            <span className="shrink mx-4 text-zinc-600 text-[10px] uppercase font-mono">Or</span>
            <div className="grow border-t border-zinc-800"></div>
          </div>

          <button
            onClick={() => setToken("demo")}
            className="w-full py-2.5 bg-zinc-850 hover:bg-zinc-800 active:bg-zinc-900 text-zinc-300 text-xs font-semibold rounded border border-zinc-800 transition active:scale-[0.98]"
          >
            Launch Demo Sandbox (Offline Mode)
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden relative">
      {/* Hidden audio element to keep the WebRTC audio track active on mobile Chrome */}
      <audio ref={audioElRef} className="hidden" playsInline />

      {/* Self-Signed TLS Certificate Trust Helper Card */}
      {connectionState !== "connected" && connectionState !== "demo_sandbox" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-955/98 p-6 text-center font-sans space-y-6">
          <div className="w-full max-w-sm p-8 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl space-y-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-950 border border-blue-900 text-blue-400 text-[10px] font-mono uppercase">
              WebRTC Signaling Status
            </div>
            
            <h2 className="text-lg font-bold text-white tracking-tight">
              {connectionState === "connecting" ? "Connecting to PC..." : "Connection Pending"}
            </h2>
            
            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              Attempting to connect to your local PC companion stream at:
              <span className="block mt-1.5 font-mono text-[9px] text-zinc-300 bg-zinc-950 p-2 rounded border border-zinc-850 truncate">
                {customIp && customPort ? `wss://${customIp}:${customPort}/ws/signaling` : `wss://${window.location.host}/ws/signaling`}
              </span>
            </p>

            {customIp && customPort && (
              <div className="p-3.5 bg-zinc-950 border border-zinc-850 rounded text-left space-y-2.5">
                <div className="text-[10px] uppercase font-mono font-semibold text-zinc-400">
                  Local HTTPS Authorization
                </div>
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Your PC companion server generates a secure, self-signed local TLS certificate. To allow your mobile browser to stream video data securely, you must authorize it:
                </p>
                <a
                  href={`https://${customIp}:${customPort}/ping`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold font-sans rounded transition shadow cursor-pointer select-none active:scale-[0.98]"
                >
                  Unlock Stream Certificate
                </a>
                <span className="block text-[8px] text-zinc-650 text-center leading-normal">
                  (Click &quot;Advanced&quot; {`->`} &quot;Proceed anyway&quot;. You will see &quot;pong&quot;. Then close that tab and return here!)
                </span>
              </div>
            )}
            
            <div className="flex justify-center items-center gap-2 text-[10px] font-mono text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              STATUS: {connectionState.toUpperCase()}
            </div>
          </div>
        </div>
      )}

      {/* Symmetrical split stereoscopic HUD caution warning panel for passive VR Box */}
      {thermalWarning && (
        <div className="fixed inset-x-0 top-16 z-50 pointer-events-none flex w-screen">
          {/* Left eye warning */}
          <div className="w-1/2 flex justify-center px-4">
            <div className="bg-red-950/90 border border-red-500/50 text-red-200 px-4 py-2 rounded-md shadow-lg backdrop-blur text-center max-w-[280px]">
              <div className="text-xs font-bold font-mono tracking-wider animate-pulse flex items-center justify-center gap-1.5">
                <span>[WARNING]</span> THERMAL OVERHEAT WARNING
              </div>
              <div className="text-[9px] text-red-300 mt-1 font-sans">
                Device temperature high. Lowering stream quality to cool down.
              </div>
            </div>
          </div>
          {/* Right eye warning */}
          <div className="w-1/2 flex justify-center px-4">
            <div className="bg-red-950/90 border border-red-500/50 text-red-200 px-4 py-2 rounded-md shadow-lg backdrop-blur text-center max-w-[280px]">
              <div className="text-xs font-bold font-mono tracking-wider animate-pulse flex items-center justify-center gap-1.5">
                <span>[WARNING]</span> THERMAL OVERHEAT WARNING
              </div>
              <div className="text-[9px] text-red-300 mt-1 font-sans">
                Device temperature high. Lowering stream quality to cool down.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main R3F Canvas Area (Fixed inset-0 so it always occupies exactly full viewport centering) */}
      <div className="fixed inset-0 w-screen h-screen z-0">
        <VRScene
          sharpenStrength={sharpenStrength}
          environmentMode={environmentMode}
          glRef={glRef}
          videoStream={stream}
          scale={scale}
          distance={distance}
          heightOffset={heightOffset}
          tilt={tilt}
          curvature={curvature}
          stereoMode={true} // FORCE TRUE ON MOBILE FOR PASSIVE VR BOX
          gyroEnabled={gyroEnabled}
          calibrateTrigger={calibrateTrigger}
          ipd={ipd}
          distortion={distortion}
          calibrationMode={calibrationMode}
          readingMode={readingMode}
          focusMode={focusMode}
          presentationMode={presentationMode}
          spatialAudioEnabled={spatialAudioEnabled}
          supersampling={supersampling}
          antiScreenDoor={antiScreenDoor}
          hdrEnabled={hdrEnabled}
          exposure={exposure}
        />
        
        {/* Floating Toggle Button to restore sidebar if hidden */}
        {hideSidebar && (
          <button
            onClick={() => setHideSidebar(false)}
            className="absolute bottom-4 left-4 z-20 px-3 py-2 bg-zinc-900/80 border border-zinc-800 text-zinc-300 text-xs font-mono rounded hover:bg-zinc-800 transition"
          >
            Show Console [H]
          </button>
        )}
      </div>

      {/* Control Panel Sidebar (Floating overlay drawer on top of R3F Canvas, z-50) */}
      {!hideSidebar && (
        <div className="fixed left-0 top-0 bottom-0 z-50 w-80 p-6 bg-zinc-900/90 backdrop-blur-md border-r border-zinc-800 flex flex-col justify-between overflow-y-auto shadow-2xl">
          <div className="space-y-5">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">VR Monitor Console</h1>
              <p className="text-xs text-zinc-400 mt-1">
                Position and configure your virtual curved monitors. Hotkeys work live inside VR.
              </p>
            </div>

            {/* Connection Status indicator */}
            <div className={`p-2.5 border rounded text-xs font-mono flex items-center justify-between ${getStatusColor()}`}>
              <span>STATUS:</span>
              <span className="font-bold">{getStatusText()}</span>
            </div>

            <hr className="border-zinc-800" />

            {/* Stereo Status */}
            <div className="space-y-3">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Headset Integration</div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Stereo Split Screen</span>
                <div className="px-2.5 py-1 text-[10px] font-bold font-mono rounded border bg-emerald-950 border-emerald-800 text-emerald-400 cursor-not-allowed select-none">
                  FORCED ON
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Gyro Head Tracking</span>
                <button
                  onClick={() => setGyroEnabled((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    gyroEnabled
                      ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {gyroEnabled ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              {gyroEnabled && (
                <button
                  onClick={triggerCalibrate}
                  className="w-full py-2 bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold rounded border border-blue-700 transition active:scale-[0.98]"
                >
                  Calibrate Center [Space]
                </button>
              )}
            </div>

            <hr className="border-zinc-800" />

            {/* Spatial Audio & Media Player Status */}
            <div className="space-y-4">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Spatial Audio & Media</div>
              
              {/* Spatial Audio Toggle */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Spatial Audio [S]</span>
                <button
                  onClick={() => setSpatialAudioEnabled((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    spatialAudioEnabled
                      ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {spatialAudioEnabled ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              {/* Streaming Media Info */}
              {mediaTitle && (
                <div className="p-2.5 bg-zinc-950 border border-zinc-850 rounded text-[11px] space-y-1.5 font-mono">
                  <div className="text-zinc-400 truncate"><span className="text-zinc-600">Playing:</span> {mediaTitle}</div>
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>{formatTime(mediaTime)} / {formatTime(mediaDuration)}</span>
                    <span>{mediaPlaying ? "PLAYING" : "PAUSED"}</span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full h-1 bg-zinc-850 rounded overflow-hidden">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ width: `${(mediaTime / (mediaDuration || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <hr className="border-zinc-800" />

            {/* Lens and Spacing */}
            <div className="space-y-4">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Lens & IPD Calibration</div>
              
              {/* Headset Profile Select */}
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase block font-mono mb-1">Headset Profile</label>
                <select
                  value={headsetPreset}
                  onChange={(e) => applyHeadsetPreset(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-850 rounded text-zinc-200 outline-none focus:border-blue-500 hover:bg-zinc-900 transition"
                >
                  <option value="custom">Custom Calibrated</option>
                  <option value="cardboard_v1">Google Cardboard V1</option>
                  <option value="cardboard_v2">Google Cardboard V2</option>
                  <option value="gear_vr">Samsung GearVR</option>
                  <option value="daydream">Daydream View</option>
                </select>
              </div>

              {/* Calibration Grid Toggle */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Calibration Grid [G]</span>
                <button
                  onClick={() => setCalibrationMode((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    calibrationMode
                      ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {calibrationMode ? "ON" : "OFF"}
                </button>
              </div>

              {/* IPD Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">IPD Spacing</span>
                  <span className="font-mono text-zinc-300">{Math.round(ipd * 1000)}mm</span>
                </div>
                <input
                  type="range"
                  min="0.050"
                  max="0.075"
                  step="0.001"
                  value={ipd}
                  onChange={(e) => {
                    setIpd(parseFloat(e.target.value));
                    setHeadsetPreset("custom");
                  }}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Distortion Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Lens Distortion</span>
                  <span className="font-mono text-zinc-300">{distortion.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.3"
                  step="0.01"
                  value={distortion}
                  onChange={(e) => {
                    setDistortion(parseFloat(e.target.value));
                    setHeadsetPreset("custom");
                  }}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>

            <hr className="border-zinc-800" />

            {/* Visual Enhancement Suite */}
            <div className="space-y-4">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Visual Enhancement Suite</div>

              {/* Anti Screen Door */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">SDE Grid Diffusion</span>
                <button
                  onClick={() => setAntiScreenDoor((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    antiScreenDoor
                      ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {antiScreenDoor ? "ON" : "OFF"}
                </button>
              </div>

              {/* HDR Simulation */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">HDR Simulation</span>
                <button
                  onClick={() => setHdrEnabled((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    hdrEnabled
                      ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {hdrEnabled ? "ON" : "OFF"}
                </button>
              </div>

              {/* HDR Exposure */}
              {hdrEnabled && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">HDR Exposure</span>
                    <span className="font-mono text-zinc-300">{exposure.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.1"
                    value={exposure}
                    onChange={(e) => setExposure(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              )}

              {/* Dynamic Supersampling */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Dynamic Supersampling</span>
                <button
                  onClick={() => setAutoSupersampling((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    autoSupersampling
                      ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {autoSupersampling ? "AUTO" : "MANUAL"}
                </button>
              </div>

              {/* Supersampling Scale */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Supersampling Factor</span>
                  <span className="font-mono text-zinc-300">{supersampling.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="1.8"
                  step="0.1"
                  value={supersampling}
                  disabled={autoSupersampling}
                  onChange={(e) => setSupersampling(parseFloat(e.target.value))}
                  className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                    autoSupersampling ? "opacity-50 cursor-not-allowed bg-zinc-900" : "bg-zinc-800"
                  }`}
                />
              </div>
            </div>

            <hr className="border-zinc-800" />

            {/* Productivity Modes */}
            <div className="space-y-3">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Productivity Modes</div>

              {/* Reading Mode Toggle */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Reading Mode [R]</span>
                <button
                  onClick={() => setReadingMode((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    readingMode
                      ? "bg-blue-950 border-blue-800 text-blue-400 font-bold"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {readingMode ? "ON" : "OFF"}
                </button>
              </div>

              {/* Focus Mode Toggle */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Focus Mode [F]</span>
                <button
                  onClick={() => setFocusMode((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    focusMode
                      ? "bg-blue-950 border-blue-800 text-blue-400 font-bold"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {focusMode ? "ON" : "OFF"}
                </button>
              </div>

              {/* Presentation Mode Toggle */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Presentation [P]</span>
                <button
                  onClick={() => setPresentationMode((prev) => !prev)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded border transition ${
                    presentationMode
                      ? "bg-blue-950 border-blue-800 text-blue-400 font-bold"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {presentationMode ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <hr className="border-zinc-800" />

            {/* Monitor Geometry Controls */}
            <div className="space-y-4">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Monitor Transform</div>
              
              {/* Size */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Scale Size</span>
                  <span className="font-mono text-zinc-300">{scale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="3.0"
                  step="0.05"
                  value={scale}
                  onChange={(e) => {
                    setScale(parseFloat(e.target.value));
                    setHeadsetPreset("custom");
                  }}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Distance */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Focal Distance</span>
                  <span className="font-mono text-zinc-300">{distance.toFixed(1)}m</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="6.0"
                  step="0.1"
                  value={distance}
                  onChange={(e) => setDistance(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Curvature */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Curved Bending</span>
                  <span className="font-mono text-zinc-300">{curvature > 0 ? `${curvature.toFixed(1)}m radius` : "Flat"}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="5.0"
                  step="0.1"
                  value={curvature}
                  onChange={(e) => setCurvature(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* HeightOffset */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Raise / Lower</span>
                  <span className="font-mono text-zinc-300">{heightOffset > 0 ? `+${heightOffset.toFixed(2)}m` : `${heightOffset.toFixed(2)}m`}</span>
                </div>
                <input
                  type="range"
                  min="-1.5"
                  max="1.5"
                  step="0.05"
                  value={heightOffset}
                  onChange={(e) => setHeightOffset(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Tilt */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Tilt Angle</span>
                  <span className="font-mono text-zinc-300">{tilt}°</span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="30"
                  step="1"
                  value={tilt}
                  onChange={(e) => setTilt(parseInt(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>

            <hr className="border-zinc-800" />

            {/* Quick Presets */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Workspace Presets</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "coding", label: "Coding [1]" },
                  { id: "movie", label: "Cinema [2]" },
                  { id: "presentation", label: "Board [3]" },
                  { id: "gaming", label: "Gaming [4]" },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id as "coding" | "movie" | "presentation" | "gaming")}
                    className="px-3 py-2 text-left text-xs bg-zinc-950 border border-zinc-850 hover:bg-zinc-850 text-zinc-300 rounded font-medium transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sharpening & Environment */}
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">CAS Sharpening</span>
                  <span className="font-mono text-zinc-300">{(sharpenStrength * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={sharpenStrength}
                  onChange={(e) => setSharpenStrength(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block font-mono">Environment Room</label>
                <select
                  value={environmentMode}
                  onChange={(e) => setEnvironmentMode(e.target.value as "void" | "workspace" | "space" | "cinema")}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-850 rounded text-zinc-200 outline-none focus:border-blue-500 hover:bg-zinc-900 transition"
                >
                  <option value="workspace">Workspace Room</option>
                  <option value="cinema">Dark Cinema Theater</option>
                  <option value="space">Space Field</option>
                  <option value="void">Void (Pure Black)</option>
                </select>
              </div>
            </div>

            {/* Live WebRTC stats panel */}
            {streamingStats && connectionState === "connected" && (
              <div className="space-y-2 p-3 bg-zinc-950/80 border border-zinc-850 rounded-md">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block font-mono">WebRTC Link Telemetry</label>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[11px] font-mono text-zinc-400">
                  <div>FPS: <span className="text-white font-bold">{streamingStats.fps}</span></div>
                  <div>Bitrate: <span className="text-white font-bold">{(streamingStats.bitrate / 1_000_000).toFixed(2)}M</span></div>
                  <div>RTT: <span className="text-white font-bold">{streamingStats.rtt.toFixed(0)}ms</span></div>
                  <div>Loss: <span className="text-white font-bold">{streamingStats.packetLoss.toFixed(1)}%</span></div>
                  <div className="col-span-2">Decode Latency: <span className="text-white font-bold">{streamingStats.decodeLatency ? `${streamingStats.decodeLatency.toFixed(1)}ms` : "0.0ms"}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Action Button & XR Status */}
          <div className="mt-8 space-y-4">
            {xrSupported === false ? (
              <div className="p-3 bg-red-950/30 border border-red-900/50 rounded text-red-400 text-xs font-mono">
                [WARNING] WebXR is not supported on this device/browser. Using SBS fallback mode.
              </div>
            ) : xrSupported === true ? (
              <button
                onClick={handleEnterVR}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm rounded shadow-lg transition active:scale-[0.98]"
              >
                {inXR ? "In WebXR Session" : "Enter WebXR Mode"}
              </button>
            ) : (
              <div className="py-3 text-center text-zinc-500 text-xs">Checking WebXR support...</div>
            )}

            <button
              onClick={() => setHideSidebar(true)}
              className="w-full py-2 bg-zinc-950 hover:bg-zinc-850 text-zinc-300 text-xs font-mono rounded border border-zinc-850 transition active:scale-[0.98]"
            >
              Hide Sidebar [H]
            </button>

            {/* Laptop keyboard shortcuts HUD */}
            <div className="p-3 bg-zinc-950 border border-zinc-855 rounded text-[9px] font-mono text-zinc-400 space-y-1 leading-relaxed">
              <div className="text-zinc-500 uppercase font-bold text-[8px] mb-1">Laptop Keyboard Hotkeys</div>
              <div className="grid grid-cols-2 gap-x-1">
                <div>Size: <span className="text-zinc-200 font-bold">- / +</span></div>
                <div>Presets: <span className="text-zinc-200 font-bold">1 - 4</span></div>
                <div>Distance: <span className="text-zinc-200 font-bold">[ / ]</span></div>
                <div>Tilt: <span className="text-zinc-200 font-bold">; / &apos;</span></div>
                <div>Calibrate: <span className="text-zinc-200 font-bold">Space</span></div>
                <div>Hide HUD: <span className="text-zinc-200 font-bold">H</span></div>
                <div className="col-span-2">Height: <span className="text-zinc-200 font-bold">Arrow Up / Down</span></div>
                <div className="col-span-2">Bending: <span className="text-zinc-200 font-bold">Arrow Left / Right</span></div>
                <div>Grid: <span className="text-zinc-200 font-bold">G</span></div>
                <div>Reading: <span className="text-zinc-200 font-bold">R</span></div>
                <div>Focus: <span className="text-zinc-200 font-bold">F</span></div>
                <div>Present: <span className="text-zinc-200 font-bold">P</span></div>
                <div>Spatial Aud: <span className="text-zinc-200 font-bold">S</span></div>
                <div>Media P/P: <span className="text-zinc-200 font-bold">K</span></div>
                <div>Seek Back: <span className="text-zinc-200 font-bold">J</span></div>
                <div>Seek Fwd: <span className="text-zinc-200 font-bold">L</span></div>
              </div>
            </div>

            {/* Hardware Specs Panel */}
            {screenSpecs && (
              <div className="p-3 bg-zinc-950/50 border border-zinc-850 rounded text-[9px] font-mono text-zinc-400 space-y-1">
                <div className="text-zinc-500 uppercase font-bold text-[8px]">Device Specs</div>
                <div>Viewport: {screenSpecs.width}x{screenSpecs.height} (DPR {screenSpecs.dpr})</div>
                <div>Codecs: {supportedCodecs.length > 0 ? supportedCodecs.join(", ") : "None detected"}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
