/**
 * Screen Capture Frame Utility.
 *
 * Strategy (in priority order):
 *  1. Native GDI capture via Tauri `capture_native_screen` command (Windows only).
 *     This captures the real OS desktop regardless of which application is focused,
 *     bypassing the browser sandbox entirely.
 *  2. WebRTC video element frame capture — used when the Tauri command is unavailable
 *     (e.g. running in a plain browser, or on a non-Windows platform).
 */

/** True when running inside a Tauri application shell. */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Attempt to capture the native desktop screen via Tauri's rust backend.
 * Returns a base64 JPEG data URL, or null if the command fails / is not available.
 */
export async function captureNativeScreen(): Promise<string | null> {
  if (!isTauri()) return null;

  try {
    // Dynamically import @tauri-apps/api only when running inside Tauri
    // to avoid bundling issues in plain-browser builds.
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<string>('capture_native_screen');
    return result || null;
  } catch (err) {
    console.warn('[screenshot] capture_native_screen Tauri command failed:', err);
    return null;
  }
}

/**
 * Capture a single video frame from the active WebRTC desktop stream track.
 * Draws the video element onto a temporary canvas and exports it as a JPEG
 * data URL at 85% quality.
 *
 * Returns null if the video is not ready or the canvas API fails.
 */
export function captureVideoFrame(videoElement: HTMLVideoElement | null): string | null {
  if (!videoElement) return null;

  // Verify the video track is actively rendering frames
  if (videoElement.readyState < 2) {
    console.warn('[screenshot] Video track not ready for frame capture (readyState < 2)');
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 1280;
    canvas.height = videoElement.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    }
  } catch (err) {
    console.error('[screenshot] Failed to capture base64 frame from WebRTC stream track:', err);
  }
  return null;
}

/**
 * High-level capture helper used by the AI Vision pipeline.
 *
 * Tries native GDI capture first (true OS screenshot), then falls back to the
 * WebRTC stream frame if Tauri is unavailable or the command errors.
 *
 * @param videoElement - The WebRTC desktop video element (used for fallback only)
 * @returns Base64 JPEG data URL string, or null on complete failure
 */
export async function captureScreen(
  videoElement: HTMLVideoElement | null
): Promise<string | null> {
  // 1. Try Tauri native capture (bypasses browser sandbox, works for any OS window)
  const native = await captureNativeScreen();
  if (native) {
    console.log('[screenshot] Using native GDI screen capture');
    return native;
  }

  // 2. Fall back to WebRTC video frame
  const frame = captureVideoFrame(videoElement);
  if (frame) {
    console.log('[screenshot] Using WebRTC stream frame capture (fallback)');
  } else {
    console.warn('[screenshot] Both capture methods failed — no frame available');
  }
  return frame;
}
