import React, { useState } from 'react';
import {
  X,
  Globe,
  Smartphone,
  CheckCircle2,
  ExternalLink,
  Terminal,
  Download,
  FolderGit2,
  Key,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'pages' | 'apk' | 'api';
}

export const DeployModal: React.FC<DeployModalProps> = ({ isOpen, onClose, initialTab = 'pages' }) => {
  const [activeTab, setActiveTab] = useState<'pages' | 'apk' | 'api'>(initialTab);
  const [copied, setCopied] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Deploy &amp; APK Build Center</h2>
              <p className="text-xs text-slate-400">GitHub Pages live deployment &amp; Android APK packaging</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('pages')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'pages'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>GitHub Pages (Main Branch)</span>
          </button>
          <button
            onClick={() => setActiveTab('apk')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'apk'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Android APK Build</span>
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'api'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Static API Configuration</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-300">
          {activeTab === 'pages' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">Why the 404 happened &amp; How it's solved</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      GitHub Pages previously returned <code>404 main.tsx</code> because Pages was configured to serve raw files from the <code className="text-indigo-300">main</code> branch root. Browsers cannot execute raw TypeScript/JSX without compiling.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">1-Minute Solution: Switch Pages Source</h4>
                <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300">
                  <li>
                    Open your repository settings:{' '}
                    <a
                      href="https://github.com/sajju8378/Ai-Video-Build-2/settings/pages"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline inline-flex items-center gap-1 font-mono"
                    >
                      github.com/sajju8378/Ai-Video-Build-2/settings/pages
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>
                    Under <strong className="text-white">Build and deployment &gt; Source</strong>, change the dropdown from <em>"Deploy from a branch"</em> to <strong className="text-emerald-400">"GitHub Actions"</strong>.
                  </li>
                  <li>
                    A pre-configured automated workflow (<code className="text-slate-200">.github/workflows/deploy.yml</code>) will now automatically build Vite and deploy the production bundle every time you push to <code className="text-indigo-300">main</code>!
                  </li>
                </ol>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <a
                  href="https://github.com/sajju8378/Ai-Video-Build-2/settings/pages"
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs text-center transition flex items-center justify-center gap-2"
                >
                  <Globe className="w-4 h-4" />
                  <span>Open GitHub Pages Settings</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-75" />
                </a>
                <a
                  href="https://github.com/sajju8378/Ai-Video-Build-2/actions"
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-2 border border-slate-700"
                >
                  <span>View GitHub Actions</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-75" />
                </a>
              </div>
            </div>
          )}

          {activeTab === 'apk' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 mt-0.5">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Automated Android APK Build Ready</h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      We added <code className="text-emerald-300">.github/workflows/build-apk.yml</code> and full Capacitor Android native project files. Every push to <code className="text-emerald-300">main</code> automatically compiles a downloadable <strong className="text-white">AI-Video-Script-Studio.apk</strong>!
                    </p>
                  </div>
                </div>
              </div>

              {/* Method A: Instant Mobile PWA */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Method 1: 1-Click Install App (PWA)</span>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full font-medium">Instant</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  On Android phones (Chrome/Edge/Brave), you can install this studio directly as a standalone Android app with icon, splash screen, and offline cache—without needing to sideload or enable unknown APK sources:
                </p>
                <div className="pt-1">
                  <PWAInstallButton className="w-full justify-center py-2" />
                </div>
              </div>

              {/* Method B: Download Built APK */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Method 2: Download Standalone .APK File</span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  In your repository's GitHub Actions tab, the <strong className="text-white">Build Android APK</strong> workflow compiles the native Android project and generates the APK package:
                </p>
                <a
                  href="https://github.com/sajju8378/Ai-Video-Build-2/actions/workflows/build-apk.yml"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs text-center transition flex items-center justify-center gap-2 border border-slate-700"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Download APK from GitHub Actions Artifacts</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-75" />
                </a>
              </div>

              {/* Method C: Local build CLI */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Method 3: Build Locally via Terminal</span>
                <div className="relative">
                  <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto">
{`npm run build
npx cap sync android
cd android && ./gradlew assembleDebug`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(`npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`, 'cmd')}
                    className="absolute right-2 top-2 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                    title="Copy command"
                  >
                    {copied === 'cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  The generated APK will be placed at <code>android/app/build/outputs/apk/debug/app-debug.apk</code>.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Key className="w-4 h-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Hugging Face &amp; Backend Connectivity</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  When deployed statically to GitHub Pages or running offline in an APK, the browser directly communicates with Hugging Face WAN 2.2 spaces. You can optionally provide a personal Hugging Face user token to increase priority or bypass queue rate limits:
                </p>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Hugging Face WAN 2.2 Space:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-1">
                    {[
                      {
                        name: "Lightning (Primary)",
                        url: "https://saravutw-wan2-2-i2v-lightning-4-8step-custom.hf.space",
                      },
                      {
                        name: "Lightning (Mirror 1)",
                        url: "https://ivannm-wan2-2-i2v-lightning-4-8step-custom-copy.hf.space",
                      },
                      {
                        name: "4-Step LoRA (Mirror 2)",
                        url: "https://geceff-wan2-2-i2v-4step-loras.hf.space",
                      },
                    ].map((sp) => (
                      <button
                        key={sp.url}
                        type="button"
                        onClick={() => {
                          localStorage.setItem("hf_space_url", sp.url);
                          window.location.reload();
                        }}
                        className={`px-2.5 py-2 rounded-lg text-left text-xs border transition ${
                          (localStorage.getItem("hf_space_url") || "https://saravutw-wan2-2-i2v-lightning-4-8step-custom.hf.space") === sp.url
                            ? "bg-indigo-600/30 border-indigo-500 text-white font-bold"
                            : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <div className="font-semibold">{sp.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{sp.url.replace("https://", "").split(".")[0]}</div>
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="https://saravutw-wan2-2-i2v-lightning-4-8step-custom.hf.space"
                    defaultValue={localStorage.getItem('hf_space_url') || ''}
                    onChange={(e) => {
                      if (e.target.value.trim()) {
                        localStorage.setItem('hf_space_url', e.target.value.trim());
                      } else {
                        localStorage.removeItem('hf_space_url');
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Select a mirror or enter a custom Hugging Face ZeroGPU space URL.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-300">
                      Hugging Face Token (Free Personal Access Token):
                    </label>
                    <a
                      href="https://huggingface.co/settings/tokens"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                    >
                      Get Token (Free) <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="password"
                    placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    defaultValue={localStorage.getItem('hf_user_token') || ''}
                    onChange={(e) => {
                      if (e.target.value.trim()) {
                        localStorage.setItem('hf_user_token', e.target.value.trim());
                      } else {
                        localStorage.removeItem('hf_user_token');
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Adding your free token gives you your own personal ZeroGPU quota bucket so WAN never rejects your sequential requests.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
