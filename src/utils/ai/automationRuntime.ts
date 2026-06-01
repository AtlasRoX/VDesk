import { MemoryStore } from './memoryStore';
import { parseNaturalLanguageAutomation } from './automationEngine';
import { StreamingStats } from '../providers';

export interface AutomationRuntimeContext {
  connectionState: string;
  mediaSource: 'screenshare' | 'localvideo' | 'youtube';
  resolutionProfile: 'performance' | 'balanced' | 'quality' | 'ultra';
  streamingStats: StreamingStats | null;
  thermalThrottleAlert: boolean;
  detectedActivity: string;
}

export function evaluateAutomations(
  context: AutomationRuntimeContext,
  onTriggerAction: (actionKey: string) => void
) {
  const memory = MemoryStore.getMemory();
  if (!memory.enabled) return;

  const activeAutomations = memory.automations.filter((a) => a.isActive);

  for (const auto of activeAutomations) {
    let triggered = false;

    // Evaluate triggerName
    const trigger = auto.triggerName;
    if (trigger === 'mediaSource === "youtube"') {
      triggered = context.mediaSource === 'youtube';
    } else if (trigger === 'streamState === "overheating"') {
      triggered = context.thermalThrottleAlert;
    } else if (trigger === 'activity === "coding"') {
      triggered = context.detectedActivity === 'coding';
    } else if (trigger === 'packetLoss > 5.0 || latencyMs > 80.0') {
      const stats = context.streamingStats;
      triggered = !!stats && (stats.packetLoss > 5.0 || (stats.rtt || 0) > 80.0);
    } else if (trigger === 'isStreaming === true') {
      triggered = context.connectionState === 'connected';
    } else {
      // Fallback evaluation if trigger matches custom text/intents
      const normalizedTrigger = trigger.toLowerCase();
      if (normalizedTrigger.includes('youtube')) {
        triggered = context.mediaSource === 'youtube';
      } else if (normalizedTrigger.includes('overheating') || normalizedTrigger.includes('thermal')) {
        triggered = context.thermalThrottleAlert;
      } else if (normalizedTrigger.includes('coding')) {
        triggered = context.detectedActivity === 'coding';
      } else if (normalizedTrigger.includes('streaming') || normalizedTrigger.includes('connection')) {
        triggered = context.connectionState === 'connected';
      }
    }

    if (triggered) {
      // Map back to actionKey using parsed NL command
      const parsed = parseNaturalLanguageAutomation(auto.nlString);
      if (parsed && parsed.isValid && parsed.actionKey) {
        console.log(`[automationRuntime] Triggering automation action: ${parsed.actionKey} for "${auto.nlString}"`);
        onTriggerAction(parsed.actionKey);
      }
    }
  }
}
