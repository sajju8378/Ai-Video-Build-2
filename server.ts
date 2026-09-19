import express from "express";
import path from "path";
import multer from "multer";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

app.use(express.json());

// Resolve Hugging Face Space URL from environment
function getSpaceUrl(): string {
  const raw = process.env.HF_SPACE || "Saravutw/WAN2.2_I2V_LIGHTNING_4-8step_custom";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/+$/, "");
  }
  const parts = raw.split("/");
  if (parts.length === 2) {
    const owner = parts[0].toLowerCase().replace(/_/g, "-");
    const repo = parts[1].toLowerCase().replace(/_/g, "-").replace(/\./g, "-");
    return `https://${owner}-${repo}.hf.space`;
  }
  return `https://${raw.toLowerCase().replace(/_/g, "-")}.hf.space`;
}

function getAuthHeaders(): Record<string, string> {
  const token = process.env.HF_TOKEN?.trim();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

// Health & configuration check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    space: process.env.HF_SPACE || "Saravutw/WAN2.2_I2V_LIGHTNING_4-8step_custom",
    hasToken: Boolean(process.env.HF_TOKEN?.trim()),
  });
});

// 1. Submit WAN generation job
app.post("/api/wan/start", upload.single("image"), async (req, res) => {
  try {
    const spaceUrl = getSpaceUrl();
    const authHeaders = getAuthHeaders();

    if (!req.file && !req.body.imagePath) {
      return res.status(400).json({
        ok: false,
        error: "ERROR: Starting image is missing.",
      });
    }

    let uploadedPath = req.body.imagePath;

    // Step A: Upload image to Hugging Face if a file was provided
    if (req.file) {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(req.file.buffer)], {
        type: req.file.mimetype || "image/png",
      });
      formData.append("files", blob, req.file.originalname || "scene_image.png");

      let uploadRes: Response;
      try {
        uploadRes = await fetch(`${spaceUrl}/gradio_api/upload`, {
          method: "POST",
          headers: {
            ...authHeaders,
          },
          body: formData,
        });
      } catch (err: any) {
        return res.status(502).json({
          ok: false,
          error: `ERROR: Hugging Face image upload network error: ${err.message}`,
        });
      }

      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "");
        return res.status(uploadRes.status).json({
          ok: false,
          error: `ERROR: Hugging Face image upload failed (HTTP ${uploadRes.status}): ${errText.slice(0, 300)}`,
        });
      }

      const uploadJson = (await uploadRes.json()) as any;
      if (Array.isArray(uploadJson) && uploadJson.length > 0) {
        uploadedPath = uploadJson[0];
      } else if (typeof uploadJson === "string") {
        uploadedPath = uploadJson;
      } else if (uploadJson?.path) {
        uploadedPath = uploadJson.path;
      } else {
        return res.status(502).json({
          ok: false,
          error: "ERROR: Hugging Face upload did not return a valid server file path.",
        });
      }
    }

    // Step B: Sanitize prompt and duration
    const prompt = String(req.body.prompt || "high quality, cinematic motion, smooth animation").trim();
    const negativePrompt = String(
      req.body.negativePrompt ||
        "blurry, low quality, chaotic, deformed, watermark, bad anatomy, shaky camera view point"
    ).trim();

    const rawDuration = parseFloat(req.body.duration);
    // Keep duration strictly between 2.0s and 5.0s (default 3.5s) to guarantee execution under ZeroGPU quota
    const duration = isNaN(rawDuration) ? 3.5 : Math.max(2, Math.min(5.0, rawDuration));

    const steps = parseInt(req.body.steps, 10) || 4;
    const quality = parseInt(req.body.quality, 10) || 5;
    const scheduler = String(req.body.scheduler || "UniPCMultistep").trim();
    const fps = parseInt(req.body.fps, 10) || 16;
    const seed = req.body.seed ? parseInt(req.body.seed, 10) : 42;
    const randomizeSeed = req.body.randomizeSeed !== "false" && req.body.randomizeSeed !== false;

    // Gradio 5 data structure for Wan2.2 I2V Lightning
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

    let startRes: Response;
    try {
      startRes = await fetch(`${spaceUrl}/gradio_api/call/generate_video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      return res.status(502).json({
        ok: false,
        error: `ERROR: WAN request connection failed: ${err.message}`,
      });
    }

    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => "");
      return res.status(startRes.status).json({
        ok: false,
        error: `ERROR: WAN request failed (HTTP ${startRes.status}): ${errText.slice(0, 300)}`,
      });
    }

    const startData = (await startRes.json()) as any;
    const eventId = startData?.event_id || startData?.eventId;

    if (!eventId) {
      return res.status(502).json({
        ok: false,
        error: "ERROR: WAN did not return an event ID.",
      });
    }

    return res.json({
      ok: true,
      eventId,
      spaceUrl,
      duration,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: `ERROR: Unexpected error starting WAN job: ${err.message}`,
    });
  }
});

// 2. SSE stream proxy
app.get("/api/wan/stream", async (req, res) => {
  const eventId = String(req.query.eventId || "").trim();
  if (!eventId) {
    return res.status(400).send("Missing eventId query parameter");
  }

  const spaceUrl = getSpaceUrl();
  const authHeaders = getAuthHeaders();
  const targetUrl = `${spaceUrl}/gradio_api/call/generate_video/${encodeURIComponent(eventId)}`;

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        Accept: "text/event-stream",
        ...authHeaders,
      },
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      return res.status(upstreamRes.status).send(`Upstream stream error HTTP ${upstreamRes.status}`);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const reader = upstreamRes.body.getReader();

    req.on("close", () => {
      reader.cancel().catch(() => {});
    });

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          res.write(Buffer.from(value));
        }
      } catch (err: any) {
        if (!res.writableEnded) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        }
      }
    };

    pump();
  } catch (err: any) {
    return res.status(500).send(`Stream proxy connection failed: ${err.message}`);
  }
});

// 3. Video file proxy
app.get("/api/wan/file", async (req, res) => {
  const filePath = String(req.query.path || "").trim();
  if (!filePath) {
    return res.status(400).send("Missing path parameter");
  }

  // Prevent SSRF / directory traversal attacks outside gradio temp dirs
  if (filePath.includes("..") || filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return res.status(400).send("Invalid file path format");
  }

  const spaceUrl = getSpaceUrl();
  const authHeaders = getAuthHeaders();

  // Try /gradio_api/file= first, then fallback to /file=
  const candidates = [
    `${spaceUrl}/gradio_api/file=${encodeURIComponent(filePath)}`,
    `${spaceUrl}/file=${encodeURIComponent(filePath)}`,
  ];

  for (const url of candidates) {
    try {
      const fileRes = await fetch(url, {
        headers: {
          ...authHeaders,
        },
      });

      if (fileRes.ok && fileRes.body) {
        const contentType = fileRes.headers.get("content-type") || "video/mp4";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", 'inline; filename="wan_scene.mp4"');

        const reader = fileRes.body.getReader();
        req.on("close", () => {
          reader.cancel().catch(() => {});
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          res.write(Buffer.from(value));
        }
        return;
      }
    } catch {
      // try next candidate
    }
  }

  return res.status(404).send("ERROR: Video file could not be retrieved from Space.");
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Video Script Studio running at http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
