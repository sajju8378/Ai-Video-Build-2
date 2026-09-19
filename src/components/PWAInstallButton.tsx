import React, { useState } from 'react';
import { Download, Smartphone, Check, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, render a subtle installed badge
  if (isInstalled) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 rounded-lg ${className}`}>
        <Check className="w-3.5 h-3.5 text-emerald-400" />
        <span>App Installed</span>
      </span>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ${className}`}
        title="Install as native app on your device"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 transition ${className}`}
          title="Instructions to install on iPhone or iPad"
        >
          <Download className="w-3 h-3 text-slate-400" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  Install on iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed space-y-2 mb-5">
                <span className="block">1. In Safari, tap the <strong className="text-indigo-300">Share</strong> icon at the bottom of the screen.</span>
                <span className="block">2. Scroll down and tap <strong className="text-indigo-300">Add to Home Screen</strong>.</span>
                <span className="block">3. Tap <strong className="text-indigo-300">Add</strong> in the top-right corner.</span>
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
