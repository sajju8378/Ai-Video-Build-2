import React, { useRef } from "react";
import { SceneData, SceneStatus } from "../types";
import {
  Upload,
  Lock,
  CheckCircle2,
  AlertCircle,
  Video,
  Download,
  Clock,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  Key,
  Sliders,
  Zap,
} from "lucide-react";

interface SceneCardProps {
  scene: SceneData;
  isUnlocked: boolean;
  isProcessingAny: boolean;
  onUpdateScene: (index: number, updates: Partial<SceneData>) => void;
  onGenerateVideo: (index: number) => void;
  onOpenSettings?: () => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  isUnlocked,
  isProcessingAny,
  onUpdateScene,
  onGenerateVideo,
  onOpenSettings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBusy =
    scene.status === "UPLOADING" ||
    scene.status === "SUBMITTED" ||
    scene.status === "GENERATING";

  const isReadyToGenerate =
    isUnlocked && !isBusy && Boolean(scene.imageFile || scene.imagePreviewUrl);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    onUpdateScene(scene.index, {
      imageFile: file,
      imagePreviewUrl: previewUrl,
      status: scene.status === "ERROR" || scene.status === "LOCKED" ? "READY" : scene.status,
      error: null,
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isUnlocked || isBusy) return;

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      onUpdateScene(scene.index, {
        imageFile: file,
        imagePreviewUrl: previewUrl,
        status: scene.status === "ERROR" || scene.status === "LOCKED" ? "READY" : scene.status,
        error: null,
      });
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleRemoveImage = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    onUpdateScene(scene.index, {
      imageFile: null,
      imagePreviewUrl: null,
    });
  };

  const getStatusBadge = () => {
    if (!isUnlocked) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
          <Lock className="w-3 h-3" /> Locked
        </span>
      );
    }
    if (scene.status === "SUCCESS") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/80">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Video Ready
        </span>
      );
    }
    if (scene.status === "ERROR") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/70 text-rose-300 border border-rose-800/80">
          <AlertCircle className="w-3 h-3 text-rose-400" /> Generation Error
        </span>
      );
    }
    if (isBusy) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-950/70 text-indigo-300 border border-indigo-800/80 animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" /> {scene.status}
        </span>
      );
    }
    if (scene.imageFile || scene.imagePreviewUrl) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950/70 text-blue-300 border border-blue-800/80">
          <CheckCircle2 className="w-3 h-3 text-blue-400" /> Image Loaded
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/50 text-amber-300 border border-amber-800/60">
        Needs Image
      </span>
    );
  };

  return (
    <div
      id={`scene-card-${scene.index}`}
      className={`scene border rounded-xl p-5 transition-all ${
        !isUnlocked
          ? "bg-slate-900/40 border-slate-800/50 opacity-70"
          : scene.status === "SUCCESS"
          ? "bg-slate-900 border-emerald-500/30 shadow-lg shadow-emerald-950/10"
          : scene.status === "ERROR"
          ? "bg-slate-900 border-rose-500/40 shadow-lg shadow-rose-950/10"
          : isBusy
          ? "bg-slate-900 border-indigo-500/50 ring-1 ring-indigo-500/20 shadow-xl"
          : "bg-slate-900 border-slate-800 shadow-lg"
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 text-sm font-semibold border border-indigo-500/30">
            {scene.index + 1}
          </span>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Scene {scene.index + 1}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" /> {scene.timeline}
              </span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Duration:</span>
                {[3.5, 4.0, 5.0].map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    disabled={isBusy}
                    onClick={() => onUpdateScene(scene.index, { duration: dur })}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      Math.abs(scene.duration - dur) < 0.2
                        ? "bg-indigo-600 text-white font-bold"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    }`}
                    title={`Set duration to ${dur}s for Scene ${scene.index + 1}`}
                  >
                    {dur}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>{getStatusBadge()}</div>
      </div>

      {/* Main Grid: Left inputs & Prompts, Right: Image & Video Player */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Narration, Visual, Motion Prompts */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Narration Script */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Scene Script / Narration
            </label>
            <textarea
              className="sceneScript w-full bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              rows={2}
              value={scene.narration}
              onChange={(e) => onUpdateScene(scene.index, { narration: e.target.value })}
              placeholder="Script or voiceover for this scene..."
              disabled={isBusy}
            />
          </div>

          {/* Visual Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Visual Description
            </label>
            <textarea
              className="sceneVisual w-full bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              rows={2}
              value={scene.visualDescription}
              onChange={(e) => onUpdateScene(scene.index, { visualDescription: e.target.value })}
              placeholder="Key visual elements and artistic atmosphere..."
              disabled={isBusy}
            />
          </div>

          {/* Motion Prompt */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>Motion Prompt (WAN 2.2)</span>
              <span className="text-[11px] text-slate-500">Camera & subject motion</span>
            </label>
            <textarea
              className="sceneMotion w-full bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
              rows={2}
              value={scene.motionPrompt}
              onChange={(e) => onUpdateScene(scene.index, { motionPrompt: e.target.value })}
              placeholder="E.g. smooth dolly forward, character looks up, cinematic camera..."
              disabled={isBusy}
            />
          </div>
        </div>

        {/* Right Column: Starting Image & Output Video */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
          {/* Starting Image Zone */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>Starting Image for Scene {scene.index + 1}</span>
              {scene.imagePreviewUrl && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-[11px] text-rose-400 hover:underline"
                  disabled={isBusy}
                >
                  Change Image
                </button>
              )}
            </label>

            {scene.imagePreviewUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center group">
                <img
                  src={scene.imagePreviewUrl}
                  alt={`Scene ${scene.index + 1} starting frame`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1 bg-slate-900/90 text-white rounded text-xs hover:bg-slate-800"
                    disabled={isBusy}
                  >
                    Replace Image
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => isUnlocked && !isBusy && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 aspect-video flex flex-col items-center justify-center text-center transition-all ${
                  !isUnlocked
                    ? "border-slate-800 bg-slate-950/30 cursor-not-allowed text-slate-600"
                    : isBusy
                    ? "border-slate-800 bg-slate-950/30 cursor-wait text-slate-500"
                    : "border-slate-700 hover:border-indigo-500/80 bg-slate-950/60 hover:bg-slate-950 cursor-pointer text-slate-400"
                }`}
              >
                <Upload className="w-6 h-6 mb-1.5 opacity-60" />
                <span className="text-xs font-medium">
                  {isUnlocked ? "Click or drag starting image here" : "Unlock scene first"}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">PNG, JPG or WebP</span>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sceneImage hidden"
              onChange={handleImageFileChange}
              disabled={!isUnlocked || isBusy}
            />
          </div>

          {/* Generated Video Player (if available) */}
          {scene.videoUrl && (
            <div className="rounded-lg overflow-hidden border border-emerald-600/30 bg-black aspect-video flex flex-col justify-center relative shadow-md">
              <video
                src={scene.videoUrl}
                controls
                className="w-full h-full object-contain"
                playsInline
                preload="metadata"
              />
            </div>
          )}
        </div>
      </div>

      {/* Progress or Error Banner */}
      {isBusy && (
        <div className="mt-4 p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/50">
          <div className="flex items-center justify-between text-xs text-indigo-300 mb-1.5">
            <span className="font-medium flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
              {scene.statusMessage || "Processing WAN 2.2 Image-to-Video generation..."}
            </span>
            {scene.progress !== undefined && scene.progress > 0 && (
              <span className="font-mono font-bold">{scene.progress}%</span>
            )}
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(5, scene.progress || 10)}%` }}
            />
          </div>
        </div>
      )}

      {scene.error && (
        <div className="mt-4 p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs space-y-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-rose-200">Generation Failed</div>
              <div className="text-[11px] text-rose-300/90 mt-0.5 font-mono break-words leading-relaxed">
                {scene.error}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-900/40">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                onUpdateScene(scene.index, { duration: 3.5, error: null });
                setTimeout(() => onGenerateVideo(scene.index), 50);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-sm cursor-pointer transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              Auto-Fix &amp; Retry (3.5s Safe Mode)
            </button>

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 cursor-pointer transition-colors"
              >
                <Key className="w-3 h-3 text-indigo-400" />
                Configure Free HF Token
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {!isUnlocked
            ? `Scene ${scene.index + 1} will unlock automatically when Scene ${scene.index} succeeds.`
            : !scene.imagePreviewUrl
            ? "Upload a starting image to enable video generation."
            : scene.videoUrl
            ? "Video generation complete."
            : "Ready to submit WAN 2.2 generation job."}
        </div>

        <div className="flex items-center gap-2">
          {scene.videoUrl && (
            <a
              href={scene.videoUrl}
              download={`scene_${scene.index + 1}_wan2.mp4`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download Scene {scene.index + 1} Video
            </a>
          )}

          <button
            type="button"
            data-index={scene.index}
            disabled={!isReadyToGenerate || (isProcessingAny && !isBusy)}
            onClick={() => onGenerateVideo(scene.index)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              !isUnlocked
                ? "bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed"
                : isBusy
                ? "bg-indigo-700 text-white cursor-wait opacity-90 animate-pulse"
                : !isReadyToGenerate
                ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                : scene.status === "SUCCESS"
                ? "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-pointer"
                : scene.status === "ERROR"
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-900/30 cursor-pointer"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/30 active:scale-[0.98] cursor-pointer"
            }`}
          >
            {isBusy ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Generating Scene {scene.index + 1}...
              </>
            ) : scene.status === "SUCCESS" ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Re-Generate Scene {scene.index + 1}
              </>
            ) : scene.status === "ERROR" ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Scene {scene.index + 1} Video
              </>
            ) : (
              <>
                <Video className="w-3.5 h-3.5" />
                Generate Scene {scene.index + 1} Video
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
