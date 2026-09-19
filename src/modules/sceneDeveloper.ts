// MODULE D — Scene Development
import { NarrationPace, SceneData } from "../types";
import { getWordCount } from "./scriptReader";

const DEFAULT_MOTION_PROMPT =
  "natural character movement, subtle head and eye movement, natural environmental motion, smooth cinematic camera movement, high quality, high resolution";

/**
 * Words per minute reference rates based on voiceover pacing
 */
const WORDS_PER_MINUTE: Record<NarrationPace, number> = {
  slow: 125,
  normal: 155,
  fast: 190,
};

/**
 * Calculates scene duration from word count, pace, and minimum threshold.
 * Clamps result strictly between 2.0 and 10.0 seconds (supported WAN 2.2 range).
 */
export function calculateSceneDuration(
  wordCount: number,
  pace: NarrationPace,
  minDuration: number
): number {
  const wpm = WORDS_PER_MINUTE[pace] || 155;
  const wordsPerSecond = wpm / 60;
  const estimatedSeconds = wordCount > 0 ? wordCount / wordsPerSecond : minDuration;
  const targetDuration = Math.max(minDuration, estimatedSeconds);

  // Clamp within WAN 2.2 Lightning bounds (2.0s to 10.0s)
  const clamped = Math.min(10.0, Math.max(2.0, targetDuration));
  return Math.round(clamped * 10) / 10;
}

/**
 * Format seconds into mm:ss timestamp display
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Splits raw script into distinct narrative scene chunks.
 * Handles paragraphs, sentence groupings, and numbered lists.
 */
function splitScriptIntoChunks(script: string): string[] {
  const trimmed = script.trim();
  if (!trimmed) return [];

  // Check if user has paragraph breaks (double newline)
  const paragraphs = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    return paragraphs;
  }

  // Check for line-by-line breaks (e.g. Scene 1:, or newline lists)
  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 1 && lines.length <= 15) {
    return lines;
  }

  // Otherwise split by sentence boundaries, grouping roughly 15-30 words per scene
  const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [trimmed];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;
    if (!currentChunk) {
      currentChunk = s;
    } else {
      const combined = `${currentChunk} ${s}`;
      if (getWordCount(combined) <= 35) {
        currentChunk = combined;
      } else {
        chunks.push(currentChunk);
        currentChunk = s;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [trimmed];
}

/**
 * Generates an initial visual description from the scene's narration text
 */
function generateVisualDescription(narration: string, sceneIndex: number): string {
  const clean = narration.replace(/\s+/g, " ").trim();
  const preview = clean.length > 90 ? clean.slice(0, 90) + "..." : clean;
  return `Cinematic shot for Scene ${sceneIndex + 1}: ${preview}. High detail, photorealistic lighting, 8k resolution.`;
}

/**
 * Converts script text into scene cards deterministically.
 * Merges with existing scene state (e.g. user-uploaded images, videos, manual prompt edits).
 */
export function developScenesFromScript(
  script: string,
  pace: NarrationPace,
  minSceneDuration: number,
  existingScenes: SceneData[] = []
): SceneData[] {
  const chunks = splitScriptIntoChunks(script);
  if (chunks.length === 0) return [];

  let cumulativeTime = 0;

  return chunks.map((chunk, i) => {
    const existing = existingScenes[i];
    const wordCount = getWordCount(chunk);
    const duration = calculateSceneDuration(wordCount, pace, minSceneDuration);

    const startTime = cumulativeTime;
    const endTime = cumulativeTime + duration;
    cumulativeTime = endTime;

    const timeline = `${formatTime(startTime)} - ${formatTime(endTime)}`;

    // If an existing scene at this index already has user edits or files, preserve them
    const narration = chunk;
    const visualDescription =
      existing?.visualDescription && existing.narration === narration
        ? existing.visualDescription
        : generateVisualDescription(narration, i);

    const motionPrompt = existing?.motionPrompt || DEFAULT_MOTION_PROMPT;

    // Status logic:
    // Scene 0 is unlocked by default.
    // Subsequent scenes are locked unless the previous scene has succeeded.
    let status = existing?.status || (i === 0 ? "READY" : "LOCKED");
    if (existing?.videoUrl) {
      status = "SUCCESS";
    }

    return {
      id: existing?.id || `scene-${i + 1}-${Date.now()}`,
      index: i,
      timeline,
      duration,
      narration,
      visualDescription,
      motionPrompt,
      imageFile: existing?.imageFile || null,
      imagePreviewUrl: existing?.imagePreviewUrl || null,
      videoPath: existing?.videoPath || null,
      videoUrl: existing?.videoUrl || null,
      status,
      statusMessage: existing?.statusMessage,
      progress: existing?.progress || 0,
      eventId: existing?.eventId || null,
      error: existing?.error || null,
    };
  });
}
