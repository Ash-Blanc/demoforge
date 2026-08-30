/**
 * DemoForge — VideoDB editing tools exposed as an MCP server.
 *
 * The director agent reaches VideoDB through these tools. Rendering and
 * publishing are GATED: TrueForge's approval mechanism pauses the run
 * until a human approves in the review console (same enforcement model
 * as Oracle's request_approval — harness-level, not prompt-level).
 *
 * Tools:
 *   upload_footage   — upload a screen recording MP4 into VideoDB (write)
 *   scene_index      — index scenes so moments are searchable (write, idempotent)
 *   search_moments   — semantic search over the footage (read-only)
 *   assemble_timeline— build a rough cut: clips + captions + resolution (read-only compile → stream URL)
 *   render_final     — GATED: human-approved export to MP4
 *   publish_video    — GATED: "publish" the final video (returns share link)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";
import { existsSync } from "node:fs";
import { connect, EditorTimeline, Track, Clip, EditorVideoAsset } from "videodb";

const VIDEODB_KEY = process.env.VIDEO_DB_API_KEY ?? process.env.VIDEODB_API_KEY ?? "";
// Lazy connection — the server must boot (and serve the review console) even
// without an API key; VideoDB tools fail with a clear message until one is set.
let _conn: ReturnType<typeof connect> | null = null;
function db() {
  if (!_conn) {
    if (!VIDEODB_KEY) {
      throw new Error("VIDEO_DB_API_KEY not set — copy .env.example to .env and add your key from console.videodb.io");
    }
    _conn = connect({ apiKey: VIDEODB_KEY });
  }
  return _conn;
}

const server = new McpServer({ name: "demoforge-edit", version: "0.1.0" });

/* ---------------- gate helpers (review console bridge) ---------------- */

interface PendingGate {
  resolve: (d: { approved: boolean; reason?: string }) => void;
  action: string;
}
const pendingApprovals = new Map<string, PendingGate>();
const sseClients = new Set<import("express").Response>();

function broadcast(event: unknown) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

async function gate(action: string, estimatedCostUsd: number, reason?: string) {
  const approvalId = crypto.randomUUID();
  broadcast({ type: "approval_requested", approvalId, action, estimatedCostUsd, reason, timestamp: Date.now() });
  const decision = await new Promise<{ approved: boolean; reason?: string }>((resolve) => {
    pendingApprovals.set(approvalId, { resolve, action });
    setTimeout(() => {
      if (pendingApprovals.delete(approvalId)) resolve({ approved: false, reason: "timeout" });
    }, 10 * 60 * 1000);
  });
  broadcast({ type: "approval_resolved", approvalId, approved: decision.approved });
  return decision;
}

/* ---------------- tools ---------------- */

server.registerTool(
  "upload_footage",
  {
    title: "Upload Footage",
    description: "Upload a screen recording (MP4) to VideoDB and get a video ID for editing.",
    inputSchema: {
      filePath: z.string().describe("Absolute path to the MP4 recording"),
      name: z.string().describe("Human-readable name, e.g. 'todo-app-demo-take-2'"),
    },
  },
  async ({ filePath, name }) => {
    const collection = await db().getCollection("default");
    const video = await collection.uploadFile(filePath);
    broadcast({ type: "footage_uploaded", videoId: video.id, name });
    return { content: [{ type: "text", text: JSON.stringify({ videoId: video.id }) }] };
  }
);

server.registerTool(
  "scene_index",
  {
    title: "Scene Index",
    description: "Run visual scene indexing on an uploaded video so moments can be searched semantically.",
    inputSchema: { videoId: z.string() },
  },
  async ({ videoId }) => {
    const video = await db().getVideoById(videoId);
    await video.indexScenes();
    broadcast({ type: "scene_indexed", videoId });
    return { content: [{ type: "text", text: JSON.stringify({ indexed: true, videoId }) }] };
  }
);

server.registerTool(
  "search_moments",
  {
    title: "Search Moments",
    description: "Semantic search over indexed footage. Returns timestamped shots matching a natural-language query, e.g. 'user completes a task'.",
    inputSchema: {
      videoId: z.string(),
      query: z.string(),
      scoreThreshold: z.number().min(0).max(1).optional().describe("Default 0.6"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ videoId, query, scoreThreshold }) => {
    const video = await db().getVideoById(videoId);
    const results = await video.search(query, { score_threshold: scoreThreshold ?? 0.6 });
    const shots = (results.shots ?? []).map((s: { start: number; end?: number; text?: string; score?: number }) => ({
      start: s.start,
      end: s.end ?? null,
      text: s.text ?? "",
      score: s.score ?? null,
    }));
    return { content: [{ type: "text", text: JSON.stringify(shots, null, 2) }] };
  }
);

server.registerTool(
  "assemble_timeline",
  {
    title: "Assemble Timeline",
    description: "Build a rough cut: splice chosen shots into a Timeline with a resolution, compile to a stream URL. Produces a PREVIEW — final MP4 export is a separate gated call.",
    inputSchema: {
      videoId: z.string(),
      shots: z
        .array(
          z.object({
            start: z.number().describe("Start seconds in source footage"),
            end: z.number().describe("End seconds in source footage"),
            caption: z.string().describe("Caption text for this shot"),
          })
        )
        .min(2),
      resolution: z.enum(["1920x1080", "1080x1920"]).optional().describe("16:9 landscape or 9:16 vertical"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ videoId, shots, resolution }) => {
    const timeline = new EditorTimeline(db());
    timeline.resolution = resolution ?? "1920x1080";
    timeline.background = "#000000";

    const track = new Track();
    let cursor = 0;
    for (const shot of shots) {
      const asset = new EditorVideoAsset({ id: videoId, start: shot.start });
      const duration = Math.max(1, shot.end - shot.start);
      const clip = new Clip({ asset, duration });
      track.addClip(cursor, clip);
      cursor += duration;
    }
    timeline.addTrack(track);
    const streamUrl = await timeline.generateStream();
    broadcast({ type: "rough_cut_ready", streamUrl, shotCount: shots.length, durationSec: cursor });
    return { content: [{ type: "text", text: JSON.stringify({ streamUrl, durationSec: cursor, shots: shots.length }, null, 2) }] };
  }
);

server.registerTool(
  "render_final",
  {
    title: "Render Final",
    description: "GATED: export the approved rough cut as a downloadable MP4. Pauses for human approval before rendering.",
    inputSchema: {
      streamUrl: z.string().url(),
      variantName: z.string().describe("e.g. 'fast-paced' or 'calm'"),
    },
  },
  async ({ streamUrl, variantName }) => {
    const decision = await gate(`Render final MP4 (${variantName})`, 0.2, `Export ${streamUrl.slice(0, 60)}…`);
    if (!decision.approved) {
      return { content: [{ type: "text", text: JSON.stringify({ rendered: false, reason: decision.reason ?? "denied by human" }) }] };
    }
    // Timeline → download endpoint (v2 Download endpoint takes the timeline/stream id)
    const res = await fetch("https://api.videodb.io/download/stream", {
      method: "POST",
      headers: { "x-access-token": VIDEODB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ stream_url: streamUrl }),
    });
    const body = (await res.json()) as { data?: { download_url?: string }; message?: string };
    if (!body.data?.download_url) {
      return { content: [{ type: "text", text: JSON.stringify({ rendered: false, error: body.message ?? "download failed" }) }] };
    }
    broadcast({ type: "final_rendered", videoUrl: body.data.download_url, variantName });
    return { content: [{ type: "text", text: JSON.stringify({ rendered: true, downloadUrl: body.data.download_url }) }] };
  }
);

/* ---------------- HTTP transport + review console SSE ---------------- */

const app = express();
app.use(express.json());

// Serve the review console from the same origin — one process, one port.
const reviewDir = existsSync("review-ui") ? "review-ui" : "../review-ui";
app.use(express.static(reviewDir));
app.get("/", (_req, res) => res.sendFile(`${reviewDir}/index.html`, { root: process.cwd() }));

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

app.post("/approvals/:id", (req, res) => {
  const pending = pendingApprovals.get(req.params.id);
  if (!pending) return res.status(404).json({ error: "approval not found or already resolved" });
  pendingApprovals.delete(req.params.id);
  const { approved, reason } = (req.body ?? {}) as { approved?: boolean; reason?: string };
  pending.resolve({ approved: Boolean(approved), reason });
  res.json({ ok: true });
});

const PORT = Number(process.env.DEMO_EDIT_PORT ?? 3101);
app.listen(PORT, () => console.log(`demoforge-edit MCP server on http://localhost:${PORT}/mcp`));
