export type NarrationPace = "slow" | "normal" | "fast";

export interface ScriptSettings {
  script: string;
  narrationPace: NarrationPace;
  minSceneDuration: number;
}

export type SceneStatus =
  | "LOCKED"
  | "READY"
  | "UPLOADING"
  | "SUBMITTED"
  | "GENERATING"
  | "SUCCESS"
  | "ERROR";

export interface SceneData {
  id: string;
  index: number;
  timeline: string;
  duration: number;
  narration: string;
  visualDescription: string;
  motionPrompt: string;
  imageFile?: File | null;
  imagePreviewUrl?: string | null;
  videoPath?: string | null;
  videoUrl?: string | null;
  status: SceneStatus;
  statusMessage?: string;
  progress?: number;
  eventId?: string | null;
  error?: string | null;
}

export interface StoredSceneData {
  id: string;
  index: number;
  timeline: string;
  duration: number;
  narration: string;
  visualDescription: string;
  motionPrompt: string;
  videoPath?: string | null;
  videoUrl?: string | null;
  status: SceneStatus;
}

export interface WanStartResponse {
  ok: boolean;
  eventId?: string;
  spaceUrl?: string;
  duration?: number;
  error?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warn" | "error";
  sceneIndex?: number;
  message: string;
}
