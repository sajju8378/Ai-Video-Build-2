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
 * Checks if the current app is running in a static web environment (GitHub Pages, Capacitor, or file://)
 * where a custom Express backend server does not exist.
 */
export function isStaticDeployment(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, protocol, port } = window.location;
  return (
    hostname.endsWith("github.io") ||
    protocol === "file:" ||
    protocol === "capacitor:" ||
    (hostname === "localhost" && port !== "3000")
  );
}

/**
 * Returns the target Hugging Face Space URL.
 * Checks localStorage for user-overrides, otherwise defaults to the custom lightning space.
 */
export function getClientSpaceUrl(): string {
  if (typeof window !== "undefined") {
    const custom = localStorage.getItem("hf_space_url")?.trim();
    if (custom) return custom.replace(/\/+$/, "");
  }
  return "https://saravutw-wan2-2-i2v-lightning-4-8step-custom.hf.space";
}

/**
 * Returns user authorization headers if an HF token was provided in settings/Deploy modal.
 */
export function getClientAuthHeaders(): Record<string, string> {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("hf_user_token")?.trim();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

/**
 * MODULE I: Recursively searches any response structure for a valid video file path or URL
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
    if (/\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(trimmed) || trimmed.startsWith("/tmp/gradio") || trimmed.includes("/file=")) {
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
    // Check standard Gradio FileData { url: "..." } or { path: "..." }
    if (value.url && typeof value.url === "string") {
      return value.url;
    }
    if (value.path && typeof value.path === "string") {
      return value.path;
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
 * Constructs the browser-safe URL to stream or play the video file.
 * Handles absolute URLs, Gradio file endpoints, direct Hugging Face spaces, and server proxies.
 */
export function getVideoProxyUrl(filePath: string): string {
  if (!filePath) return "";
  
  // If already an absolute URL, return directly
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  const spaceUrl = getClientSpaceUrl();

  // If in static deployment (GitHub Pages / Capacitor / mobile APK), resolve against Hugging Face space
  if (isStaticDeployment()) {
    if (filePath.startsWith("/gradio_api/file=") || filePath.startsWith("/file=")) {
      return `${spaceUrl}${filePath}`;
    }
    return `${spaceUrl}/gradio_api/file=${encodeURIComponent(filePath)}`;
  }

  // Full-stack mode: use server proxy
  return `/api/wan/file?path=${encodeURIComponent(filePath)}`;
}

/**
 * Direct client-side submission to Hugging Face Gradio 6 / Wan2.2 space.
 * Bypasses local backend entirely (critical for GitHub Pages & static/APK deployments).
 */
async function submitDirectToHuggingFace(params: {
  imageFile: File;
  prompt: string;
  duration: number;
  negativePrompt?: string;
  steps?: number;
  quality?: number;
  scheduler?: string;
  fps?: number;
}): Promise<{ eventId: string; duration: number }> {
  const spaceUrl = getClientSpaceUrl();
  const authHeaders = getClientAuthHeaders();

  // 1. Upload starting image to Gradio
  const uploadFormData = new FormData();
  uploadFormData.append("files", params.imageFile, params.imageFile.name || "scene_image.png");

  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${spaceUrl}/gradio_api/upload`, {
      method: "POST",
      headers: {
        ...authHeaders,
      },
      body: uploadFormData,
    });
  } catch (err: any) {
    throw new Error(`ERROR: Hugging Face upload network error: ${err.message}`);
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`ERROR: Hugging Face upload failed (HTTP ${uploadRes.status}): ${errText.slice(0, 200)}`);
  }

  const uploadJson = await uploadRes.json();
  let uploadedPath = "";
  if (Array.isArray(uploadJson) && uploadJson.length > 0) {
    uploadedPath = uploadJson[0];
  } else if (typeof uploadJson === "string") {
    uploadedPath = uploadJson;
  } else if (uploadJson?.path) {
    uploadedPath = uploadJson.path;
  } else {
    throw new Error("ERROR: Hugging Face upload did not return a valid server file path.");
  }

  // 2. Prepare Wan 2.2 I2V Lightning parameters
  const prompt = String(params.prompt || "high quality, cinematic motion, smooth animation").trim();
  const negativePrompt = String(
    params.negativePrompt ||
      "blurry, low quality, chaotic, deformed, watermark, bad anatomy, shaky camera view point"
  ).trim();

  const rawDuration = parseFloat(String(params.duration));
  // Keep duration strictly between 2.0s and 5.0s (default 3.5s) to guarantee execution under ZeroGPU quota
  const duration = isNaN(rawDuration) ? 3.5 : Math.max(2, Math.min(5.0, rawDuration));
  const steps = params.steps || 4;
  const quality = params.quality || 5;
  const scheduler = params.scheduler || "UniPCMultistep";
  const fps = params.fps || 16;
  const seed = 42;
  const randomizeSeed = true;

  const payload = {
    data: [
      {
        path: uploadedPath,
        meta: { _type: "gradio.FileData" },
      },
      null, // last_image (optional)
      prompt,
      steps,
      negativePrompt,
      duration,
      1, // guidance scale 1 (high noise)
      1, // guidance scale 2 (low noise)
      seed,
      randomizeSeed,
      quality,
      scheduler,
      3, // flow shift
      fps,
      false, // safe mode
      true, // display result
    ],
  };

  let callRes: Response;
  try {
    callRes = await fetch(`${spaceUrl}/gradio_api/call/generate_video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    throw new Error(`ERROR: Hugging Face Space connection failed: ${err.message}`);
  }

  if (!callRes.ok) {
    const errText = await callRes.text().catch(() => "");
    throw new Error(`ERROR: WAN job call failed (HTTP ${callRes.status}): ${errText.slice(0, 250)}`);
  }

  const callJson = await callRes.json();
  const eventId = callJson?.event_id || callJson?.eventId;
  if (!eventId) {
    throw new Error("ERROR: WAN did not return an event ID.");
  }

  return {
    eventId,
    duration,
  };
}

/**
 * MODULE G: Submits image & prompt to WAN generator.
 * Automatically selects Direct Hugging Face Gradio API on GitHub Pages / APK,
 * or server proxy on full-stack deployments with automatic fallback.
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

  // In static environments (GitHub Pages, Capacitor, file://), bypass the nonexistent Express server
  if (isStaticDeployment()) {
    return submitDirectToHuggingFace(params);
  }

  // Full-stack mode: try server-side proxy first
  try {
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

    // If static hosting returned 404 or 405 Method Not Allowed, fallback to direct HF space
    if (res.status === 404 || res.status === 405) {
      return submitDirectToHuggingFace(params);
    }

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
  } catch (err: any) {
    // If network error occurred (e.g. static site has no /api/), fallback directly to HF
    if (
      err.message?.includes("405") ||
      err.message?.includes("Failed to fetch") ||
      err.message?.includes("NetworkError")
    ) {
      return submitDirectToHuggingFace(params);
    }
    throw err;
  }
}

/**
 * MODULE H: Connects to SSE endpoint and streams progress & completion events.
 * Connects directly to Hugging Face on static hosting or server stream on fullstack.
 */
export async function streamWanJob(
  eventId: string,
  onUpdate: (update: WanProgressUpdate) => void,
  signal?: AbortSignal
): Promise<string> {
  const spaceUrl = getClientSpaceUrl();
  const authHeaders = getClientAuthHeaders();

  let streamUrl = `/api/wan/stream?eventId=${encodeURIComponent(eventId)}`;
  let requestHeaders: Record<string, string> = {
    Accept: "text/event-stream",
  };

  // On static hosting, stream directly from Hugging Face Space
  if (isStaticDeployment()) {
    streamUrl = `${spaceUrl}/gradio_api/call/generate_video/${encodeURIComponent(eventId)}`;
    requestHeaders = {
      Accept: "text/event-stream",
      ...authHeaders,
    };
  }

  let res: Response;
  try {
    res = await fetch(streamUrl, {
      headers: requestHeaders,
      signal,
    });

    // Fallback to direct HF space if server route returned 404 / 405
    if (res.status === 404 || res.status === 405) {
      streamUrl = `${spaceUrl}/gradio_api/call/generate_video/${encodeURIComponent(eventId)}`;
      res = await fetch(streamUrl, {
        headers: {
          Accept: "text/event-stream",
          ...authHeaders,
        },
        signal,
      });
    }
  } catch (err: any) {
    // If server stream failed to connect, try direct Hugging Face SSE stream
    streamUrl = `${spaceUrl}/gradio_api/call/generate_video/${encodeURIComponent(eventId)}`;
    res = await fetch(streamUrl, {
      headers: {
        Accept: "text/event-stream",
        ...authHeaders,
      },
      signal,
    });
  }

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

          // Clarify generic null/undefined errors from ZeroGPU
          if (
            !errorMsg ||
            errorMsg === "WAN generation encountered an error." ||
            errorMsg === "null" ||
            errorMsg.includes("GPU")
          ) {
            errorMsg =
              "ZeroGPU execution quota or queue timeout. Video shots generate most reliably at 3.5s duration. Try retrying with 3.5s or add your free HF Token in Settings.";
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
