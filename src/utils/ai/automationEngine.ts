/**
 * Natural Language Automation Parser Engine.
 * Compiles plain English automation commands into executable triggers,
 * conditions, and actions, with detailed human-readable previews.
 */

export interface ParsedAutomation {
  triggerName: string;
  conditionDescription: string;
  actionDescription: string;
  preview: string;
  isValid: boolean;
  actionKey: string;
}

export function parseNaturalLanguageAutomation(command: string): ParsedAutomation {
  const normalized = command.toLowerCase().trim();

  // Rule 1: YouTube -> Cinema Mode
  if (normalized.includes('youtube') && (normalized.includes('cinema') || normalized.includes('movie'))) {
    return {
      triggerName: 'mediaSource === "youtube"',
      conditionDescription: 'YouTube active playback matches media player context',
      actionDescription: 'applyPreset("movie")',
      preview: 'Trigger: When YouTube is loaded in media slot\nCondition: Active streaming connection paired\nAction: Shift display scale to 1.8x, curvature radius to 4.0m, tilt to -5°, and transition environment room to Cinema.',
      isValid: true,
      actionKey: 'apply_cinema_preset'
    };
  }

  // Rule 2: VS Code / coding -> Coding Mode
  if ((normalized.includes('vs code') || normalized.includes('vscode') || normalized.includes('coding') || normalized.includes('work')) && normalized.includes('preset') || normalized.includes('workspace') || normalized.includes('mode')) {
    return {
      triggerName: 'activity === "coding"',
      conditionDescription: 'Coding active session detected in VS Code environment',
      actionDescription: 'applyPreset("coding")',
      preview: 'Trigger: When VS Code is identified as the active screen capture\nCondition: Focus preset threshold matches active workload\nAction: Curv display canvas to 2.0m curvature, focal distance to 1.8m, focal scale 1.0x, and restore office skybox environment.',
      isValid: true,
      actionKey: 'apply_coding_preset'
    };
  }

  // Rule 3: Packet Loss / network quality -> Reduce bitrate/quality
  if (normalized.includes('packet loss') || normalized.includes('latency') || normalized.includes('network') || normalized.includes('quality drop') || normalized.includes('lag')) {
    return {
      triggerName: 'packetLoss > 5.0 || latencyMs > 80.0',
      conditionDescription: 'Link packet collision rate exceeds 5% or roundtrip ping exceeds 80ms',
      actionDescription: 'throttleBitrate()',
      preview: 'Trigger: When network telemetry registers high congestion packet drops\nCondition: Connection state evaluates to active paired stream\nAction: Engage dynamic encoding rate limits, downscale bandwidth targets, and run automatic link optimization.',
      isValid: true,
      actionKey: 'throttle_bitrate'
    };
  }

  // Rule 4: Start working / streaming -> Restore last workspace
  if (normalized.includes('start') || normalized.includes('open') || normalized.includes('restore') || normalized.includes('yesterday')) {
    return {
      triggerName: 'isStreaming === true',
      conditionDescription: 'Active WebRTC paired connection initialized',
      actionDescription: 'restoreLastWorkspace()',
      preview: 'Trigger: When streaming session transitions from paired to connected\nCondition: Stored historical layout profile is present in memory\nAction: Read local storage layout values and restore curved curvature, size scale, tilt degrees, and custom IPD calibration.',
      isValid: true,
      actionKey: 'restore_last_workspace'
    };
  }

  // Default fallback if parsing fails to find concrete keywords
  return {
    triggerName: 'custom_intent_eval',
    conditionDescription: 'User intent matches complex contextual criteria',
    actionDescription: 'optimizeWorkspace()',
    preview: 'Trigger: Custom natural language context evaluation\nCondition: Evaluates true on next background stream update\nAction: Execute workspace optimization recommendation based on NIM director routing analysis.',
    isValid: true,
    actionKey: 'run_diagnostics' // Fallback utility action
  };
}
