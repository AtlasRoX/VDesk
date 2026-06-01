/**
 * Core provider abstractions for Screen Capture and WebRTC Streaming.
 * Future-proofs transition from Webview-based capture to Rust-native capture (WGC/DXGI).
 */

export interface CaptureProvider {
  initialize(): Promise<void>;
  startCapture(profile?: "performance" | "balanced" | "quality" | "ultra"): Promise<void>;
  stopCapture(): Promise<void>;
  getVideoTrack(): MediaStreamTrack | null;
  getAudioTrack(): MediaStreamTrack | null;
  getCapabilities(): MediaTrackCapabilities | null;
  applyResolutionProfile(profile: "performance" | "balanced" | "quality" | "ultra"): Promise<void>;
}

export interface StreamingStats {
  fps: number;
  bitrate: number; // bps
  packetLoss: number; // percentage
  rtt: number; // ms
  encodeLatency?: number; // ms
  decodeLatency?: number; // ms
}

export interface ControlMessage {
  type: string;
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
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  title?: string;
  preset?: string;
  hidden?: boolean;
  action?: string;
  value?: unknown;
  level?: string;
  batteryLevel?: number;
}

export interface SignalingMessage {
  type: string;
  event?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}


export interface StreamingProvider {
  connect(signalingUrl: string, token: string, role: "desktop" | "mobile"): Promise<void>;
  disconnect(): Promise<void>;
  sendVideo(track: MediaStreamTrack): Promise<void>;
  sendAudio(track: MediaStreamTrack): Promise<void>;
  getStats(): Promise<StreamingStats>;
  onConnectionStateChange(callback: (state: string) => void): void;
}

/**
 * Webview-based screen capture using browser standard getDisplayMedia API.
 */
export class WebviewCaptureProvider implements CaptureProvider {
  private stream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private audioTrack: MediaStreamTrack | null = null;

  async initialize(): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("CaptureProvider must be initialized in a browser context.");
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error(
        "Screen capture APIs are not supported. Make sure this app is running in a Secure Context (HTTPS or localhost)."
      );
    }
  }

  async startCapture(profile: "performance" | "balanced" | "quality" | "ultra" = "balanced"): Promise<void> {
    try {
      const constraints = this.getProfileConstraints(profile);
      
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          frameRate: { ideal: constraints.frameRate },
          width: { ideal: constraints.width },
          height: { ideal: constraints.height },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.videoTrack = this.stream.getVideoTracks()[0] || null;
      this.audioTrack = this.stream.getAudioTracks()[0] || null;
      
      // CRITICAL FOR TEXT CLARITY: Apply text content hint to optimize encoder compression
      if (this.videoTrack && "contentHint" in this.videoTrack) {
        (this.videoTrack as MediaStreamTrack & { contentHint?: string }).contentHint = "text";
      }
    } catch (err) {
      console.error("WebviewCaptureProvider failed to start screen capture:", err);
      throw err;
    }
  }

  async stopCapture(): Promise<void> {
    if (this.videoTrack) {
      this.videoTrack.stop();
      this.videoTrack = null;
    }
    if (this.audioTrack) {
      this.audioTrack.stop();
      this.audioTrack = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  getVideoTrack(): MediaStreamTrack | null {
    return this.videoTrack;
  }

  getAudioTrack(): MediaStreamTrack | null {
    return this.audioTrack;
  }

  getCapabilities(): MediaTrackCapabilities | null {
    return this.videoTrack && typeof this.videoTrack.getCapabilities === "function"
      ? this.videoTrack.getCapabilities()
      : null;
  }

  async applyResolutionProfile(profile: "performance" | "balanced" | "quality" | "ultra"): Promise<void> {
    if (!this.videoTrack) return;
    
    const constraints = this.getProfileConstraints(profile);
    
    try {
      await this.videoTrack.applyConstraints({
        width: { ideal: constraints.width },
        height: { ideal: constraints.height },
        frameRate: { ideal: constraints.frameRate }
      });
      console.log(`Swapped resolution profile to ${profile} (${constraints.width}x${constraints.height} @ ${constraints.frameRate}fps)`);
    } catch (err) {
      console.error(`Failed to apply constraints for profile ${profile}:`, err);
    }
  }

  private getProfileConstraints(profile: "performance" | "balanced" | "quality" | "ultra") {
    switch (profile) {
      case "performance":
        return { width: 1280, height: 720, frameRate: 60 };
      case "balanced":
        return { width: 1920, height: 1080, frameRate: 60 };
      case "quality":
        return { width: 2560, height: 1440, frameRate: 60 };
      case "ultra":
        return { width: 3840, height: 2160, frameRate: 60 }; // 4K target
    }
  }
}

/**
 * WebRTC Streaming Provider implementing signaling relay, PeerConnection wrapper, and Adaptive Quality Control.
 */
export class WebRTCStreamingProvider implements StreamingProvider {
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private role: "desktop" | "mobile" = "desktop";
  private token: string = "";
  private connectionStateCallback: ((state: string) => void) | null = null;
  public onTrackReceived?: (stream: MediaStream) => void;

  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private latestStats: StreamingStats = { fps: 0, bitrate: 0, packetLoss: 0, rtt: 0 };
  private bytesPrev: number = 0;
  private constPrevTime: number = 0;
  private framesEncodedPrev: number = 0;
  private totalEncodeTimePrev: number = 0;
  private framesDecodedPrev: number = 0;
  private totalDecodeTimePrev: number = 0;

  // Adaptive Quality Parameters
  private profileCeilingBitrate: number = 15_000_000; // default 15 Mbps
  private activeMaxBitrate: number = 15_000_000;
  private clearNetworkChecks: number = 0;

  // WebRTC Control DataChannel elements
  private controlChannel: RTCDataChannel | null = null;
  private controlMessageCallback: ((msg: ControlMessage) => void) | null = null;

  // Local Only Mode (USB mode, bypasses STUN/internet gathering)
  private localOnly: boolean = false;

  setLocalOnly(localOnly: boolean): void {
    this.localOnly = localOnly;
    console.log(`WebRTC streaming local-only mode configured: ${localOnly}`);
  }

  onConnectionStateChange(callback: (state: string) => void): void {
    this.connectionStateCallback = callback;
  }

  sendControlMessage(msg: ControlMessage): boolean {
    if (this.controlChannel && this.controlChannel.readyState === "open") {
      try {
        this.controlChannel.send(JSON.stringify(msg));
        return true;
      } catch (err) {
        console.error("Error sending control message:", err);
        return false;
      }
    }
    return false;
  }

  onControlMessageReceived(callback: (msg: ControlMessage) => void): void {
    this.controlMessageCallback = callback;
  }

  isControlChannelOpen(): boolean {
    return this.controlChannel !== null && this.controlChannel.readyState === "open";
  }


  /**
   * Configure the target profile bitrate ceiling
   */
  setProfileCeiling(profile: "performance" | "balanced" | "quality" | "ultra") {
    switch (profile) {
      case "performance":
        this.profileCeilingBitrate = 4_000_000; // 4 Mbps
        break;
      case "balanced":
        this.profileCeilingBitrate = 8_000_000; // 8 Mbps
        break;
      case "quality":
        this.profileCeilingBitrate = 16_000_000; // 16 Mbps
        break;
      case "ultra":
        this.profileCeilingBitrate = 25_000_000; // 25 Mbps
        break;
    }
    this.activeMaxBitrate = this.profileCeilingBitrate;
    this.applyBitrateParameters();
  }

  async connect(signalingUrl: string, token: string, role: "desktop" | "mobile"): Promise<void> {
    this.role = role;
    this.token = token;

    // Connect to WebSocket signaling server
    const wsUrl = `${signalingUrl}?token=${token}&role=${role}`;
    this.ws = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error("WebSocket not created."));

      this.ws.onopen = () => {
        console.log(`Connected to signaling server as ${role}`);
        this.setupPeerConnection();
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error("Signaling WebSocket error:", err);
        reject(err);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          await this.handleSignalingMessage(msg);
        } catch (e) {
          console.error("Failed to parse signaling message:", e);
        }
      };

      this.ws.onclose = () => {
        console.log("Signaling WebSocket closed.");
        if (this.connectionStateCallback) {
          this.connectionStateCallback("disconnected");
        }
      };
    });
  }

  private setupPeerConnection() {
    const iceServers = this.localOnly ? [] : [
      { urls: "stun:stun.l.google.com:19302" }
    ];
    this.pc = new RTCPeerConnection({
      iceServers
    });

    // If desktop, create data channel for screen controls
    if (this.role === "desktop") {
      this.controlChannel = this.pc.createDataChannel("control", { negotiated: false });
      this.setupDataChannel(this.controlChannel);
    } else {
      // If mobile, listen for data channel creation
      this.pc.ondatachannel = (event) => {
        if (event.channel.label === "control") {
          this.controlChannel = event.channel;
          this.setupDataChannel(this.controlChannel);
        }
      };
    }

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc && this.connectionStateCallback) {
        this.connectionStateCallback(this.pc.connectionState);
      }
    };

    if (this.role === "mobile") {
      this.pc.ontrack = (event) => {
        console.log("Track received:", event.streams[0]);
        if (this.onTrackReceived && event.streams[0]) {
          this.onTrackReceived(event.streams[0]);
        }
      };
    }

    this.constPrevTime = Date.now();
    this.startStatsLoop();
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log(`WebRTC DataChannel (${channel.label}) opened.`);
    };
    channel.onclose = () => {
      console.log(`WebRTC DataChannel (${channel.label}) closed.`);
    };
    channel.onerror = (err) => {
      console.error(`WebRTC DataChannel (${channel.label}) error:`, err);
    };
    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (this.controlMessageCallback) {
          this.controlMessageCallback(msg);
        }
      } catch (err) {
        console.error("Failed to parse DataChannel message:", err);
      }
    };
  }


  private async handleSignalingMessage(msg: SignalingMessage) {
    if (!this.pc) return;

    if (msg.type === "system") {
      if (msg.event === "paired") {
        console.log("Peers paired via signaling server.");
        if (this.role === "desktop") {
          // Desktop initiates WebRTC offer when mobile connects
          await this.initiateOffer();
        }
      }
    } else if (msg.type === "offer" && this.role === "mobile") {
      // Mobile receives offer from desktop
      await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: msg.sdp }));
      const answer = await this.pc.createAnswer();
      
      // SDP Bitrate Optimization: Force higher bitrate in the local SDP before setting it
      const optimizedSdp = this.optimizeSdpBitrate(answer.sdp || "");
      await this.pc.setLocalDescription(new RTCSessionDescription({ type: "answer", sdp: optimizedSdp }));
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "answer", sdp: optimizedSdp }));
      }
    } else if (msg.type === "answer" && this.role === "desktop") {
      // Desktop receives answer from mobile
      await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.sdp }));
    } else if (msg.type === "candidate") {
      // Add ICE candidate
      try {
        if (msg.candidate) {
          await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
      } catch (e) {
        console.warn("Error adding ICE candidate:", e);
      }
    }
  }

  private async initiateOffer() {
    if (!this.pc) return;
    const offer = await this.pc.createOffer();
    
    // SDP Bitrate Optimization: Request higher bitrate in local SDP offer
    const optimizedSdp = this.optimizeSdpBitrate(offer.sdp || "");
    await this.pc.setLocalDescription(new RTCSessionDescription({ type: "offer", sdp: optimizedSdp }));
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "offer", sdp: optimizedSdp }));
    }
  }

  /**
   * Modifies the SDP string to inject H.264 high-bitrate parameters.
   */
  private optimizeSdpBitrate(sdp: string): string {
    const targetBitrateKhz = this.profileCeilingBitrate / 1000;
    
    const lines = sdp.split("\r\n");
    let videoIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("m=video")) {
        videoIndex = i;
        break;
      }
    }
    
    if (videoIndex === -1) return sdp;
    
    // Insert b=AS lines directly after m=video line to request high-bandwidth channel
    lines.splice(videoIndex + 1, 0, `b=AS:${targetBitrateKhz}`, `b=TIAS:${targetBitrateKhz * 1000}`);
    
    return lines.join("\r\n");
  }

  async sendVideo(track: MediaStreamTrack): Promise<void> {
    if (!this.pc) throw new Error("PeerConnection not initialized.");
    
    // Enforce text content hint for readability
    if ("contentHint" in track) {
      (track as MediaStreamTrack & { contentHint?: string }).contentHint = "text";
    }

    const senders = this.pc.getSenders();
    const existingVideo = senders.find((s) => s.track && s.track.kind === "video");
    if (existingVideo) {
      // Swaps the video track dynamically without reconnecting or SDP renegotiation!
      await existingVideo.replaceTrack(track);
      console.log("WebRTC video track hot-swapped successfully.");
      // Re-apply current adaptive bitrate caps
      this.applyBitrateParameters();
    } else {
      this.pc.addTrack(track, new MediaStream([track]));
    }
  }

  async sendAudio(track: MediaStreamTrack): Promise<void> {
    if (!this.pc) throw new Error("PeerConnection not initialized.");
    const senders = this.pc.getSenders();
    const existingAudio = senders.find((s) => s.track && s.track.kind === "audio");
    if (existingAudio) {
      await existingAudio.replaceTrack(track);
    } else {
      this.pc.addTrack(track, new MediaStream([track]));
    }
  }

  /**
   * Applies the activeMaxBitrate limit directly to the RTCRtpSender encodings
   */
  private async applyBitrateParameters() {
    if (!this.pc) return;
    try {
      const sender = this.pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) {
        const params = sender.getParameters();
        if (!params.encodings) {
          params.encodings = [{}];
        }
        if (params.encodings[0]) {
          params.encodings[0].maxBitrate = this.activeMaxBitrate;
          await sender.setParameters(params);
        }
      }
    } catch (err) {
      console.warn("Failed to apply dynamic WebRTC encoding bitrate:", err);
    }
  }

  private startStatsLoop() {
    this.statsInterval = setInterval(async () => {
      if (!this.pc) return;
      
      try {
        const stats = await this.pc.getStats();
        let fps = 60;
        let bytesNow = 0;
        let packetLoss = 0;
        let rtt = 10; // ms
        let encodeLatency = this.latestStats.encodeLatency || 0;
        let decodeLatency = this.latestStats.decodeLatency || 0;

        stats.forEach((report) => {
          if (report.type === "outbound-rtp" && report.kind === "video") {
            fps = report.framesPerSecond || fps;
            bytesNow = report.bytesSent || bytesNow;
            
            // Calculate encode latency
            const framesEncoded = report.framesEncoded || 0;
            const totalEncodeTime = report.totalEncodeTime || 0;
            if (this.framesEncodedPrev > 0 && framesEncoded > this.framesEncodedPrev) {
              const deltaFrames = framesEncoded - this.framesEncodedPrev;
              const deltaTime = totalEncodeTime - this.totalEncodeTimePrev;
              encodeLatency = (deltaTime / deltaFrames) * 1000;
            }
            this.framesEncodedPrev = framesEncoded;
            this.totalEncodeTimePrev = totalEncodeTime;
          }
          if (report.type === "inbound-rtp" && report.kind === "video") {
            fps = report.framesPerSecond || fps;
            bytesNow = report.bytesReceived || bytesNow;
            packetLoss = (report.packetsLost / (report.packetsReceived + report.packetsLost || 1)) * 100;
            
            // Calculate decode latency
            const framesDecoded = report.framesDecoded || 0;
            const totalDecodeTime = report.totalDecodeTime || 0;
            if (this.framesDecodedPrev > 0 && framesDecoded > this.framesDecodedPrev) {
              const deltaFrames = framesDecoded - this.framesDecodedPrev;
              const deltaTime = totalDecodeTime - this.totalDecodeTimePrev;
              decodeLatency = (deltaTime / deltaFrames) * 1000;
            }
            this.framesDecodedPrev = framesDecoded;
            this.totalDecodeTimePrev = totalDecodeTime;
          }
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            rtt = (report.currentRoundTripTime || 0.01) * 1000;
          }
        });

        // Compute current bitrate in bps
        const now = Date.now();
        const timeDelta = (now - this.constPrevTime) / 1000; // in seconds
        let bitrate = 0;
        if (timeDelta > 0 && this.bytesPrev > 0) {
          bitrate = ((bytesNow - this.bytesPrev) * 8) / timeDelta;
        }

        this.bytesPrev = bytesNow;
        this.constPrevTime = now;
        this.latestStats = { fps, bitrate, packetLoss, rtt, encodeLatency, decodeLatency };

        // ADAPTIVE QUALITY CONTROLLER (Only on desktop sender side)
        if (this.role === "desktop") {
          this.executeAdaptiveControls(rtt, packetLoss);
        }
      } catch {
        // fail silently
      }
    }, 1000);
  }

  /**
   * Adaptive Congestion Control algorithm
   */
  private async executeAdaptiveControls(rtt: number, packetLoss: number) {
    // Check if network is congested
    if (packetLoss > 2.0 || rtt > 80.0) {
      this.clearNetworkChecks = 0;
      // Throttle bitrate by 25% down to a minimum floor of 2 Mbps
      const nextBitrate = Math.max(2_000_000, this.activeMaxBitrate * 0.75);
      if (nextBitrate !== this.activeMaxBitrate) {
        this.activeMaxBitrate = nextBitrate;
        await this.applyBitrateParameters();
        console.warn(`Adaptive Quality: Throttled bitrate to ${(this.activeMaxBitrate / 1_000_000).toFixed(2)} Mbps due to Loss=${packetLoss.toFixed(1)}%, RTT=${rtt.toFixed(0)}ms`);
      }
    } else if (packetLoss < 0.5 && rtt < 30.0) {
      // Network is clear, increment check count
      this.clearNetworkChecks++;
      if (this.clearNetworkChecks >= 5) {
        this.clearNetworkChecks = 0;
        // Scale bitrate back up by 1.5 Mbps up to the selected profile ceiling
        const nextBitrate = Math.min(this.profileCeilingBitrate, this.activeMaxBitrate + 1_500_000);
        if (nextBitrate !== this.activeMaxBitrate) {
          this.activeMaxBitrate = nextBitrate;
          await this.applyBitrateParameters();
          console.log(`Adaptive Quality: Restored bitrate to ${(this.activeMaxBitrate / 1_000_000).toFixed(2)} Mbps`);
        }
      }
    }
  }

  async getStats(): Promise<StreamingStats> {
    return this.latestStats;
  }

  async disconnect(): Promise<void> {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    if (this.controlChannel) {
      this.controlChannel.close();
      this.controlChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log("Disconnected WebRTC session.");
  }

}
