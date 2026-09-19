import React, { useState, useRef } from "react";
import { submitWanJob, streamWanJob, getVideoProxyUrl } from "../modules/wanClient";
import { Wrench, Upload, Video, RefreshCw, CheckCircle2, AlertCircle, Download } from "lucide-react";

export const QuickTestSection: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(
    "A stunning camera pan across a futuristic neon city at twilight, cinematic lighting, high quality 8k"
  );
  const [duration, setDuration] = useState(3.5);
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setErrorMessage(null);
  };

  const handleRunQuickTest = async () => {
    if (!imageFile) {
      setErrorMessage("ERROR: Starting image is missing.");
      return;
    }

    setStatus("busy");
    setStatusMessage("Submitting to WAN 2.2...");
    setProgress(5);
    setErrorMessage(null);
    setVideoUrl(null);

    try {
      const { eventId } = await submitWanJob({
        imageFile,
        prompt,
        duration,
      });

      setStatusMessage("WAN job queued, streaming events...");
      setProgress(15);

      const videoPath = await streamWanJob(eventId, (update) => {
        if (update.message) setStatusMessage(update.message);
        if (update.percent !== undefined) setProgress(update.percent);
      });

      const finalUrl = getVideoProxyUrl(videoPath);
      setVideoUrl(finalUrl);
      setStatus("success");
      setStatusMessage("Video generated successfully!");
      setProgress(100);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Quick test failed.");
      setStatusMessage("Failed.");
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/40">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Quick WAN 2.2 Scene Test
              <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Diagnostic Tool
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Directly verify Hugging Face WAN 2.2 connection and video generation independently of the main script.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-indigo-400">
          {isOpen ? "Collapse" : "Expand"}
        </span>
      </button>

      {isOpen && (
        <div className="p-6 border-t border-slate-800/80 bg-slate-950/40 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: Input file and parameters */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Test Image
                </label>
                {imagePreview ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
                    <img src={imagePreview} alt="Test frame" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={status === "busy"}
                      className="absolute bottom-2 right-2 px-2.5 py-1 bg-black/70 text-white rounded text-xs hover:bg-black"
                    >
                      Change Image
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-lg p-5 aspect-video flex flex-col items-center justify-center text-center cursor-pointer bg-slate-950/60"
                  >
                    <Upload className="w-6 h-6 text-slate-400 mb-1.5" />
                    <span className="text-xs font-medium text-slate-300">
                      Upload any image for quick test
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5">PNG / JPG</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFile}
                  disabled={status === "busy"}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Test Prompt
                </label>
                <textarea
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={status === "busy"}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Duration ({duration}s)
                </label>
                <input
                  type="range"
                  min={2}
                  max={10}
                  step={0.5}
                  value={duration}
                  onChange={(e) => setDuration(parseFloat(e.target.value))}
                  disabled={status === "busy"}
                  className="w-full accent-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleRunQuickTest}
                disabled={status === "busy" || !imageFile}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  status === "busy"
                    ? "bg-indigo-700 text-white cursor-wait animate-pulse"
                    : !imageFile
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/30 cursor-pointer"
                }`}
              >
                {status === "busy" ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Testing WAN 2.2 Generation...
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5" />
                    Run Diagnostic WAN 2.2 Test
                  </>
                )}
              </button>
            </div>

            {/* Right: Output result */}
            <div className="space-y-3 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Diagnostic Output
                </label>
                {videoUrl ? (
                  <div className="rounded-lg overflow-hidden border border-emerald-600/40 bg-black aspect-video flex flex-col justify-center">
                    <video src={videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/80 aspect-video flex flex-col items-center justify-center p-4 text-center">
                    {status === "busy" ? (
                      <div className="space-y-2 w-full max-w-xs">
                        <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mx-auto" />
                        <div className="text-xs font-medium text-slate-300">{statusMessage}</div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-1.5 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        Generated video will appear here when complete.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="font-mono break-all">{errorMessage}</div>
                </div>
              )}

              {videoUrl && (
                <a
                  href={videoUrl}
                  download="quick_test_wan2.mp4"
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium border border-slate-700 flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Download Test Video
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
