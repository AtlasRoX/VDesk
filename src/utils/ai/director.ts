import { NIMClient, NIMCapability } from './nimClient';
import { WorkspaceContext } from './contextEngine';
import { parseNaturalLanguageAutomation } from './automationEngine';
import { MemoryStore } from './memoryStore';

export interface DirectorResponse {
  intent: string;
  response: string;
  actionTaken?: string;
  actionKey?: string;
  modelUsed: string;
  latencyMs: number;
}

export class WorkspaceDirector {
  private nimClient: NIMClient;

  constructor() {
    this.nimClient = new NIMClient();
  }

  /**
   * Main director coordination loop.
   * Classifies query intent, routes to specialized NIM models, maps workspace operations,
   * compiles automation rules, and stores outcomes in local memory.
   */
  async processQuery(
    query: string,
    context: WorkspaceContext,
    onChunk?: (text: string) => void,
    base64Image?: string | null
  ): Promise<DirectorResponse> {
    const startTime = Date.now();
    const normalized = query.toLowerCase().trim();

    // 0. INTENT TYPE: Visual Screen Analysis
    if (base64Image || normalized.includes('screen') || normalized.includes('explain this') || normalized.includes('error am i seeing') || normalized.includes('diagram') || normalized.includes('chart')) {
      const visionPrompt = `Analyze the current screen state snapshot to address the user request.
User query: "${query}"

Active Workspace Context:
* App: ${context.app}
* Activity: ${context.activity}
* Mode: ${context.activeMode}`;

      const result = await this.nimClient.execute('vision', visionPrompt, onChunk, base64Image);
      
      MemoryStore.logActivity(
        'Executed Vision Context analysis',
        `OCR Question: "${query}"`,
        `Outcome: Parsed screen frame`
      );

      return {
        intent: 'Visual Screen Context Analysis',
        response: result.text,
        modelUsed: result.modelUsed,
        latencyMs: Date.now() - startTime
      };
    }

    // 1. INTENT TYPE: Automation Rule Creation
    if (normalized.startsWith('when ') || normalized.startsWith('if ') || normalized.includes('automation') || normalized.includes('automate')) {
      const parsed = parseNaturalLanguageAutomation(query);
      if (parsed.isValid) {
        // Save automation to memory
        const autoid = `auto_${Math.random().toString(36).slice(2, 9)}`;
        MemoryStore.addAutomation({
          id: autoid,
          triggerName: parsed.triggerName,
          conditionDescription: parsed.conditionDescription,
          actionDescription: parsed.actionDescription,
          nlString: query,
          isActive: true
        });

        MemoryStore.logActivity(
          'Registered automation rule',
          `Parsed command: "${query}"`,
          `Trigger bound to: ${parsed.triggerName}`
        );

        const text = `Workspace automation rule compiled and activated.\n\n**Rule State:**\n* ${query}\n\n**Technical Parameters:**\n* **Trigger:** \`${parsed.triggerName}\`\n* **Condition:** ${parsed.conditionDescription}\n* **Action:** \`${parsed.actionDescription}\`\n\nRule registered in persistent memory.`;
        if (onChunk) onChunk(text);

        return {
          intent: 'Create Automation',
          response: text,
          actionTaken: 'Registered Automation Rule',
          actionKey: parsed.actionKey,
          modelUsed: 'meta/llama-3.2-3b-instruct (Director)',
          latencyMs: Date.now() - startTime
        };
      }
    }

    // 2. INTENT TYPE: Operational Workspace Preset command
    let mappedAction: string | undefined;
    let actionKey: string | undefined;
    let capability: NIMCapability = 'research';

    if (normalized.includes('cinema') || normalized.includes('movie') || normalized.includes('theater')) {
      mappedAction = 'movie';
      actionKey = 'apply_cinema_preset';
      capability = 'workspace';
    } else if (normalized.includes('code') || normalized.includes('programming') || normalized.includes('ide') || normalized.includes('develop')) {
      mappedAction = 'coding';
      actionKey = 'apply_coding_preset';
      capability = 'coding';
    } else if (normalized.includes('reading') || normalized.includes('book') || normalized.includes('read')) {
      mappedAction = 'reading';
      actionKey = 'enable_reading_mode';
      capability = 'workspace';
    } else if (normalized.includes('focus') || normalized.includes('darken') || normalized.includes('void')) {
      mappedAction = 'focus';
      actionKey = 'enable_focus';
      capability = 'workspace';
    } else if (normalized.includes('latency') || normalized.includes('packet loss') || normalized.includes('lag') || normalized.includes('bitrate') || normalized.includes('congest')) {
      mappedAction = 'optimize_stream';
      actionKey = 'throttle_bitrate';
      capability = 'workspace';
    }

    // 3. SPECIALIZED MODEL CAPABILITY ROUTING
    if (capability === 'coding') {
      const codingPrompt = `You are the Coding Layer assistant in a high-performance VR Streaming Desktop context.\n\nWorkspace active state:\n* App: ${context.app}\n* Activity: ${context.activity}\n* Mode: ${context.activeMode}\n\nUser request: "${query}"\n\nExplain code clearly and provide direct, optimized code snippets.`;
      const result = await this.nimClient.execute('coding', codingPrompt, onChunk);
      
      MemoryStore.logActivity(
        'Executed Coding Capability review',
        `Prompt: "${query}"`,
        `Model: ${result.modelUsed}`
      );

      return {
        intent: 'Coding analysis',
        response: result.text,
        actionTaken: mappedAction ? `Mapped preset action: ${mappedAction}` : undefined,
        actionKey,
        modelUsed: result.modelUsed,
        latencyMs: Date.now() - startTime
      };
    }

    if (capability === 'workspace' && actionKey) {
      const workspacePrompt = `You are the Workspace Optimization Layer inside a VR Desktop platform.\n\nActive Context:\n* FPS: ${context.fps}\n* Latency: ${context.latencyMs}ms\n* Bandwidth: ${context.bandwidthMbps.toFixed(2)}Mbps\n* Active Environment: ${context.activeMode}\n\nUser requested operation: "${query}".\n\nExplain how setting active preset to '${mappedAction}' improves workspace ergonomics and performance metrics.`;
      const result = await this.nimClient.execute('workspace', workspacePrompt, onChunk);

      MemoryStore.logActivity(
        'Adjusted workspace parameters',
        `Rule triggered by request: "${query}"`,
        `Configpreset applied: ${mappedAction}`
      );

      return {
        intent: 'Workspace ergonomics adjustment',
        response: result.text,
        actionTaken: `Swapped preset to ${mappedAction}`,
        actionKey,
        modelUsed: result.modelUsed,
        latencyMs: Date.now() - startTime
      };
    }

    // 4. DEFAULT: General Research / Knowledge Synthesis
    const researchPrompt = `You are the Research Layer assistant in a high-fidelity VR Desktop pairing ecosystem.\n\nActive Context:\n* Screen: ${context.app}\n* Task: ${context.activity}\n\nUser question: "${query}"\n\nProvide an concise, factual summary response. Ground recommendations in solid tech principles.`;
    const result = await this.nimClient.execute('research', researchPrompt, onChunk);

    MemoryStore.logActivity(
      'Executed Research Layer synthesis',
      `Synthesis query: "${query}"`,
      `Outcome: Synthesized contextual facts`
    );

    return {
      intent: 'Knowledge Research & Synthesis',
      response: result.text,
      modelUsed: result.modelUsed,
      latencyMs: Date.now() - startTime
    };
  }
}
