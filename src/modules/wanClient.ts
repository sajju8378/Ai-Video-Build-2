// MODULE F — Image Upload
// MODULE G — WAN Job Submission
// MODULE H — WAN Job Monitoring / SSE
// MODULE I — WAN Video File Retrieval

export interface WanProgressUpdate {
  stage: "uploading" | "submitted" | "generating" | "complete" | "error";
  percent?: number;
  message?: string;
  videoPath?: string;
  error?: string;
}

/**
 * MODULE I: Recursively searches any response structure for a valid video file path
 */
export function extractPath(value: any): string {
  if (!value) {
    throw new Error("ERROR: WAN job completed but no video file path was returned.");
  }

  // Case 1: String path directly
  if (typeof value === "string") {
    const trimmed = value.trim();
    // If it's a JSON string, try to parse it
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractPath(parsed);
      } catch {
        // continue to string check
      }
    }
    if (/\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(trimmed) || trimmed.startsWith("/tmp/gradio")) {
      return trimmed;
    }
  }

  // Case 2: Array of results (Gradio returns arrays of outputs)
  if (Array.isArray(value)) {
    for (const item of value) {
      try {
        const p = extractPath(item);
        if (p) return p;
      } catch {
        // try next element
      }
    }
  }

  // Case 3: Object with path / url / video properties
  if (typeof value === "object") {
    // Check standard Gradio FileData { path: "..." }
    if (value.path && typeof value.path === "string") {
      return value.path;
    }
    if (value.url && typeof value.url === "string") {
      return value.url;
    }
    if (value.video) {
      try {
        return extractPath(value.video);
      } catch {
        // continue
      }
    }
    if (value.file) {
      try {
        return extractPath(value.file);
      } catch {
        // continue
      }
    }
    // Search all values in object
    for (const key of Object.keys(value)) {
      if (typeof value[key] === "object" || typeof value[key] === "string") {
        try {
          const p = extractPath(value[key]);
          if (p) return p;
        } catch {
          // continue
        }
      }
    }
  }

  throw new Error("ERROR: WAN job completed but no video file path was returned.");
}

/**
 * Constructs the browser-safe proxy URL to stream the video file
 */
export function getVideoProxyUrl(filePath: string): string {
  if (!filePath) return "";
  return `/api/wan/file?path=${encodeURIComponent(filePath)}`;
}

/**
 * MODULE G: Submits image & prompt to the backend WAN start endpoint
 */
export async function submitWanJob(params: {
  imageFile: File;
  prompt: string;
  duration: number;
  negativePrompt?: string;
  steps?: number;
  quality?: number;
  scheduler?: string;
  fps?: number;
}): Promise<{ eventId: string; duration: number }> {
  if (!params.imageFile) {
    throw new Error("ERROR: Starting image is missing.");
  }

  const formData = new FormData();
  formData.append("image", params.imageFile, params.imageFile.name);
  formData.append("prompt", params.prompt);
  formData.append("duration", String(params.duration));
  if (params.negativePrompt) {
    formData.append("negativePrompt", params.negativePrompt);
  }
  if (params.steps) {
    formData.append("steps", String(params.steps));
  }
  if (params.quality) {
    formData.append("quality", String(params.quality));
  }
  if (params.scheduler) {
    formData.append("scheduler", params.scheduler);
  }
  if (params.fps) {
    formData.append("fps", String(params.fps));
  }

  const res = await fetch("/api/wan/start", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) errMessage = data.error;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) errMessage = text.slice(0, 200);
    }
    throw new Error(errMessage.startsWith("ERROR:") ? errMessage : `ERROR: WAN request failed: ${errMessage}`);
  }

  const json = await res.json();
  if (!json.ok || !json.eventId) {
    throw new Error(json.error || "ERROR: WAN did not return an event ID.");
  }

  return {
    eventId: json.eventId,
    duration: json.duration || params.duration,
  };
}

/**
 * MODULE H: Connects to SSE endpoint and streams progress & completion events
 */
export async function streamWanJob(
  eventId: string,
  onUpdate: (update: WanProgressUpdate) => void,
  signal?: AbortSignal
): Promise<string> {
  const streamUrl = `/api/wan/stream?eventId=${encodeURIComponent(eventId)}`;
  const res = await fetch(streamUrl, {
    headers: {
      Accept: "text/event-stream",
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(`ERROR: WAN stream HTTP ${res.status}`);
  }

  if (!res.body) {
    throw new Error("ERROR: WAN stream response body is empty.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let extractedVideoPath: string | null = null;
  let encounteredError: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Split complete SSE blocks separated by blank line (supports \n\n and \r\n\r\n)
      const blocks = buffer.split(/\r?\n\r?\n/);
      // Keep unfinished final chunk in buffer
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        const lines = trimmed.split(/\r?\n/);
        let eventType = "message";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.replace(/^event:\s*/, "").trim();
          } else if (line.startsWith("data:")) {
            dataStr = line.replace(/^data:\s*/, "").trim();
          }
        }

        // Process SSE event
        if (eventType === "error") {
          let errorMsg = "WAN generation encountered an error.";
          try {
            const parsedData = JSON.parse(dataStr);
            if (typeof parsedData === "string") errorMsg = parsedData;
            else if (parsedData?.error) errorMsg = parsedData.error;
            else if (parsedData?.message) errorMsg = parsedData.message;
          } catch {
            if (dataStr && dataStr !== "null") errorMsg = dataStr;
          }
          encounteredError = errorMsg;
          onUpdate({
            stage: "error",
            error: errorMsg.startsWith("ERROR:") ? errorMsg : `ERROR: WAN job failed: ${errorMsg}`,
          });
          throw new Error(errorMsg.startsWith("ERROR:") ? errorMsg : `ERROR: WAN job failed: ${errorMsg}`);
        }

        if (eventType === "progress") {
          try {
            const pData = JSON.parse(dataStr);
            let percent: number | undefined;
            let msg = "Generating video...";
            if (Array.isArray(pData) && typeof pData[0] === "number") {
              percent = Math.round(pData[0] * 100);
            } else if (typeof pData?.progress === "number") {
              percent = Math.round(pData.progress * 100);
            } else if (typeof pData?.index === "number" && typeof pData?.length === "number" && pData.length > 0) {
              percent = Math.round((pData.index / pData.length) * 100);
            }
            if (percent !== undefined) {
              msg = `Generating frames... ${percent}%`;
            }
            onUpdate({
              stage: "generating",
              percent,
              message: msg,
            });
          } catch {
            onUpdate({
              stage: "generating",
              message: "Processing video...",
            });
          }
        } else if (eventType === "generating" || eventType === "status") {
          onUpdate({
            stage: "generating",
            message: dataStr || "Generating video frames...",
          });
        } else if (eventType === "complete") {
          try {
            const cData = JSON.parse(dataStr);
            const path = extractPath(cData);
            extractedVideoPath = path;
            onUpdate({
              stage: "complete",
              percent: 100,
              message: "Video generated successfully",
              videoPath: path,
            });
          } catch (err: any) {
            encounteredError = err.message;
            throw err;
          }
        }
      }
    }

    // Flush any remaining decoder bytes
    buffer += decoder.decode();
    if (buffer.trim()) {
      const lines = buffer.trim().split(/\r?\n/);
      let eventType = "message";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.replace(/^event:\s*/, "").trim();
        } else if (line.startsWith("data:")) {
          dataStr = line.replace(/^data:\s*/, "").trim();
        }
      }
      if (eventType === "complete" && !extractedVideoPath) {
        const cData = JSON.parse(dataStr);
        extractedVideoPath = extractPath(cData);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (encounteredError) {
    throw new Error(encounteredError);
  }

  if (!extractedVideoPath) {
    throw new Error("ERROR: WAN job completed but no video file path was returned.");
  }

  return extractedVideoPath;
}
