import React, { useRef } from "react";
import { NarrationPace, ScriptSettings } from "../types";
import { getWordCount } from "../modules/scriptReader";
import { Play, Sparkles, RotateCcw } from "lucide-react";

interface ScriptSectionProps {
  settings: ScriptSettings;
  onChange: (next: ScriptSettings) => void;
  onDevelopScenes: () => void;
  hasScenes: boolean;
}

const SAMPLE_SCRIPTS = [
  {
    title: "Cinematic Sci-Fi (English)",
    text: `Deep beneath the Martian permafrost, Dr. Alyssa Chen uncovers a monolithic crystal humming with quantum resonance.

As her robotic probe scans the surface, the crystal pulses with azure luminescence, projecting holographic star charts across the subterranean cavern.

She realizes the coordinates point not outwards to the stars, but directly back to Earth's primordial oceans.`,
  },
  {
    title: "Nature & Heritage (Telugu)",
    text: `సూర్యోదయపు వెలుగులు తూర్పు కొండలపై మెరుస్తుండగా, పచ్చని లోయలో ఒక పురాతన ఆలయం దర్శనమిస్తుంది.

నదీ తీరాన గాలికి ఊగే తాటి చెట్లు, ప్రకృతి సోయగాలు కనువిందు చేస్తున్నాయి.

ప్రశాంతమైన గ్రామీణ వాతావరణంలో పక్షుల కిలకిలారావాలతో కొత్త రోజు ప్రారంభమైంది.`,
  },
];

export const ScriptSection: React.FC<ScriptSectionProps> = ({
  settings,
  onChange,
  onDevelopScenes,
  hasScenes,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wordCount = getWordCount(settings.script);
  const isScriptEmpty = wordCount === 0;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Authoritative source is e.target.value
    const val = e.target.value;
    onChange({
      ...settings,
      script: val,
    });
  };

  const handlePaceChange = (pace: NarrationPace) => {
    onChange({
      ...settings,
      narrationPace: pace,
    });
  };

  const handleMinDurationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...settings,
      minSceneDuration: parseFloat(e.target.value),
    });
  };

  const handleLoadSample = (sampleText: string) => {
    onChange({
      ...settings,
      script: sampleText,
    });
  };

  const handleClear = () => {
    onChange({
      ...settings,
      script: "",
    });
  };

  return (
    <div id="script-section" className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-400 text-sm font-semibold border border-indigo-500/30">
              1
            </span>
            Your Script
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Paste or compose your complete multi-scene narrative. Supports multilingual and Unicode text.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div
            id="script-word-counter"
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              isScriptEmpty
                ? "bg-slate-800/80 text-slate-400 border-slate-700"
                : "bg-indigo-950/60 text-indigo-300 border-indigo-800/60"
            }`}
          >
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </div>

          {settings.script && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Clear script"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Textarea */}
      <div className="mt-4">
        <textarea
          id="script-input-textarea"
          ref={textareaRef}
          value={settings.script}
          onChange={handleTextChange}
          placeholder="Paste your video script here... (e.g. paragraph by paragraph, or narrative breakdown)"
          rows={7}
          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-4 text-slate-200 placeholder-slate-500 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-y"
        />
      </div>

      {/* Samples */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Quick templates:</span>
        {SAMPLE_SCRIPTS.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleLoadSample(s.text)}
            className="text-xs px-2.5 py-1 rounded bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60 transition-colors"
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Settings bar */}
      <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
        {/* Narration Pace */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Narration Pace
          </label>
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1 w-full">
            {(["slow", "normal", "fast"] as NarrationPace[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePaceChange(p)}
                className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md capitalize transition-all ${
                  settings.narrationPace === p
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Min Scene Duration */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Minimum Scene Duration
          </label>
          <select
            value={settings.minSceneDuration}
            onChange={handleMinDurationChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value={2.5}>2.5 seconds (Fast scene transitions)</option>
            <option value={3.5}>3.5 seconds (Recommended WAN 2.2)</option>
            <option value={5.0}>5.0 seconds (Extended motion)</option>
            <option value={7.0}>7.0 seconds (Long panoramic shot)</option>
          </select>
        </div>

        {/* Develop Scenes Button */}
        <div>
          <button
            id="develop-scenes-button"
            type="button"
            onClick={onDevelopScenes}
            disabled={isScriptEmpty}
            className={`w-full py-2.5 px-4 rounded-lg font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              isScriptEmpty
                ? "bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-800"
                : "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/20 active:scale-[0.99] border border-indigo-500/30 cursor-pointer"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {hasScenes ? "Re-Develop Scenes" : "Develop Scenes"}
          </button>
        </div>
      </div>
    </div>
  );
};
