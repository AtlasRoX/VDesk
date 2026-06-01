/**
 * Workspace Intelligence Engine.
 * Evaluates live telemetry metrics, process markers, keystroke frequencies, and OCR content
 * to classify workspace activity into 8 distinct categories. Maps classifications quietly
 * to precise ergonomic layout adjustments.
 */

export type ActivityType =
  | 'coding'
  | 'research'
  | 'reading'
  | 'writing'
  | 'meetings'
  | 'design'
  | 'watching'
  | 'learning';

export interface IntelligenceSignals {
  processName: string; // e.g. "code", "chrome", "zoom", "figma"
  windowTitle: string; // e.g. "lib.rs - vr-desk", "Wikipedia", "Coursera Lecture"
  ocrTokens: string[]; // parsed text words from active vision layer
  keypressWpm: number; // estimated keystroke density
  mediaPlaying: boolean;
  bandwidthMbps: number;
  fps: number;
  latencyMs: number;
  packetLoss: number;
}

export interface WorkspaceAdjustments {
  scale: number;
  distance: number;
  curvature: number;
  heightOffset: number;
  tilt: number;
  sharpenStrength: number;
  environmentMode: 'void' | 'workspace' | 'space' | 'cinema';
  readingMode: boolean;
  focusMode: boolean;
  supersampling: number;
  hdrEnabled: boolean;
  exposure: number;
}

export interface ActivityClassification {
  activity: ActivityType;
  confidence: number; // 0.0 to 1.0
  adjustments: WorkspaceAdjustments;
  reason: string;
}

// Ergonomic adjustments corresponding to each classified activity
export const ACTIVITY_ADJUSTMENTS: Record<ActivityType, WorkspaceAdjustments> = {
  coding: {
    scale: 1.0,
    distance: 1.8,
    curvature: 2.0,
    heightOffset: 0.0,
    tilt: 0,
    sharpenStrength: 0.70,
    environmentMode: 'workspace',
    readingMode: false,
    focusMode: false,
    supersampling: 1.2,
    hdrEnabled: false,
    exposure: 1.2
  },
  research: {
    scale: 1.0,
    distance: 2.2,
    curvature: 0.0, // Flat screen prevents visual skewing during research reading
    heightOffset: 0.1,
    tilt: 0,
    sharpenStrength: 0.30,
    environmentMode: 'workspace',
    readingMode: false,
    focusMode: false,
    supersampling: 1.0,
    hdrEnabled: false,
    exposure: 1.0
  },
  reading: {
    scale: 1.1,
    distance: 2.0,
    curvature: 0.0,
    heightOffset: 0.2,
    tilt: 0,
    sharpenStrength: 0.75, // Max text sharpness
    environmentMode: 'void',
    readingMode: true,
    focusMode: true, // Pure focus surround
    supersampling: 1.2,
    hdrEnabled: true,
    exposure: 0.85 // Dimmed to prevent eye strain
  },
  writing: {
    scale: 1.0,
    distance: 1.9,
    curvature: 2.5,
    heightOffset: 0.0,
    tilt: 0,
    sharpenStrength: 0.30,
    environmentMode: 'workspace',
    readingMode: false,
    focusMode: false,
    supersampling: 1.0,
    hdrEnabled: false,
    exposure: 1.0
  },
  meetings: {
    scale: 1.25, // Large screen for shared video
    distance: 2.4,
    curvature: 0.0,
    heightOffset: 0.2,
    tilt: 0,
    sharpenStrength: 0.20,
    environmentMode: 'workspace',
    readingMode: false,
    focusMode: false,
    supersampling: 1.0,
    hdrEnabled: false,
    exposure: 1.0
  },
  design: {
    scale: 1.0, // Strict geometry alignment
    distance: 2.0,
    curvature: 0.0,
    heightOffset: 0.0,
    tilt: 0,
    sharpenStrength: 0.0, // Zero sharpening to prevent pixel distortions
    environmentMode: 'workspace',
    readingMode: false,
    focusMode: false,
    supersampling: 1.3, // High supersampling for color accuracy
    hdrEnabled: true, // HDR active for color grading
    exposure: 1.2
  },
  watching: {
    scale: 1.8, // Cinema screen scale
    distance: 3.5,
    curvature: 4.0,
    heightOffset: 0.4,
    tilt: -5, // Slight tilt downward
    sharpenStrength: 0.10,
    environmentMode: 'cinema',
    readingMode: false,
    focusMode: false,
    supersampling: 1.2,
    hdrEnabled: true,
    exposure: 1.3
  },
  learning: {
    scale: 1.1,
    distance: 2.0,
    curvature: 2.0,
    heightOffset: 0.1,
    tilt: -2,
    sharpenStrength: 0.60,
    environmentMode: 'workspace',
    readingMode: false,
    focusMode: true, // Focused ambient lighting active
    supersampling: 1.1,
    hdrEnabled: false,
    exposure: 1.1
  }
};

/**
 * Calculates a confidence vector and outputs the most highly matched activity classification.
 */
export function classifyWorkspaceActivity(signals: IntelligenceSignals): ActivityClassification {
  const scores: Record<ActivityType, number> = {
    coding: 0,
    research: 0,
    reading: 0,
    writing: 0,
    meetings: 0,
    design: 0,
    watching: 0,
    learning: 0
  };

  const process = signals.processName.toLowerCase();
  const title = signals.windowTitle.toLowerCase();
  const ocrText = signals.ocrTokens.join(' ').toLowerCase();

  // --- Rule 1: Process Matches ---
  if (process.includes('code') || process.includes('rustrover') || process.includes('idea') || process.includes('terminal') || process.includes('cmd')) {
    scores.coding += 0.50;
  }
  if (process.includes('zoom') || process.includes('teams') || process.includes('meet') || process.includes('slack') || process.includes('discord')) {
    scores.meetings += 0.55;
  }
  if (process.includes('figma') || process.includes('photoshop') || process.includes('illustrator') || process.includes('blender') || process.includes('canva')) {
    scores.design += 0.50;
  }
  if (process.includes('vlc') || process.includes('youtube') || process.includes('netflix') || process.includes('mpv')) {
    scores.watching += 0.45;
  }
  if (process.includes('chrome') || process.includes('firefox') || process.includes('safari') || process.includes('browser')) {
    // Web browsers are multi-use, split weight softly
    scores.research += 0.15;
    scores.reading += 0.10;
    scores.learning += 0.10;
  }
  if (process.includes('word') || process.includes('notion') || process.includes('googledocs') || process.includes('obsidian')) {
    scores.writing += 0.40;
  }

  // --- Rule 2: Title and Keywords ---
  const checkKeywords = (text: string) => {
    // Coding
    if (text.includes('lib.rs') || text.includes('.rs') || text.includes('.ts') || text.includes('.py') || text.includes('compiler') || text.includes('debugging') || text.includes('git')) {
      scores.coding += 0.35;
    }
    // Meetings
    if (text.includes('join meeting') || text.includes('teams call') || text.includes('zoom meeting') || text.includes('huddle') || text.includes('standup')) {
      scores.meetings += 0.40;
    }
    // Watching
    if (text.includes('youtube') || text.includes('trailer') || text.includes('movie') || text.includes('play') || text.includes('watch')) {
      scores.watching += 0.35;
    }
    // Design
    if (text.includes('figma') || text.includes('ui/ux') || text.includes('prototype') || text.includes('frame') || text.includes('canvas') || text.includes('vector')) {
      scores.design += 0.35;
    }
    // Writing
    if (text.includes('draft') || text.includes('document') || text.includes('essay') || text.includes('chapter') || text.includes('writing') || text.includes('notion')) {
      scores.writing += 0.35;
    }
    // Research
    if (text.includes('arxiv') || text.includes('wikipedia') || text.includes('abstract') || text.includes('pdf') || text.includes('paper') || text.includes('research')) {
      scores.research += 0.40;
    }
    // Learning
    if (text.includes('coursera') || text.includes('lecture') || text.includes('syllabus') || text.includes('udemy') || text.includes('course') || text.includes('learn')) {
      scores.learning += 0.45;
    }
    // Reading
    if (text.includes('book') || text.includes('kindle') || text.includes('novel') || text.includes('chapter') || text.includes('page')) {
      scores.reading += 0.30;
    }
  };

  checkKeywords(title);
  checkKeywords(ocrText);

  // --- Rule 3: Typing rate / signals ---
  if (signals.keypressWpm > 30) {
    scores.writing += 0.20;
    scores.coding += 0.15;
    scores.learning += 0.10;
  } else if (signals.keypressWpm > 0 && signals.keypressWpm <= 10) {
    scores.research += 0.15;
    scores.reading += 0.20;
    scores.design += 0.10;
  }

  // --- Rule 4: System streaming states ---
  if (signals.mediaPlaying) {
    scores.watching += 0.40;
  }
  if (signals.fps > 55 && !signals.mediaPlaying) {
    // Zoom/Meet calls typically push high steady framerates
    scores.meetings += 0.15;
  }

  // Find highest classified score
  let maxActivity = 'research' as ActivityType;
  let maxScore = 0;

  (Object.keys(scores) as ActivityType[]).forEach((act) => {
    if (scores[act] > maxScore) {
      maxScore = scores[act];
      maxActivity = act;
    }
  });

  // Calculate normalized confidence score
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const confidence = Math.min(1.0, Math.max(0.1, maxScore / (maxScore + 0.3))); // Softmax estimation bounds

  // Formulate human reason
  let reason = '';
  switch (maxActivity as ActivityType) {
    case 'coding':
      reason = 'Detected code syntax tokens and standard active IDE terminals.';
      break;
    case 'watching':
      reason = 'Active media slot streaming and video frame rate updates identified.';
      break;
    case 'meetings':
      reason = 'Audio channel streaming paired with active meetings windows.';
      break;
    case 'design':
      reason = 'Graphics editor tools and coordinates grids visible.';
      break;
    case 'writing':
      reason = 'High steady text typing inputs and page drafting panels active.';
      break;
    case 'research':
      reason = 'Static document scrolling sequences matching web search contexts.';
      break;
    case 'learning':
      reason = 'Lecture syllables and split course instructions detected.';
      break;
    case 'reading':
      reason = 'Kindle novels formatting matching focus parameters.';
      break;
  }

  return {
    activity: maxActivity,
    confidence: Math.round(confidence * 100) / 100,
    adjustments: ACTIVITY_ADJUSTMENTS[maxActivity],
    reason
  };
}
