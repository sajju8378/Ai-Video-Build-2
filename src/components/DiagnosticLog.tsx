import React, { useState } from "react";
import { LogEntry } from "../types";
import { Terminal, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface DiagnosticLogProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const DiagnosticLog: React.FC<DiagnosticLogProps> = ({ logs, onClearLogs }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="px-5 py-3 flex items-center justify-between bg-slate-950/60 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white"
        >
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          <span>Diagnostic Execution Stream</span>
          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
            {logs.length}
          </span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {logs.length > 0 && isOpen && (
          <button
            type="button"
            onClick={onClearLogs}
            className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div className="p-3 bg-slate-950 font-mono text-[11px] max-h-52 overflow-y-auto space-y-1 select-text">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic py-2 text-center">
              No events logged yet. Activities will appear here in real-time.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 py-0.5 border-b border-slate-900/60">
                <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                {log.sceneIndex !== undefined && (
                  <span className="px-1 bg-slate-800 text-indigo-300 rounded shrink-0">
                    Scene {log.sceneIndex + 1}
                  </span>
                )}
                <span
                  className={
                    log.type === "error"
                      ? "text-rose-400"
                      : log.type === "warn"
                      ? "text-amber-400"
                      : log.type === "success"
                      ? "text-emerald-400"
                      : "text-slate-300"
                  }
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
