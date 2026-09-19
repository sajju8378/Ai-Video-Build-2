import React, { useState, useEffect, useRef, useCallback } from "react";
import { SceneData, ScriptSettings, LogEntry } from "./types";
import {
  loadScriptSettings,
  saveScriptSettings,
  loadStoredScenes,
  saveStoredScenes,
} from "./modules/persistence";
import { developScenesFromScript } from "./modules/sceneDeveloper";
import {
  submitWanJob,
  streamWanJob,
  getVideoProxyUrl,
} from "./modules/wanClient";
import { ScriptSection } from "./components/ScriptSection";
import { SceneCard } from "./components/SceneCard";
import { QuickTestSection } from "./components/QuickTestSection";
import { DiagnosticLog } from "./components/DiagnosticLog";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { DeployModal } from "./components/DeployModal";
import { Clapperboard, Film, Sparkles, CheckCircle2, ShieldCheck, Cpu, FolderGit2, Smartphone } from "lucide-react";

export default function App() {
  // State 1: Script settings
  const [settings, setSettings] = useState<ScriptSettings>(() => loadScriptSettings());

  // State 2: Scenes
  const [scenes, setScenes] = useState<SceneData[]>([]);

  // State 3: Active processing tracking
  const [activeGeneratingIndex, setActiveGeneratingIndex] = useState<number | null>(null);

  // State 4: Diagnostic logs
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // State 5: System status
  const [backendHealth, setBackendHealth] = useState<{
    space: string;
    hasToken: boolean;
  } | null>(null);

  // State 6: Deploy & APK modal
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  const scenesRef = useRef<SceneData[]>([]);
  scenesRef.current = scenes;

  const addLog = useCallback(
    (type: LogEntry["type"], message: string, sceneIndex?: number) => {
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        sceneIndex,
        message,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 50));
    },
    []
  );

  // Check backend and HF space connection
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setBackendHealth({
          space: data.space || "Saravutw/WAN2.2_I2V_LIGHTNING_4-8step_custom",
          hasToken: Boolean(data.hasToken),
        });
        addLog("info", `Connected to backend. Target Space: ${data.space}`);
      })
      .catch((err) => {
        addLog("warn", `Backend health check failed: ${err.message}`);
      });
  }, [addLog]);

  // Initial restoration from localStorage (NEVER triggers WAN generation)
  useEffect(() => {
    const savedScenes = loadStoredScenes();
    if (savedScenes.length > 0) {
      const restored: SceneData[] = savedScenes.map((s) => ({
        ...s,
        imageFile: null,
        imagePreviewUrl: null,
        status: s.videoUrl ? "SUCCESS" : s.index === 0 ? "READY" : "LOCKED",
        progress: s.videoUrl ? 100 : 0,
      }));
      setScenes(restored);
      addLog("info", `Restored ${restored.length} scenes from browser cache.`);
    } else if (settings.script.trim()) {
      // If script exists in localStorage, automatically develop initial scene structure
      const initial = developScenesFromScript(
        settings.script,
        settings.narrationPace,
        settings.minSceneDuration
      );
      setScenes(initial);
      addLog("info", `Initialized ${initial.length} scenes from saved script.`);
    }
  }, []); // run once on mount

  // Auto-save script settings whenever they change
  const handleScriptChange = useCallback((newSettings: ScriptSettings) => {
    setSettings(newSettings);
    saveScriptSettings(newSettings);
  }, []);

  // Develop scenes from script
  const handleDevelopScenes = useCallback(() => {
    if (!settings.script.trim()) return;

    const developed = developScenesFromScript(
      settings.script,
      settings.narrationPace,
      settings.minSceneDuration,
      scenesRef.current
    );

    setScenes(developed);
    saveStoredScenes(developed);
    addLog("info", `Developed ${developed.length} scene cards from script.`);
  }, [settings, addLog]);

  // Update a single scene's data without affecting other scenes
  const handleUpdateScene = useCallback((index: number, updates: Partial<SceneData>) => {
    setScenes((prev) => {
      const next = prev.map((scene, i) => {
        if (i === index) {
          return { ...scene, ...updates };
        }
        return scene;
      });
      saveStoredScenes(next);
      return next;
    });
  }, []);

  // Clear diagnostic logs
  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  /**
   * SEQUENTIAL SCENE GENERATION CONTROLLER (MODULE J)
   *
   * 1. Reads ONLY the selected scene's data (card[index]).
   * 2. Sets scene state to UPLOADING -> SUBMITTED -> GENERATING.
   * 3. Disables the button immediately to prevent double submission.
   * 4. Uploads scene image to HF, submits WAN job, acquires event ID.
   * 5. Streams SSE progress events.
   * 6. Extracts final video path and creates secure proxy URL.
   * 7. Sets scene state to SUCCESS and displays video player.
   * 8. UNLOCKS NEXT SCENE (index + 1) only after video is fully ready.
   * 9. If error occurs: marks ONLY this scene as ERROR, preserves all previous
   *    successful scenes, preserves script, and allows immediate retry.
   */
  const handleGenerateSceneVideo = useCallback(
    async (index: number) => {
      const targetScene = scenesRef.current[index];
      if (!targetScene) return;

      if (!targetScene.imageFile) {
        addLog("error", `ERROR: Starting image is missing for Scene ${index + 1}`, index);
        handleUpdateScene(index, {
          status: "ERROR",
          error: "ERROR: Starting image is missing. Please select an image first.",
        });
        return;
      }

      // Mark this scene as actively busy
      setActiveGeneratingIndex(index);
      handleUpdateScene(index, {
        status: "UPLOADING",
        statusMessage: "Uploading starting image to Hugging Face...",
        progress: 10,
        error: null,
      });

      addLog(
        "info",
        `Starting WAN 2.2 pipeline for Scene ${index + 1} (${targetScene.imageFile.name})`,
        index
      );

      // Combine motion prompt + visual description + narration context
      const fullPrompt = [
        targetScene.motionPrompt?.trim(),
        targetScene.visualDescription?.trim(),
      ]
        .filter(Boolean)
        .join(". ");

      try {
        // Step 1: Submit job to backend
        const { eventId, duration } = await submitWanJob({
          imageFile: targetScene.imageFile,
          prompt: fullPrompt || "high quality, cinematic motion, smooth animation",
          duration: targetScene.duration,
        });

        addLog("info", `WAN job queued successfully. Event ID: ${eventId}`, index);

        handleUpdateScene(index, {
          status: "SUBMITTED",
          eventId,
          statusMessage: "Job queued in Gradio scheduler...",
          progress: 20,
        });

        // Step 2: SSE stream monitoring
        const videoPath = await streamWanJob(eventId, (update) => {
          if (update.stage === "generating") {
            handleUpdateScene(index, {
              status: "GENERATING",
              statusMessage: update.message || "Generating video frames...",
              progress: update.percent !== undefined ? update.percent : 45,
            });
            if (update.percent && update.percent % 25 === 0) {
              addLog("info", `Progress: ${update.percent}%`, index);
            }
          }
        });

        addLog("success", `Video generation complete. Server path: ${videoPath}`, index);

        // Step 3: Video file URL
        const videoUrl = getVideoProxyUrl(videoPath);

        // Step 4: Mark THIS scene as SUCCESS and store video
        setScenes((prev) => {
          const updated = prev.map((s, i) => {
            if (i === index) {
              return {
                ...s,
                status: "SUCCESS" as const,
                statusMessage: "Video ready!",
                progress: 100,
                videoPath,
                videoUrl,
                error: null,
              };
            }
            // UNLOCK NEXT SCENE if currently locked
            if (i === index + 1 && s.status === "LOCKED") {
              return {
                ...s,
                status: "READY" as const,
              };
            }
            return s;
          });
          saveStoredScenes(updated);
          return updated;
        });

        addLog("success", `Scene ${index + 1} video ready! Unlocked Scene ${index + 2}.`, index);
      } catch (err: any) {
        const errorMsg = err.message || "Unexpected WAN generation failure";
        addLog("error", errorMsg, index);

        // Only THIS scene is marked as ERROR. Previous scenes remain SUCCESS. Next remain LOCKED.
        handleUpdateScene(index, {
          status: "ERROR",
          statusMessage: "Generation failed",
          error: errorMsg,
          progress: 0,
        });
      } finally {
        setActiveGeneratingIndex(null);
      }
    },
    [addLog, handleUpdateScene]
  );

  // Helper to determine if a scene is unlocked
  const isSceneUnlocked = (index: number): boolean => {
    if (index === 0) return true;
    const prevScene = scenes[index - 1];
    return Boolean(prevScene && (prevScene.status === "SUCCESS" || prevScene.videoUrl));
  };

  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
  const completedScenesCount = scenes.filter((s) => s.status === "SUCCESS" || s.videoUrl).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation / Brand Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-600/30 border border-indigo-400/30">
              <Clapperboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                AI VIDEO SCRIPT STUDIO
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  WAN 2.2 I2V
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Sequential Script-to-Video Production • Scene Progression Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {backendHealth && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Space:</span>
                <span className="text-slate-300 font-mono text-[11px] truncate max-w-[170px]" title={backendHealth.space}>
                  {backendHealth.space.split("/").pop()}
                </span>
                {backendHealth.hasToken && (
                  <span className="flex items-center text-emerald-400 text-[10px] gap-0.5" title="HF Token Active">
                    <ShieldCheck className="w-3 h-3" /> Token
                  </span>
                )}
              </div>
            )}

            {scenes.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-300">
                <Film className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {completedScenesCount} / {scenes.length} Videos
                </span>
                <span className="text-slate-500">•</span>
                <span>{Math.round(totalDuration * 10) / 10}s total</span>
              </div>
            )}

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Deploy & APK Build Action */}
            <button
              onClick={() => setIsDeployModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 text-white font-medium text-xs shadow-sm transition border border-indigo-400/40 cursor-pointer"
              title="Open GitHub Pages & APK Build Center"
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>Deploy / APK</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Module A-C: Complete Script Section */}
        <ScriptSection
          settings={settings}
          onChange={handleScriptChange}
          onDevelopScenes={handleDevelopScenes}
          hasScenes={scenes.length > 0}
        />

        {/* Module D-J: Scene Progression & Video Generation */}
        {scenes.length > 0 && (
          <section id="scenes-section" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-400 text-sm font-semibold border border-indigo-500/30">
                    2
                  </span>
                  Sequential Scene Production
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scenes generate sequentially. Scene N unlocks automatically when Scene N-1 completes.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Pipeline Status:</span>
                <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-medium">
                  {completedScenesCount === scenes.length
                    ? "All Scenes Rendered 🎉"
                    : activeGeneratingIndex !== null
                    ? `Generating Scene ${activeGeneratingIndex + 1}...`
                    : `Next Up: Scene ${completedScenesCount + 1}`}
                </span>
              </div>
            </div>

            {/* Scene Cards List */}
            <div className="space-y-5">
              {scenes.map((scene, idx) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  isUnlocked={isSceneUnlocked(idx)}
                  isProcessingAny={activeGeneratingIndex !== null}
                  onUpdateScene={handleUpdateScene}
                  onGenerateVideo={handleGenerateSceneVideo}
                />
              ))}
            </div>
          </section>
        )}

        {/* Diagnostic Quick Test Section (Protected independent module) */}
        <section id="diagnostic-tools" className="space-y-4 pt-4 border-t border-slate-800/80">
          <QuickTestSection />
          <DiagnosticLog logs={logs} onClearLogs={handleClearLogs} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AI Video Script Studio • Powered by WAN 2.2 Image-to-Video Lightning</span>
          <span className="text-slate-600">Strict Module Isolation &amp; Zero-Regression Pipeline</span>
        </div>
      </footer>

      {/* Deploy & APK Modal */}
      <DeployModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
      />
    </div>
  );
}
