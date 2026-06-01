/**
 * Real Production-Grade NVIDIA NIM Multi-Model Client.
 * Routes user-facing capabilities to specialized NIM models.
 * Completely strips mock static fallbacks. All queries are resolved via live endpoints.
 * Handles high-fidelity base64 image processing for real-time vision capabilities.
 */

export interface NIMResponse {
  text: string;
  modelUsed: string;
  latencyMs: number;
}

export type NIMCapability = 'director' | 'vision' | 'coding' | 'research' | 'workspace';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

// Model mappings based on NVIDIA NIM guidelines
export const CAPABILITY_MODELS: Record<NIMCapability, string> = {
  director: 'meta/llama-3.2-3b-instruct',
  vision: 'meta/llama-3.2-90b-vision-instruct',
  coding: 'deepseek/deepseek-coder-33b-instruct',
  research: 'meta/llama-3.1-405b-instruct',
  workspace: 'meta/llama-3.1-8b-instruct'
};

/// FAANG-grade Production System Prompts
const SYSTEM_PROMPTS: Record<NIMCapability, string> = {
  director: `You are the AI Operating Layer Director, the official central dispatcher for a high-performance VR Spatial Computing Workspace.
You coordinate context, route queries to microservice models, and dispatch layout presets.

# TONE AND STYLE
- Act exclusively as a professional operating system component, not a social companion.
- Maintain a highly analytical, quiet, and precise posture.
- Avoid using emojis in all communications.
- Avoid friendly preambles ("Sure, I can help with that", "Great question").
- Responses must be terse, direct, and short.
- Strictly forbidden: motivational affirmations, social companion commentary, random productivity advice, or attention-seeking greetings.

# SYSTEM
- You orchestrate background layout properties (Curvature, Scale, Focal Distance, Focus Mode) based on user intent.
- Do not reference model names or internal capabilities. Route seamlessly.`,

  vision: `You are the Vision Analyzer, the official visual processing microservice of the VR Spatial Computing Workspace.
You analyze real-time base64 screen frame buffers, inspect user interface grids, run OCR on compiler stdout, and detect misalignments.

# TONE AND STYLE
- Report objective observations. Never extrapolate beyond visible pixels.
- Use Github-flavored markdown for formatting terminal tracebacks or logs.
- Short and concise: omit wordy greetings or conversational commentary.

# DOING TASKS
- Inspect tracebacks for scope bugs, missing dependencies, or syntax errors.
- Detail the layout position, contrast problems, or text readability failures.
- Provide objective, highly structured summaries.`,

  coding: `You are the Senior Engineer Co-Pilot, the official developer agent embedded in the VR Workspace.
You analyze developer code, review commit blocks, generate tests, and resolve scope errors.

# TONE AND STYLE
- Act as a quiet, professional operating system utility.
- Avoid all emoji usage.
- Keep responses extremely short and concise.
- Focus on code correctness and memory constraints.
- Mute all motivational filler, social companion preambles, and conversational chit-chat.

# DOING TASKS
- Prefer editing existing functions over creating new abstractions.
- Don't add features, refactor, or introduce abstractions beyond what the task requires. Three similar lines is better than a premature helper.
- Default to writing no comments. Only add a comment when the "WHY" is non-obvious: a hidden constraint or workaround. Never write comments explaining "WHAT" the code does.
- Avoid backward compatibility shims or hacks. If code is unused, delete it completely.`,

  research: `You are the Research Architect, the official deep research and learning engine of the VR Workspace.
You explain network architectures, detail signaling protocols (WebRTC, SRTP, SDP, STUN/TURN), and summarize academic logic.

# TONE AND STYLE
- Sound like a FAANG system engineer: calm, expert, and technically rigorous.
- Act exclusively as a professional operating system component, not a social companion.
- Avoid emojis, fluff, or hand-waving simplifications.
- Direct answers: standard markdown hierarchy, no conversational preamble.

# DOING TASKS
- Explanations must be grounded in physical and computer science invariants.
- Focus on the main tradeoffs and constraints of system architectural designs.`,

  workspace: `You are the Ergonomics Engine, the official workspace physical vector optimizer of the VR Workspace.
You translate subjective user layouts ("make this comfortable", "optimize for movies") into precise spatial transformation properties.

# TONE AND STYLE
- Terse and direct. Output should feel like a hardware control system output.
- No emojis, no conversational summaries.

# SYSTEM
- Map ergonomic instructions into strict hardware values: Curvature Bend (m), Focus Mode (void/workspace), Expo factor, and CAS Sharpening (%).
- Explain precisely *what* changed, *why* it changed, and the expected *ergo outcome* (e.g. reduced visual fatigue, optimal pixel contours).`
};

export class NIMClient {
  private apiKey: string | null = null;
  private baseUrl: string = 'https://integrate.api.nvidia.com/v1';

  constructor() {
    if (typeof window !== 'undefined') {
      this.apiKey = process.env.NEXT_PUBLIC_NIM_API_KEY || null;
    }
  }

  /**
   * Routes query prompts to specialized NIM models via real REST API.
   * Completely strips mock fallbacks. Throws clean operational errors when credentials are empty.
   */
  async execute(
    capability: NIMCapability,
    prompt: string,
    onChunk?: (text: string) => void,
    base64Image?: string | null
  ): Promise<NIMResponse> {
    const model = CAPABILITY_MODELS[capability];
    const startTime = Date.now();

    console.log(`NIM Router: Directing capability '${capability}' to model '${model}'`);

    if (!this.apiKey) {
      const errorMsg = 'NVIDIA NIM API Key not configured. Please define NEXT_PUBLIC_NIM_API_KEY inside your local environment.';
      if (onChunk) {
        onChunk(`[ERROR] ${errorMsg}`);
      }
      throw new Error(errorMsg);
    }

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPTS[capability] }
      ];

      if (capability === 'vision' && base64Image) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.1,
          max_tokens: 1536,
          stream: !!onChunk
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`NVIDIA NIM API request failed with status ${response.status}: ${errBody}`);
      }

      if (onChunk && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let done = false;

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              const cleanLine = line.trim();
              if (cleanLine.startsWith('data: ')) {
                const dataStr = cleanLine.slice(6).trim();
                if (dataStr === '[DONE]') break;
                try {
                  const dataJson = JSON.parse(dataStr);
                  const chunkText = dataJson.choices?.[0]?.delta?.content || '';
                  if (chunkText) {
                    fullText += chunkText;
                    onChunk(chunkText);
                  }
                } catch (_) {
                  // Suppress JSON chunk formatting split errors
                }
              }
            }
          }
        }

        return {
          text: fullText,
          modelUsed: model,
          latencyMs: Date.now() - startTime
        };
      } else {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        return {
          text,
          modelUsed: model,
          latencyMs: Date.now() - startTime
        };
      }
    } catch (err) {
      console.error(`NIM API error:`, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (onChunk) {
        onChunk(`\n\n[API FAILURE] ${errMsg}`);
      }
      throw err;
    }
  }
}
