/**
 * AI Local Memory Layer.
 * Manages persistent storage of workspace sessions, preferences, automations,
 * and recent events inside client-side localStorage. Exposes explicit clear/edit APIs.
 */

export interface SavedWorkspace {
  scale: number;
  distance: number;
  curvature: number;
  heightOffset: number;
  tilt: number;
  environmentMode: string;
  sharpenStrength: number;
  timestamp: number;
}

export interface SavedAutomation {
  id: string;
  triggerName: string;
  conditionDescription: string;
  actionDescription: string;
  nlString: string;
  isActive: boolean;
  timestamp: number;
}

export interface ActivityRecord {
  id: string;
  actionTaken: string;
  reason: string;
  outcome: string;
  timestamp: number;
}

export interface UserPreferences {
  supersampling: number;
  ipd: number;
  distortion: number;
  autoSupersampling: boolean;
  localOnlyMode: boolean;
}

export interface WorkspaceMemory {
  enabled: boolean;
  lastWorkspace: SavedWorkspace | null;
  automations: SavedAutomation[];
  activityLog: ActivityRecord[];
  preferences: UserPreferences | null;
}

const STORAGE_KEY = 'vr-desk-ai-memory';

const DEFAULT_MEMORY: WorkspaceMemory = {
  enabled: true,
  lastWorkspace: null,
  automations: [
    {
      id: 'default_auto_1',
      triggerName: 'mediaSource === "youtube"',
      conditionDescription: 'Cinema preset condition match',
      actionDescription: 'applyPreset("movie")',
      nlString: 'When YouTube starts, switch to Cinema Mode.',
      isActive: true,
      timestamp: Date.now() - 86400000
    },
    {
      id: 'default_auto_2',
      triggerName: 'streamState === "overheating"',
      conditionDescription: 'Headset thermal warning guard',
      actionDescription: 'applyPerformancePreset()',
      nlString: 'When latency or heat spikes, scale quality down automatically.',
      isActive: true,
      timestamp: Date.now() - 43200000
    }
  ],
  activityLog: [
    {
      id: 'act_1',
      actionTaken: 'Stream Profile throttled to 720p',
      reason: 'Simulation thermal stress trigger matching rule auto-2 activated.',
      outcome: 'Reduced thermal load on headset decoder by 60%. Stability restored.',
      timestamp: Date.now() - 3600000
    }
  ],
  preferences: null
};

export class MemoryStore {
  private static loadMemory(): WorkspaceMemory {
    if (typeof window === 'undefined') return DEFAULT_MEMORY;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (_) {
      // Fallback to default
    }
    return DEFAULT_MEMORY;
  }

  private static saveMemory(memory: WorkspaceMemory): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch (err) {
      console.error('Failed to write workspace memory to storage:', err);
    }
  }

  static getMemory(): WorkspaceMemory {
    return this.loadMemory();
  }

  static toggleMemorySystem(enabled: boolean): void {
    const memory = this.loadMemory();
    memory.enabled = enabled;
    this.saveMemory(memory);
  }

  static saveWorkspaceLayout(layout: Omit<SavedWorkspace, 'timestamp'>): void {
    const memory = this.loadMemory();
    if (!memory.enabled) return;
    memory.lastWorkspace = {
      ...layout,
      timestamp: Date.now()
    };
    this.saveMemory(memory);
  }

  static savePreferences(prefs: UserPreferences): void {
    const memory = this.loadMemory();
    if (!memory.enabled) return;
    memory.preferences = prefs;
    this.saveMemory(memory);
  }

  static addAutomation(automation: Omit<SavedAutomation, 'timestamp'>): void {
    const memory = this.loadMemory();
    if (!memory.enabled) return;
    
    // Prevent duplicates
    memory.automations = memory.automations.filter(a => a.id !== automation.id);
    memory.automations.push({
      ...automation,
      timestamp: Date.now()
    });
    this.saveMemory(memory);
  }

  static toggleAutomation(id: string, active: boolean): void {
    const memory = this.loadMemory();
    const item = memory.automations.find(a => a.id === id);
    if (item) {
      item.isActive = active;
      this.saveMemory(memory);
    }
  }

  static deleteAutomation(id: string): void {
    const memory = this.loadMemory();
    memory.automations = memory.automations.filter(a => a.id !== id);
    this.saveMemory(memory);
  }

  static logActivity(actionTaken: string, reason: string, outcome: string): void {
    const memory = this.loadMemory();
    if (!memory.enabled) return;
    
    const record: ActivityRecord = {
      id: `act_${Math.random().toString(36).slice(2, 9)}`,
      actionTaken,
      reason,
      outcome,
      timestamp: Date.now()
    };

    memory.activityLog.unshift(record);
    
    // Keep max 20 logs
    if (memory.activityLog.length > 20) {
      memory.activityLog = memory.activityLog.slice(0, 20);
    }
    
    this.saveMemory(memory);
  }

  static deleteActivityRecord(id: string): void {
    const memory = this.loadMemory();
    memory.activityLog = memory.activityLog.filter(a => a.id !== id);
    this.saveMemory(memory);
  }

  static clearAll(): void {
    const memory = this.loadMemory();
    const cleared = {
      ...DEFAULT_MEMORY,
      enabled: memory.enabled,
      lastWorkspace: null,
      automations: [],
      activityLog: []
    };
    this.saveMemory(cleared);
  }
}
