/**
 * DemoForge director — drives one full pipeline run through TrueForge.
 *
 * Prereqs:
 *   1. TrueForge running: npx @truefoundry/trueforge (localhost:8790)
 *   2. Model provider configured in the TrueForge UI
 *   3. Connectors registered: cua-driver, videodb, demoforge-edit
 *   4. Edit MCP server running: bun run dev (localhost:3101 — console + MCP)
 *
 * Usage: bun run director -- <github-repo-url>
 */

import { TrueForge } from "@truefoundry/trueforge-sdk";
import { readFileSync } from "node:fs";

const AGENT = JSON.parse(
  readFileSync(new URL("../agent.json", import.meta.url), "utf8")
) as {
  name: string;
  model: string;
  instructions: string;
  mcpServers: Array<{ name: string; requireApprovalForTools?: string[] }>;
  config?: Record<string, unknown>;
};

async function main() {
  const repoUrl = process.argv[2];
  if (!repoUrl) {
    console.error("Usage: bun run director -- <github-repo-url>");
    process.exit(1);
  }

  const client = new TrueForge({
    baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8791",
  });

  const spec = {
    spec: {
      model: { name: `openai/${AGENT.model}` },
      instructions: AGENT.instructions,
      mcpServers: AGENT.mcpServers,
      config: AGENT.config,
    },
  };

  const sessionResp = await client.sessions.create({ agent: spec });
  const sessionId = sessionResp.data.id;
  console.log(`🎬 DemoForge session ${sessionId}\n   repo: ${repoUrl}\n`);

  const stream = await client.sessions.createTurnStream(sessionId, {
    input: [{
      type: "user.message",
      content: `Produce a demo video for ${repoUrl}. Follow your full pipeline: plan, rehearse, film, edit two variants, then STOP and present rough cuts for review.`,
    }],
  });

  for await (const event of stream) {
    const e = event as unknown as Record<string, unknown>;
    const t = String(e.type ?? "");
    if (t.includes("text") || t.includes("delta")) process.stdout.write(String(e.text ?? e.delta ?? ""));
    else if (t.includes("approval")) console.log(`\n⏸  ${t}: ${JSON.stringify(e).slice(0, 300)}`);
    else if (t.includes("tool")) console.log(`\n🔧 ${t}: ${JSON.stringify(e).slice(0, 160)}`);
    else if (t.includes("subagent")) console.log(`\n🤖 ${t}`);
  }

  console.log("\n\n✅ Turn complete. Review rough cuts at http://localhost:3101");
}

main().catch((err: Error) => {
  console.error("Director failed:", err.message);
  process.exit(1);
});
