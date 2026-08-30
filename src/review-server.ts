/**
 * DemoForge review console — an OpenUI generative-UI app.
 *
 * Why OpenUI: the director agent's outputs (shot lists, rough-cut previews,
 * variant pickers, approval prompts) are UI. Instead of hand-building a React
 * dashboard, the agent responds in OpenUI Lang and the renderer turns it into
 * real components — the agent ships its own review UI, streamed live.
 *
 * Server: serves the review page + proxies SSE events from the edit MCP
 * server (localhost:3101) and exposes /api/decide for approval POSTs.
 */

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const app = express();
app.use(express.json());

const EDIT_MCP_URL = process.env.DEMO_EDIT_URL ?? "http://localhost:3101";
const PORT = Number(process.env.REVIEW_UI_PORT ?? 3102);

// Status the console renders on load
let lastPipelineState: Record<string, unknown> = {
  stage: "idle",
  repo: null,
  shots: [],
  roughCuts: [],
  approvals: [],
};

// events from edit-mcp broadcast here
app.get("/api/events", async (req, res) => {
  const upstream = await fetch(`${EDIT_MCP_URL}/events`, { headers: { Accept: "text/event-stream" } });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  const reader = upstream.body!.getReader();
  req.on("close", () => reader.cancel());
  // forward
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch { /* client disconnected */ }
});

// Human decision on a gated action (approve/deny with a reason)
app.post("/api/decide", async (req, res) => {
  const { approvalId, approved, reason } = req.body as { approvalId: string; approved: boolean; reason?: string };
  const r = await fetch(`${EDIT_MCP_URL}/approvals/${approvalId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved, reason }),
  });
  res.json({ ok: r.ok });
});

app.listen(PORT, () => console.log(`Review console API on :${PORT}`));
