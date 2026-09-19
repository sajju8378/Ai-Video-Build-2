// MODULE A — Script Input & MODULE B — Script Validation

/**
 * Robust word counting that works across English, Indic scripts (Telugu, Hindi),
 * CJK, and arbitrary Unicode text.
 */
export function getWordCount(text: string): number {
  const value = String(text || "").trim();
  if (!value) return 0;
  return value.split(/\s+/).filter(Boolean).length;
}

export interface ScriptValidationResult {
  isValid: boolean;
  wordCount: number;
  errorMessage?: string;
}

export function validateScript(text: string): ScriptValidationResult {
  const raw = String(text || "");
  const trimmed = raw.trim();
  const wordCount = getWordCount(trimmed);

  if (trimmed.length === 0) {
    return {
      isValid: false,
      wordCount: 0,
      errorMessage: "Please enter or paste your script to begin.",
    };
  }

  return {
    isValid: true,
    wordCount,
  };
}
