// HTTP + SSE server for the AI Co-Scientist prototype.
// Serves the static frontend and exposes /api/* to start and stream a research run.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { RunState } from "./state.js";
import { makeEngine, currentMode } from "./engine.js";
import { runResearch } from "./supervisor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = Number(process.env.PORT || 8787);

const runs = new Map(); // runId -> { state, controller, started }

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function serveStatic(req, res) {
  let rel = req.url.split("?")[0];
  if (rel === "/") rel = "/index.html";
  // prevent path traversal
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, { error: "forbidden" });
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    send(res, 404, { error: "not found" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  // --- API ------------------------------------------------------------------
  if (pathname === "/api/health") {
    const mode = currentMode();
    return send(res, 200, {
      ok: true,
      mode,
      model: mode === "claude" ? "claude-opus-4-8" : "mock",
      hasKey: !!process.env.ANTHROPIC_API_KEY,
      webSearchEnabled: process.env.ENABLE_WEB_SEARCH === "true",
      maxRounds: Number(process.env.MAX_ROUNDS || 3),
    });
  }

  if (pathname === "/api/run" && req.method === "POST") {
    const body = await readBody(req);
    const goal = (body.goal || "").toString().trim();
    if (!goal) return send(res, 400, { error: "Missing 'goal'." });

    const maxRounds = Number(process.env.MAX_ROUNDS || 3);
    const rounds = Math.max(1, Math.min(maxRounds, Number(body.rounds) || maxRounds));
    const wsEnv = process.env.ENABLE_WEB_SEARCH === "true";
    const webSearch = !!body.webSearch && wsEnv;

    const state = new RunState(goal, { rounds, webSearch });
    const controller = new AbortController();
    runs.set(state.runId, { state, controller, started: false });
    return send(res, 200, { runId: state.runId });
  }

  if (pathname.startsWith("/api/cancel/") && req.method === "POST") {
    const runId = pathname.split("/").pop();
    const run = runs.get(runId);
    if (run) {
      run.state.aborted = true;
      run.controller.abort();
    }
    return send(res, 200, { ok: true });
  }

  if (pathname.startsWith("/api/stream/") && req.method === "GET") {
    const runId = pathname.split("/").pop();
    const run = runs.get(runId);
    if (!run) return send(res, 404, { error: "unknown runId" });
    if (run.started) return send(res, 409, { error: "run already streaming" });
    run.started = true;

    const { createSSE } = await import("./sse.js");
    const sse = createSSE(res);

    req.on("close", () => {
      run.state.aborted = true;
      run.controller.abort();
      sse.close();
    });

    // Start the loop AFTER the stream is open (stream-first ordering).
    (async () => {
      try {
        const engine = makeEngine({ goal: run.state.goal, webSearch: run.state.webSearch });
        await runResearch({
          state: run.state,
          engine,
          emit: sse.emit,
          signal: run.controller.signal,
        });
      } catch (err) {
        if (!run.state.aborted) {
          sse.emit("error", { message: err?.message || String(err) });
        }
      } finally {
        sse.close();
        // keep state briefly so late health checks work, then drop
        setTimeout(() => runs.delete(runId), 60_000);
      }
    })();
    return;
  }

  // --- static ---------------------------------------------------------------
  if (req.method === "GET") return serveStatic(req, res);
  return send(res, 405, { error: "method not allowed" });
});

server.listen(PORT, () => {
  const mode = currentMode();
  console.log(`\n  AI Co-Scientist running → http://localhost:${PORT}`);
  console.log(`  Engine: ${mode}${mode === "claude" ? " (claude-opus-4-8)" : " (no API calls, no cost)"}`);
  if (mode === "claude" && !process.env.ANTHROPIC_API_KEY) {
    console.log("  ⚠  ENGINE=claude but ANTHROPIC_API_KEY is not set — runs will error.");
  }
  console.log("");
});
