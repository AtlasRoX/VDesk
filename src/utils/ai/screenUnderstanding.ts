import { NIMClient } from './nimClient';

export interface ErrorFound {
  hasError: boolean;
  message: string;
  line?: number;
}

export interface WorkspaceAction {
  label: string;
  actionKey: string;
  data?: unknown;
}

export interface ScreenContext {
  detectedContext: 'code' | 'terminal_error' | 'dashboard_chart' | 'pdf_document' | 'browser' | 'figma_design' | 'general';
  application: 'VS Code' | 'Chrome' | 'Adobe Acrobat' | 'Terminal' | 'Figma' | 'Unknown';
  ocrText: string;
  visualAnalysis: string;
  errorFound: ErrorFound;
  availableActions: WorkspaceAction[];
  aiSuggestions: string[];
  userWorkflows: string[];
}

const VISION_INSTRUCTION = `You are the Vision Analyzer microservice.
Inspect the screen frame capture and respond STRICTLY with a valid, parseable JSON matching the following schema.
Do not output any conversational preamble or trailing remarks. Only return the JSON block.

JSON Schema:
{
  "detectedContext": "code" | "terminal_error" | "dashboard_chart" | "pdf_document" | "browser" | "figma_design" | "general",
  "application": "VS Code" | "Chrome" | "Adobe Acrobat" | "Terminal" | "Figma" | "Unknown",
  "ocrText": "string containing parsed terminal error blocks, function names, or page headlines",
  "visualAnalysis": "one-line description of the layout positions and grids",
  "errorFound": {
    "hasError": boolean,
    "message": "specific error string or log found",
    "line": number (optional)
  },
  "availableActions": [
    { "label": "string", "actionKey": "string" }
  ],
  "aiSuggestions": [
    "string"
  ],
  "userWorkflows": [
    "string"
  ]
}

Available Action Keys:
- "fix_compiler_error" (for terminal_error or code)
- "explain_code" (for code)
- "review_architecture" (for code)
- "summarize_article" (for browser)
- "fact_check" (for browser)
- "extract_insights" (for browser or pdf)
- "run_diagnostics" (for chart)
- "contrast_audit" (for design)
- "color_palette" (for design)
`;

// High-fidelity structured fallbacks for local dev (when API key is not present)
const FALLBACK_CONTEXTS: ScreenContext[] = [
  {
    detectedContext: 'code',
    application: 'VS Code',
    ocrText: `1: "use client";\n2:\n3: import React, { useState } from "react";\n4: import { WebRTCStreamingProvider } from "../utils/providers";\n5:\n6: export default function Dashboard() {\n7:   const [paired, setPaired] = useState(false);\n8:   // ...`,
    visualAnalysis: 'Active IDE workspace showing Next.js client component routes layout.',
    errorFound: { hasError: false, message: '' },
    availableActions: [
      { label: 'Explain Code Structure', actionKey: 'explain_code' },
      { label: 'Find Visual Bugs', actionKey: 'review_architecture' },
      { label: 'Generate Unit Tests', actionKey: 'explain_code' }
    ],
    aiSuggestions: [
      'Next.js 16 dynamic imports hooks should be optimized.',
      'WebRTC PeerConnection should dispose of streams in cleanup hooks.'
    ],
    userWorkflows: [
      'Analyze React 19 forwardRef properties in providers.ts',
      'Optimize state boundaries to prevent redundant cockpit sidebar renders'
    ]
  },
  {
    detectedContext: 'terminal_error',
    application: 'Terminal',
    ocrText: `Failed to compile.\n./src-tauri/src/lib.rs:45:9\nerror[E0425]: cannot find value 'AppState' in this scope\n  --> src-tauri/src/lib.rs:45:9\n   |\n45 |     let state = app.state::<AppState>();\n   |                             ^^^^^^^^ not found in this scope`,
    visualAnalysis: 'Tauri dev terminal window showing failed Cargo check output.',
    errorFound: {
      hasError: true,
      message: 'error[E0425]: cannot find value AppState in this scope',
      line: 45
    },
    availableActions: [
      { label: 'Solve Cargo Import Error', actionKey: 'fix_compiler_error' },
      { label: 'Locate AppState Struct', actionKey: 'explain_code' }
    ],
    aiSuggestions: [
      'Cargo cannot locate AppState. You need to import it from crate::lib::AppState.'
    ],
    userWorkflows: [
      'Add use crate::AppState; at the top of src-tauri/src/lib.rs',
      'Rerun cargo check to verify scope binding'
    ]
  },
  {
    detectedContext: 'browser',
    application: 'Chrome',
    ocrText: 'WebRTC API Guidelines\nWeb Real-Time Communication enables peer-to-peer audio, video, and data streaming. ICE frameworks coordinate candidates gathering across local STUN relays.',
    visualAnalysis: 'Chrome web browser active displaying WebRTC standards documentation.',
    errorFound: { hasError: false, message: '' },
    availableActions: [
      { label: 'Summarize Web Article', actionKey: 'summarize_article' },
      { label: 'Fact Check Assertions', actionKey: 'fact_check' },
      { label: 'Extract Technical Insights', actionKey: 'extract_insights' }
    ],
    aiSuggestions: [
      'Bypass STUN gatherings in local loopback mode to avoid 1.2s signaling delays.'
    ],
    userWorkflows: [
      'Toggle localhost-only USB mode inside Dashboard pairing settings',
      'Scan mobile XR pair links over high-speed USB cables'
    ]
  }
];

export class ScreenUnderstandingSystem {
  private nimClient: NIMClient;

  constructor() {
    this.nimClient = new NIMClient();
  }

  /**
   * Captures screen buffer, runs Llama 3.2 Vision classification, parses structured JSON blocks,
   * and falls back to deterministic structured contexts for local testing when keys are missing.
   */
  async analyzeScreen(base64Image: string, prompt: string = 'Inspect this screen state.'): Promise<ScreenContext> {
    const isApiKeyConfigured = typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_NIM_API_KEY;

    if (!isApiKeyConfigured) {
      console.warn('NIM API Key not configured. Loading high-fidelity local Screen Understanding mock fallback.');
      // Return a context matching prompt keywords deterministically
      const lower = prompt.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('bug')) {
        return FALLBACK_CONTEXTS[1]!; // Terminal error
      }
      if (lower.includes('browser') || lower.includes('web') || lower.includes('chrome') || lower.includes('webrtc')) {
        return FALLBACK_CONTEXTS[2]!; // Browser WebRTC
      }
      return FALLBACK_CONTEXTS[0]!; // Standard Code
    }

    try {
      const result = await this.nimClient.execute('vision', `${VISION_INSTRUCTION}\n\nUser request: "${prompt}"`, undefined, base64Image);
      
      // Clean markdown tags from response text
      let cleanedJson = result.text.trim();
      if (cleanedJson.startsWith('```')) {
        cleanedJson = cleanedJson.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      }

      const parsed: ScreenContext = JSON.parse(cleanedJson);
      return parsed;
    } catch (err) {
      console.error('Vision context parsing failed. Falling back to local default.', err);
      return FALLBACK_CONTEXTS[0]!;
    }
  }
}
