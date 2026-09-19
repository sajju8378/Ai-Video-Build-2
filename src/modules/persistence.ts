// MODULE C — Script Persistence & MODULE E — Scene State Persistence
import { ScriptSettings, StoredSceneData, SceneData } from "../types";

const SCRIPT_STORAGE_KEY = "aiVideoScriptStudioStateV2";
const SCENE_STORAGE_KEY = "aiVideoSceneStateV1";

export function loadScriptSettings(): ScriptSettings {
  try {
    const raw = localStorage.getItem(SCRIPT_STORAGE_KEY);
    if (!raw) {
      return {
        script: "",
        narrationPace: "normal",
        minSceneDuration: 3.5,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      script: typeof parsed.script === "string" ? parsed.script : "",
      narrationPace: ["slow", "normal", "fast"].includes(parsed.narrationPace)
        ? parsed.narrationPace
        : "normal",
      minSceneDuration:
        typeof parsed.minSceneDuration === "number" && !isNaN(parsed.minSceneDuration)
          ? Math.max(2, Math.min(10, parsed.minSceneDuration))
          : 3.5,
    };
  } catch (e) {
    console.warn("Failed to load script settings from localStorage", e);
    return {
      script: "",
      narrationPace: "normal",
      minSceneDuration: 3.5,
    };
  }
}

export function saveScriptSettings(settings: ScriptSettings): void {
  try {
    localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save script settings to localStorage", e);
  }
}

export function loadStoredScenes(): StoredSceneData[] {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (e) {
    console.warn("Failed to load stored scenes from localStorage", e);
    return [];
  }
}

export function saveStoredScenes(scenes: SceneData[]): void {
  try {
    const serializable: StoredSceneData[] = scenes.map((s) => ({
      id: s.id,
      index: s.index,
      timeline: s.timeline,
      duration: s.duration,
      narration: s.narration,
      visualDescription: s.visualDescription,
      motionPrompt: s.motionPrompt,
      videoPath: s.videoPath || null,
      videoUrl: s.videoUrl || null,
      status: s.status === "UPLOADING" || s.status === "SUBMITTED" || s.status === "GENERATING"
        ? (s.videoUrl ? "SUCCESS" : "READY")
        : s.status,
    }));
    localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.warn("Failed to save scenes to localStorage", e);
  }
}
