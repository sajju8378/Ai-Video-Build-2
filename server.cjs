var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_multer = __toESM(require("multer"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
var upload = (0, import_multer.default)({
  storage: import_multer.default.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
  // 25MB max
});
app.use(import_express.default.json());
function getSpaceUrl() {
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
function getAuthHeaders() {
  const token = process.env.HF_TOKEN?.trim();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    space: process.env.HF_SPACE || "Saravutw/WAN2.2_I2V_LIGHTNING_4-8step_custom",
    hasToken: Boolean(process.env.HF_TOKEN?.trim())
  });
});
app.post("/api/wan/start", upload.single("image"), async (req, res) => {
  try {
    const spaceUrl = getSpaceUrl();
    const authHeaders = getAuthHeaders();
    if (!req.file && !req.body.imagePath) {
      return res.status(400).json({
        ok: false,
        error: "ERROR: Starting image is missing."
      });
    }
    let uploadedPath = req.body.imagePath;
    if (req.file) {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(req.file.buffer)], {
        type: req.file.mimetype || "image/png"
      });
      formData.append("files", blob, req.file.originalname || "scene_image.png");
      let uploadRes;
      try {
        uploadRes = await fetch(`${spaceUrl}/gradio_api/upload`, {
          method: "POST",
          headers: {
            ...authHeaders
          },
          body: formData
        });
      } catch (err) {
        return res.status(502).json({
          ok: false,
          error: `ERROR: Hugging Face image upload network error: ${err.message}`
        });
      }
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "");
        return res.status(uploadRes.status).json({
          ok: false,
          error: `ERROR: Hugging Face image upload failed (HTTP ${uploadRes.status}): ${errText.slice(0, 300)}`
        });
      }
      const uploadJson = await uploadRes.json();
      if (Array.isArray(uploadJson) && uploadJson.length > 0) {
        uploadedPath = uploadJson[0];
      } else if (typeof uploadJson === "string") {
        uploadedPath = uploadJson;
      } else if (uploadJson?.path) {
        uploadedPath = uploadJson.path;
      } else {
        return res.status(502).json({
          ok: false,
          error: "ERROR: Hugging Face upload did not return a valid server file path."
        });
      }
    }
    const prompt = String(req.body.prompt || "high quality, cinematic motion, smooth animation").trim();
    const negativePrompt = String(
      req.body.negativePrompt || "blurry, low quality, chaotic, deformed, watermark, bad anatomy, shaky camera view point"
    ).trim();
    const rawDuration = parseFloat(req.body.duration);
    const duration = isNaN(rawDuration) ? 3.5 : Math.max(2, Math.min(5, rawDuration));
    const steps = parseInt(req.body.steps, 10) || 4;
    const quality = parseInt(req.body.quality, 10) || 5;
    const scheduler = String(req.body.scheduler || "UniPCMultistep").trim();
    const fps = parseInt(req.body.fps, 10) || 16;
    const seed = req.body.seed ? parseInt(req.body.seed, 10) : 42;
    const randomizeSeed = req.body.randomizeSeed !== "false" && req.body.randomizeSeed !== false;
    const payload = {
      data: [
        {
          path: uploadedPath,
          meta: { _type: "gradio.FileData" }
        },
        null,
        // last_image (optional)
        prompt,
        steps,
        negativePrompt,
        duration,
        1,
        // guidance scale 1 (high noise)
        1,
        // guidance scale 2 (low noise)
        seed,
        randomizeSeed,
        quality,
        scheduler,
        3,
        // flow shift
        fps,
        false,
        // safe mode
        true
        // display result
      ]
    };
    let startRes;
    try {
      startRes = await fetch(`${spaceUrl}/gradio_api/call/generate_video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: `ERROR: WAN request connection failed: ${err.message}`
      });
    }
    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => "");
      return res.status(startRes.status).json({
        ok: false,
        error: `ERROR: WAN request failed (HTTP ${startRes.status}): ${errText.slice(0, 300)}`
      });
    }
    const startData = await startRes.json();
    const eventId = startData?.event_id || startData?.eventId;
    if (!eventId) {
      return res.status(502).json({
        ok: false,
        error: "ERROR: WAN did not return an event ID."
      });
    }
    return res.json({
      ok: true,
      eventId,
      spaceUrl,
      duration
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: `ERROR: Unexpected error starting WAN job: ${err.message}`
    });
  }
});
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
        ...authHeaders
      }
    });
    if (!upstreamRes.ok || !upstreamRes.body) {
      return res.status(upstreamRes.status).send(`Upstream stream error HTTP ${upstreamRes.status}`);
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    const reader = upstreamRes.body.getReader();
    req.on("close", () => {
      reader.cancel().catch(() => {
      });
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
      } catch (err) {
        if (!res.writableEnded) {
          res.write(`event: error
data: ${JSON.stringify({ error: err.message })}

`);
          res.end();
        }
      }
    };
    pump();
  } catch (err) {
    return res.status(500).send(`Stream proxy connection failed: ${err.message}`);
  }
});
app.get("/api/wan/file", async (req, res) => {
  const filePath = String(req.query.path || "").trim();
  if (!filePath) {
    return res.status(400).send("Missing path parameter");
  }
  if (filePath.includes("..") || filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return res.status(400).send("Invalid file path format");
  }
  const spaceUrl = getSpaceUrl();
  const authHeaders = getAuthHeaders();
  const candidates = [
    `${spaceUrl}/gradio_api/file=${encodeURIComponent(filePath)}`,
    `${spaceUrl}/file=${encodeURIComponent(filePath)}`
  ];
  for (const url of candidates) {
    try {
      const fileRes = await fetch(url, {
        headers: {
          ...authHeaders
        }
      });
      if (fileRes.ok && fileRes.body) {
        const contentType = fileRes.headers.get("content-type") || "video/mp4";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", 'inline; filename="wan_scene.mp4"');
        const reader = fileRes.body.getReader();
        req.on("close", () => {
          reader.cancel().catch(() => {
          });
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
    }
  }
  return res.status(404).send("ERROR: Video file could not be retrieved from Space.");
});
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
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
//# sourceMappingURL=server.cjs.map
