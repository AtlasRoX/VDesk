"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// Pre-generated static star positions – outside component so Math.random() not inside useMemo
const STARS_POSITIONS: Float32Array = (() => {
  const arr = new Float32Array(800 * 3);
  for (let i = 0; i < 800 * 3; i++) {
    arr[i] = (Math.random() - 0.5) * 45;
  }
  return arr;
})();

// Custom Sharpening Shader Material definition with brightness and contrast control
const SharpenShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSharpenStrength: { value: 0.3 },
    uResolution: { value: new THREE.Vector2(2048, 1152) },
    uContrast: { value: 1.0 },
    uBrightness: { value: 0.0 },
    uHdrEnabled: { value: 0.0 },
    uExposure: { value: 1.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSharpenStrength;
    uniform vec2 uResolution;
    uniform float uContrast;
    uniform float uBrightness;
    uniform float uHdrEnabled;
    uniform float uExposure;
    varying vec2 vUv;
    void main() {
      vec2 step = 1.0 / uResolution;
      vec4 color;
      
      if (uSharpenStrength <= 0.0) {
        color = texture2D(tDiffuse, vUv);
      } else {
        vec4 center = texture2D(tDiffuse, vUv);
        vec4 left   = texture2D(tDiffuse, vUv + vec2(-step.x, 0.0));
        vec4 right  = texture2D(tDiffuse, vUv + vec2( step.x, 0.0));
        vec4 top    = texture2D(tDiffuse, vUv + vec2(0.0,  step.y));
        vec4 bottom = texture2D(tDiffuse, vUv + vec2(0.0, -step.y));
        
        // Discrete Laplacian filter
        vec4 edge = left + right + top + bottom - 4.0 * center;
        color = clamp(center - uSharpenStrength * edge, 0.0, 1.0);
      }

      // Apply brightness
      color.rgb = clamp(color.rgb + uBrightness, 0.0, 1.0);

      // Apply contrast (around midpoint 0.5)
      color.rgb = clamp((color.rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);

      // HDR Simulation
      if (uHdrEnabled > 0.5) {
        // Apply exposure
        color.rgb *= uExposure;
        // Reinhard tone mapping
        color.rgb = color.rgb / (color.rgb + vec3(1.0));
        // Boost saturation by +20%
        const vec3 W = vec3(0.2125, 0.7154, 0.0721);
        float intensity = dot(color.rgb, W);
        color.rgb = clamp(mix(vec3(intensity), color.rgb, 1.2), 0.0, 1.0);
      }

      gl_FragColor = color;
    }
  `,
};

// Local tech-style placeholder canvas generator
function createPlaceholderCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#070708";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#121217";
    ctx.lineWidth = 1;
    const gridSize = 32;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#3b82f6";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VIRTUAL MONITOR ENGINE", canvas.width / 2, canvas.height / 2 - 30);

    ctx.fillStyle = "#71717a";
    ctx.font = "16px monospace";
    ctx.fillText("Awaiting Desktop Stream Pairing...", canvas.width / 2, canvas.height / 2 + 25);
  }
  return canvas;
}

// Side-by-Side (SBS) Stereoscopic Viewport Renderer with GPU Barrel Distortion
function StereoRenderer({
  ipd = 0.064,
  distortion = 0.08,
  supersampling = 1.0,
  antiScreenDoor = false,
}: {
  ipd?: number;
  distortion?: number;
  supersampling?: number;
  antiScreenDoor?: boolean;
}) {
  const { gl, size, camera: mainCamera } = useThree();

  // Lazy instantiate mutable PerspectiveCameras exactly once on mount using useMemo to avoid direct state mutation or ref-render issues
  const leftCamera = useMemo(() => new THREE.PerspectiveCamera(), []);
  const rightCamera = useMemo(() => new THREE.PerspectiveCamera(), []);

  const dpr = gl.getPixelRatio();
  const targetW = Math.max(16, Math.floor((size.width * dpr * supersampling) / 2));
  const targetH = Math.max(16, Math.floor(size.height * dpr * supersampling));

  // Lazy instantiate WebGLRenderTargets exactly once on mount using useMemo. We start with 1x1 and let useEffect setSize
  const leftTarget = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  }), []);

  const rightTarget = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  }), []);

  useEffect(() => {
    leftTarget.setSize(targetW, targetH);
    rightTarget.setSize(targetW, targetH);
  }, [targetW, targetH, leftTarget, rightTarget]);

  // Lazy instantiate post-processing scene exactly once on mount using useMemo
  const postScene = useMemo(() => {
    const s = new THREE.Scene();
    const geom = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tLeft: { value: null as THREE.Texture | null },
        tRight: { value: null as THREE.Texture | null },
        uDistortion: { value: 0.0 },
        uAntiScreenDoor: { value: 0.0 },
        uScreenResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      // GLSL ES 1.0/2.0 does not support sampler2D local variables.
      // Use conditional texture sampling with both samplers directly.
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tLeft;
        uniform sampler2D tRight;
        uniform float uDistortion;
        uniform float uAntiScreenDoor;
        uniform vec2 uScreenResolution;
        void main() {
          bool isLeft = vUv.x < 0.5;
          vec2 uvHalf = isLeft ? vec2(vUv.x * 2.0, vUv.y) : vec2((vUv.x - 0.5) * 2.0, vUv.y);
          vec2 d = uvHalf - vec2(0.5);
          float r2 = dot(d, d);
          vec2 distortedUv = vec2(0.5) + d * (1.0 + uDistortion * r2);
          if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || distortedUv.y < 0.0 || distortedUv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          } else {
            vec4 color;
            if (uAntiScreenDoor > 0.5) {
              vec2 step = 1.0 / uScreenResolution;
              vec4 cCenterL = texture2D(tLeft, distortedUv);
              vec4 cLeftL   = texture2D(tLeft, clamp(distortedUv + vec2(-step.x, 0.0), 0.0, 1.0));
              vec4 cRightL  = texture2D(tLeft, clamp(distortedUv + vec2(step.x, 0.0), 0.0, 1.0));
              vec4 cTopL    = texture2D(tLeft, clamp(distortedUv + vec2(0.0, step.y), 0.0, 1.0));
              vec4 cBottomL = texture2D(tLeft, clamp(distortedUv + vec2(0.0, -step.y), 0.0, 1.0));
              vec4 blendedL = (cCenterL * 2.0 + cLeftL + cRightL + cTopL + cBottomL) / 6.0;
              vec4 cCenterR = texture2D(tRight, distortedUv);
              vec4 cLeftR   = texture2D(tRight, clamp(distortedUv + vec2(-step.x, 0.0), 0.0, 1.0));
              vec4 cRightR  = texture2D(tRight, clamp(distortedUv + vec2(step.x, 0.0), 0.0, 1.0));
              vec4 cTopR    = texture2D(tRight, clamp(distortedUv + vec2(0.0, step.y), 0.0, 1.0));
              vec4 cBottomR = texture2D(tRight, clamp(distortedUv + vec2(0.0, -step.y), 0.0, 1.0));
              vec4 blendedR = (cCenterR * 2.0 + cLeftR + cRightR + cTopR + cBottomR) / 6.0;
              color = isLeft ? blendedL : blendedR;
            } else {
              color = isLeft ? texture2D(tLeft, distortedUv) : texture2D(tRight, distortedUv);
            }
            gl_FragColor = color;
          }
        }
      `,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    s.add(mesh);
    return { scene: s, material: mat };
  }, []);

  const postCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  useEffect(() => {
    return () => {
      leftTarget.dispose();
      rightTarget.dispose();
      postScene.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    };
  }, [leftTarget, rightTarget, postScene]);

  useFrame((state) => {
    const { gl, scene } = state;
    
    if (!postScene || !postCamera) return;
    if (!(mainCamera instanceof THREE.PerspectiveCamera)) return;
    
    // In WebXR presentation mode, standard Three.js render handles it automatically
    if (gl.xr.isPresenting) return;

    const aspect = (size.width / 2) / size.height;
    const fov = mainCamera.fov;
    const near = mainCamera.near;
    const far = mainCamera.far;

    // Synchronize camera matrices
    leftCamera.aspect = aspect;
    leftCamera.fov = fov;
    leftCamera.near = near;
    leftCamera.far = far;
    leftCamera.updateProjectionMatrix();

    rightCamera.aspect = aspect;
    rightCamera.fov = fov;
    rightCamera.near = near;
    rightCamera.far = far;
    rightCamera.updateProjectionMatrix();

    // Copy position/rotation
    leftCamera.position.copy(mainCamera.position);
    leftCamera.rotation.copy(mainCamera.rotation);

    rightCamera.position.copy(mainCamera.position);
    rightCamera.rotation.copy(mainCamera.rotation);

    // Offset sub-cameras locally on X-axis by pupillary distance
    leftCamera.translateX(-ipd / 2);
    rightCamera.translateX(ipd / 2);

    // Disable WebXR default rendering temporarily so our custom loop takes priority
    const xrEnabled = gl.xr.enabled;
    gl.xr.enabled = false;

    // Render left eye to left target
    gl.setRenderTarget(leftTarget);
    gl.clear();
    gl.render(scene, leftCamera);

    // Render right eye to right target
    gl.setRenderTarget(rightTarget);
    gl.clear();
    gl.render(scene, rightCamera);

    // Reset render target to screen
    gl.setRenderTarget(null);
    gl.clear();

    // Set post uniforms
    postScene.material.uniforms.tLeft.value = leftTarget.texture;
    postScene.material.uniforms.tRight.value = rightTarget.texture;
    postScene.material.uniforms.uDistortion.value = distortion;
    postScene.material.uniforms.uAntiScreenDoor.value = antiScreenDoor ? 1.0 : 0.0;
    postScene.material.uniforms.uScreenResolution.value.set(targetW, targetH);

    // Render full-screen quad to screen
    gl.render(postScene.scene, postCamera);

    // Restore XR mode setting
    gl.xr.enabled = xrEnabled;
  }, 1);

  return null;
}

// Stereo Calibration Grid Component (Locked to Head orientation at Z = -1.5m)
function CalibrationGrid({ active }: { active: boolean }) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!active || !groupRef.current) return;
    
    // Position grid relative to camera view
    groupRef.current.position.copy(camera.position);
    groupRef.current.rotation.copy(camera.rotation);
    groupRef.current.translateZ(-1.5);
  });

  if (!active) return null;

  return (
    <group ref={groupRef}>
      {/* High-contrast green crosshair grid lines */}
      <gridHelper
        args={[2, 20, "#10b981", "#047857"]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      />
      {/* Outer alignment ring */}
      <mesh position={[0, 0, 0.001]}>
        <ringGeometry args={[0.015, 0.02, 32]} />
        <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
      </mesh>
      {/* Center point dot */}
      <mesh position={[0, 0, 0.001]}>
        <circleGeometry args={[0.003, 16]} />
        <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
      </mesh>
      {/* Horizontal tick line */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[0.1, 0.002]} />
        <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
      </mesh>
      {/* Vertical tick line */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[0.002, 0.1]} />
        <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

// Three.js Spatial Positional Audio node connected to WebRTC MediaStream
function SpatialAudioNode({ stream, active }: { stream: MediaStream | null; active: boolean }) {
  const { camera } = useThree();
  const [listener] = useState(() => new THREE.AudioListener());
  const soundRef = useRef<THREE.PositionalAudio>(null);

  useEffect(() => {
    // Add audio listener to camera
    camera.add(listener);
    
    // Resume AudioContext if suspended (mobile browsers suspend it by default)
    const resumeAudio = () => {
      if (listener.context.state === "suspended") {
        listener.context.resume().then(() => {
          console.log("AudioContext resumed on user interaction.");
        });
      }
    };
    window.addEventListener("click", resumeAudio);
    window.addEventListener("touchend", resumeAudio);

    return () => {
      camera.remove(listener);
      window.removeEventListener("click", resumeAudio);
      window.removeEventListener("touchend", resumeAudio);
    };
  }, [camera, listener]);

  useEffect(() => {
    if (!active || !stream || !soundRef.current) {
      if (soundRef.current && soundRef.current.isPlaying) {
        try {
          soundRef.current.stop();
        } catch {}
      }
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("No audio tracks found in stream for spatial audio.");
      return;
    }

    console.log("Setting up spatial audio for WebRTC stream...");
    const sound = soundRef.current;
    
    // Connect audio track to Three.js audio node
    try {
      const audioStream = new MediaStream([audioTracks[0]]);
      const context = listener.context;
      const source = context.createMediaStreamSource(audioStream);
      
      // Configure positional audio settings
      sound.setNodeSource(source as unknown as AudioNode);
      sound.setRefDistance(1.5);
      sound.setMaxDistance(10.0);
      sound.setRolloffFactor(1.0);
      sound.setDistanceModel("inverse");
      
      // Start playing
      if (!sound.isPlaying) {
        sound.play();
      }
    } catch (err) {
      console.error("Error setting up positional audio node source:", err);
    }

    return () => {
      try {
        if (sound.isPlaying) {
          sound.stop();
        }
      } catch {
        // ignore
      }
    };
  }, [stream, active, listener]);

  if (!active || !stream) return null;

  return (
    <positionalAudio
      ref={soundRef}
      args={[listener]}
    />
  );
}

// 3DoF Gyroscope Head Tracking with Horizon Leveling and Reset Centering
interface GyroControlsProps {
  enabled: boolean;
  calibrateTrigger: number;
}

function GyroscopeControls({ enabled, calibrateTrigger }: GyroControlsProps) {
  const { camera } = useThree();
  const offsetQuaternion = useRef(new THREE.Quaternion());
  const currentRotation = useRef(new THREE.Quaternion());

  useEffect(() => {
    if (!enabled) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;

      const alpha = THREE.MathUtils.degToRad(e.alpha); // Z
      const beta = THREE.MathUtils.degToRad(e.beta);   // X'
      const gamma = THREE.MathUtils.degToRad(e.gamma); // Y''
      const orient = window.orientation ? THREE.MathUtils.degToRad(window.orientation as number) : 0;

      // Construct Euler rotation
      const euler = new THREE.Euler(beta, alpha, -gamma, "YXZ");
      const qDevice = new THREE.Quaternion().setFromEuler(euler);

      // Adjust for landscape phone placement
      const qScreen = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient);
      const qResult = qDevice.multiply(qScreen);

      currentRotation.current.copy(qResult);
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [enabled]);

  // Recenter mapping
  useEffect(() => {
    if (calibrateTrigger > 0) {
      offsetQuaternion.current.copy(currentRotation.current).invert();
      console.log("Gyroscope calibrated.");
    }
  }, [calibrateTrigger]);

  useFrame(() => {
    if (!enabled) return;

    // Apply rotation relative to starting offset
    camera.quaternion.copy(offsetQuaternion.current).multiply(currentRotation.current);

    // Horizon Lock: Lock roll to prevent simulator sickness
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    camera.quaternion.setFromEuler(new THREE.Euler(euler.x, euler.y, 0, "YXZ"));
  });

  return null;
}

// Monitor Mesh Component supporting curved geometries & bezel transformations
interface VirtualMonitorProps {
  texture: THREE.Texture;
  curvature: number; // radius, 0 = flat
  width: number;
  height: number;
  distance: number;
  heightOffset: number;
  tilt: number;
  sharpenStrength: number;
  resolution: THREE.Vector2;
  contrast: number;
  brightness: number;
  hdrEnabled?: boolean;
  exposure?: number;
  // Spatial audio stream hooks
  videoStream?: MediaStream | null;
  spatialAudioEnabled?: boolean;
}

function VirtualMonitor({
  texture,
  curvature,
  width,
  height,
  distance,
  heightOffset,
  tilt,
  sharpenStrength,
  resolution,
  contrast,
  brightness,
  hdrEnabled = false,
  exposure = 1.2,
  videoStream = null,
  spatialAudioEnabled = false,
}: VirtualMonitorProps) {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);

  // Update shader uniforms
  useEffect(() => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.tDiffuse.value = texture;
      shaderRef.current.uniforms.uSharpenStrength.value = sharpenStrength;
      shaderRef.current.uniforms.uResolution.value.copy(resolution);
      shaderRef.current.uniforms.uContrast.value = contrast;
      shaderRef.current.uniforms.uBrightness.value = brightness;
      shaderRef.current.uniforms.uHdrEnabled.value = hdrEnabled ? 1.0 : 0.0;
      shaderRef.current.uniforms.uExposure.value = exposure;
    }
  }, [texture, sharpenStrength, resolution, contrast, brightness, hdrEnabled, exposure]);

  // Curvature geometries
  const geometry = useMemo(() => {
    if (curvature <= 0) {
      return new THREE.PlaneGeometry(width, height, 32, 32);
    } else {
      const thetaLength = width / curvature;
      const thetaStart = Math.PI * 1.5 - thetaLength / 2;
      return new THREE.CylinderGeometry(
        curvature,
        curvature,
        height,
        64,
        1,
        true,
        thetaStart,
        thetaLength
      );
    }
  }, [curvature, width, height]);

  // Frame geometries
  const bezelGeometry = useMemo(() => {
    const bezelWidth = width + 0.08;
    const bezelHeight = height + 0.08;
    
    if (curvature <= 0) {
      return new THREE.PlaneGeometry(bezelWidth, bezelHeight, 1, 1);
    } else {
      const bezelCurvature = curvature + 0.005;
      const thetaLength = bezelWidth / bezelCurvature;
      const thetaStart = Math.PI * 1.5 - thetaLength / 2;
      return new THREE.CylinderGeometry(
        bezelCurvature,
        bezelCurvature,
        bezelHeight,
        64,
        1,
        true,
        thetaStart,
        thetaLength
      );
    }
  }, [curvature, width, height]);

  const positionZ = curvature <= 0 ? -distance : -distance - curvature;
  const rotationX = tilt * (Math.PI / 180);
  const bezelPosZ = curvature <= 0 ? -0.005 : 0;

  return (
    <group position={[0, heightOffset, positionZ]} rotation={[rotationX, 0, 0]}>
      {/* 1. Matte Bezel Outer Shell */}
      <mesh geometry={bezelGeometry} position={[0, 0, bezelPosZ]}>
        <meshStandardMaterial
          color="#09090b"
          roughness={0.8}
          metalness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2. Glass Panel/Active Screen */}
      <mesh geometry={geometry} position={[0, 0, 0]}>
        <shaderMaterial
          ref={shaderRef}
          args={[
            {
              ...SharpenShader,
              side: THREE.DoubleSide,
            },
          ]}
        />
      </mesh>

      {/* 3. Spatial Audio Positional Node source */}
      <SpatialAudioNode stream={videoStream} active={spatialAudioEnabled} />

      {/* 4. Glowing LED Indicator */}
      <mesh position={[0, -height / 2 - 0.035, 0.002]}>
        <boxGeometry args={[width * 0.12, 0.006, 0.002]} />
        <meshBasicMaterial color={texture.image instanceof HTMLVideoElement ? "#10b981" : "#3b82f6"} />
      </mesh>
    </group>
  );
}

// Environment Backgrounds
interface EnvironmentProps {
  mode: "void" | "workspace" | "space" | "cinema";
}

function Environment({ mode }: EnvironmentProps) {
  const backgroundColor = useMemo(() => {
    if (mode === "void") return "#000000";
    if (mode === "workspace") return "#0d0d11";
    if (mode === "space") return "#040406";
    return "#020203";
  }, [mode]);

  const dustRef = useRef<THREE.Points>(null);

  useFrame((state) => {
    if (mode === "space" && dustRef.current) {
      dustRef.current.rotation.y = state.clock.getElapsedTime() * 0.005;
      dustRef.current.rotation.x = state.clock.getElapsedTime() * 0.002;
    }
  });

  // Use pre-generated module-level star positions (no Math.random in render path)
  const starsArray = STARS_POSITIONS;

  return (
    <>
      <color attach="background" args={[backgroundColor]} />
      {mode === "workspace" && (
        <>
          <ambientLight intensity={0.5} color="#ffffff" />
          <directionalLight position={[3, 8, 3]} intensity={0.7} />
          <gridHelper args={[24, 24, "#27272a", "#18181b"]} position={[0, -1.8, 0]} />
        </>
      )}

      {mode === "space" && (
        <>
          <ambientLight intensity={0.2} color="#818cf8" />
          <directionalLight position={[-3, 5, -3]} intensity={0.3} color="#c084fc" />
          <points ref={dustRef}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[starsArray, 3]}
              />
            </bufferGeometry>
            <pointsMaterial size={0.06} color="#e2e8f0" transparent opacity={0.5} />
          </points>
        </>
      )}

      {mode === "cinema" && (
        <>
          <ambientLight intensity={0.08} color="#ffffff" />
          <spotLight position={[0, 6, 1]} intensity={0.3} angle={0.7} penumbra={1} />
          <mesh position={[0, -2.0, -1]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[20, 15]} />
            <meshStandardMaterial color="#08080a" roughness={0.9} />
          </mesh>
        </>
      )}
    </>
  );
}

// Main VR Scene Container
interface VRSceneContainerProps {
  sharpenStrength: number;
  environmentMode: "void" | "workspace" | "space" | "cinema";
  glRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  videoStream?: MediaStream | null;
  scale: number;
  distance: number;
  heightOffset: number;
  tilt: number;
  curvature: number;
  // Stereo and Gyro controls
  stereoMode: boolean;
  gyroEnabled: boolean;
  calibrateTrigger: number;
  // Lens and IPD spacing adjustments
  ipd?: number;
  distortion?: number;
  calibrationMode?: boolean;
  // Productivity modes
  readingMode?: boolean;
  focusMode?: boolean;
  presentationMode?: boolean;
  // Spatial Audio toggle
  spatialAudioEnabled?: boolean;
  // Visual Enhancement Suite
  supersampling?: number;
  antiScreenDoor?: boolean;
  hdrEnabled?: boolean;
  exposure?: number;
}

export function VRScene({
  sharpenStrength,
  environmentMode,
  glRef,
  videoStream = null,
  scale,
  distance,
  heightOffset,
  tilt,
  curvature,
  stereoMode,
  gyroEnabled,
  calibrateTrigger,
  ipd = 0.064,
  distortion = 0.08,
  calibrationMode = false,
  readingMode = false,
  focusMode = false,
  presentationMode = false,
  spatialAudioEnabled = false,
  supersampling = 1.0,
  antiScreenDoor = false,
  hdrEnabled = false,
  exposure = 1.2,
}: VRSceneContainerProps) {
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [videoResolution, setVideoResolution] = useState<THREE.Vector2>(new THREE.Vector2(1920, 1080));
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // Fallback placeholder texture
  const placeholderTexData = useMemo(() => {
    if (typeof window === "undefined") return null;
    const canvas = createPlaceholderCanvas();
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return {
      texture: tex,
      res: new THREE.Vector2(canvas.width, canvas.height),
    };
  }, []);

  // Handle dynamic video stream inputs
  useEffect(() => {
    if (!videoStream) {
      if (videoTexture !== null) {
        queueMicrotask(() => {
          setVideoTexture(null);
        });
      }
      if (videoElRef.current) {
        videoElRef.current.pause();
        videoElRef.current.srcObject = null;
      }
      return;
    }

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    const handleMetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoResolution(new THREE.Vector2(video.videoWidth, video.videoHeight));
      }
    };
    video.addEventListener("loadedmetadata", handleMetadata);

    video.srcObject = videoStream;
    videoElRef.current = video;

    const playVideo = async () => {
      try {
        await video.play();
        const tex = new THREE.VideoTexture(video);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        
        if (glRef.current) {
          const maxAnisotropy = glRef.current.capabilities.getMaxAnisotropy();
          tex.anisotropy = maxAnisotropy;
        }
        
        setVideoTexture(tex);
      } catch (err) {
        console.error("Failed to play WebRTC video stream:", err);
      }
    };

    playVideo();

    return () => {
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.pause();
      video.srcObject = null;
      queueMicrotask(() => {
        setVideoTexture(null);
      });
    };
  }, [videoStream, glRef, videoTexture]);

  // Apply Productivity Mode Overrides
  const activeSharpenStrength = readingMode ? 0.7 : sharpenStrength;
  const activeContrast = readingMode ? 1.25 : 1.0;
  const activeBrightness = readingMode ? -0.05 : 0.0;

  const activeEnvironmentMode = focusMode ? "void" : environmentMode;

  const activeScale = presentationMode ? 1.8 : scale;
  const activeDistance = presentationMode ? 3.5 : distance;
  const activeHeightOffset = presentationMode ? 0.4 : heightOffset;
  const activeTilt = presentationMode ? -5 : tilt;

  // Compute monitor dimensions factoring in size scale
  const baseWidth = 2.5;
  const baseHeight = 1.4;
  const width = baseWidth * activeScale;
  const height = baseHeight * activeScale;

  const activeTexture = videoTexture || (placeholderTexData ? placeholderTexData.texture : null);
  const activeResolution = videoTexture ? videoResolution : (placeholderTexData ? placeholderTexData.res : new THREE.Vector2(1920, 1080));

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      <Canvas
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          glRef.current = gl;
          gl.xr.enabled = true;
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }}
      >
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2 + 0.1}
          minDistance={0.5}
          maxDistance={12.0}
          enableRotate={!gyroEnabled}
        />
        
        <Environment mode={activeEnvironmentMode} />

        {/* Ambient screen bounce glow in Cinema mode */}
        {activeEnvironmentMode === "cinema" && (
          <pointLight
            position={[0, activeHeightOffset, curvature <= 0 ? -activeDistance + 0.5 : -activeDistance - curvature + 0.5]}
            intensity={0.6}
            distance={8}
            color="#38bdf8"
          />
        )}

        {stereoMode && (
          <StereoRenderer
            ipd={ipd}
            distortion={distortion}
            supersampling={supersampling}
            antiScreenDoor={antiScreenDoor}
          />
        )}

        {gyroEnabled && (
          <GyroscopeControls enabled={gyroEnabled} calibrateTrigger={calibrateTrigger} />
        )}

        <CalibrationGrid active={calibrationMode} />

        {activeTexture && (
          <VirtualMonitor
            texture={activeTexture}
            resolution={activeResolution}
            width={width}
            height={height}
            curvature={curvature}
            distance={activeDistance}
            heightOffset={activeHeightOffset}
            tilt={activeTilt}
            sharpenStrength={activeSharpenStrength}
            contrast={activeContrast}
            brightness={activeBrightness}
            hdrEnabled={hdrEnabled}
            exposure={exposure}
            videoStream={videoStream}
            spatialAudioEnabled={spatialAudioEnabled}
          />
        )}
      </Canvas>
      
      {/* Live monitor diagnostics Overlay */}
      <div className="absolute top-4 left-4 z-10 px-3 py-2 bg-zinc-950/80 border border-zinc-800 text-zinc-400 text-xs font-mono rounded flex flex-col gap-1 select-none pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${videoStream ? "bg-emerald-500 animate-pulse" : "bg-blue-500"}`} />
          <span className="font-bold text-white">{videoStream ? "LIVE MONITOR" : "DISCONNECTED"}</span>
        </div>
        <div className="text-[10px] text-zinc-500 mt-1 border-t border-zinc-800/80 pt-1">
          <div>SIZE: {activeScale.toFixed(1)}x ({Math.round(width * 100)}cm)</div>
          <div>DIST: {activeDistance.toFixed(1)}m | TILT: {activeTilt}°</div>
          <div>CURVE: {curvature > 0 ? `${curvature.toFixed(1)}m` : "FLAT"}</div>
          <div>IPD: {Math.round(ipd * 1000)}mm | DISTORT: {distortion.toFixed(2)}</div>
          <div>SS: {supersampling.toFixed(2)}x | SDE: {antiScreenDoor ? "ON" : "OFF"}</div>
          <div>HDR: {hdrEnabled ? "ON" : "OFF"} (EXP: {exposure.toFixed(1)})</div>
          <div>STEREO: {stereoMode ? "ACTIVE (SBS)" : "OFF"}</div>
        </div>
      </div>
    </div>
  );
}
