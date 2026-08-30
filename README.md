# ▣ DemoForge

**Repo in, converting demo video out.**

DemoForge is a TrueForge agent that takes any public GitHub repo, boots it in a real virtual desktop ([Cua](https://cua.ai)), films it like a user, and edits the footage into a Twitter-ready demo video with [VideoDB](https://videodb.io) — intro card, captions, voiceover, 16:9 + 9:16. Nothing renders or publishes without a human approving the rough cut.

Built for [The Agent Harness Hackathon](https://www.wemakedevs.org/hackathons/trueforge) (WeMakeDevs × TrueFoundry).

## The pipeline

```
github.com/you/some-repo
        │
        ▼
┌──────────────────────────────────────────────┐
│ DIRECTOR AGENT (TrueForge harness)           │
│                                              │
│ 1. PLAN      read repo → zod-validated       │
│              shot list (4-6 shots, ≤90s)     │
│ 2. REHEARSE  Cua VM: clone → install → boot  │
│              verify app works before filming │
│ 3. FILM      drive the UI shot-by-shot,      │
│              recording the screen            │
│ 4. EDIT      VideoDB: upload → scene index → │
│              semantic highlight search →     │
│              Timeline rough cuts (2 styles)  │
│ 5. REVIEW    human picks a cut + approves —  │  ← approval gate
│ 6. SHIP      gated render → MP4 → share      │
└──────────────────────────────────────────────┘
```

## Stack & why

| Piece | Role |
|---|---|
| [TrueForge](https://trueforge.dev) | The harness: agent loop, approval gates, subagents, persistent sessions |
| [Cua](https://cua.ai) | The hands: agent-ready macOS/Linux VMs, clone → install → boot → drive the UI, records every session |
| [VideoDB](https://videodb.io) | The eyes + editor: scene indexing, semantic moment search, programmatic Timeline API, TTS/captions |
| [OpenUI](https://openui.com) | The review console — agent-generated UI for the human-in-the-loop moments |
| **demoforge-edit MCP** (this repo) | VideoDB tools wrapped as MCP with harness-enforced approval gates on `render_final` / `publish_video` |

## Quickstart

Prereqs: Node 22+/bun, [Cua](https://cua.ai) account (sandbox cloud or local), [VideoDB API key](https://console.videodb.io).

```bash
bun install

# Terminal 1 — TrueForge
bun run dev                         # → http://localhost:8791

# Terminal 2 — DemoForge's VideoDB tools as MCP
bun run edit:mcp                    # → http://localhost:3101/mcp

# Terminal 3 — review console API + static UI
bun run review:api                  # API on :3102 (proxies approvals + events)
bun run review-ui                   # console at http://localhost:3102

# In TrueForge UI (one time):
#   Settings → Models     → add provider
#   Settings → Connectors → add: cua-driver (per Cua docs), videodb, http://localhost:3101/mcp

# Terminal 4 — run the director
bun run director -- https://github.com/someone/some-app
```

Approve the rough cut in the review console (`↵` approve / `esc` deny). The final MP4 link lands in the console when the gated render completes.

## Repo layout

```
demoforge/
├── agent.json          # TrueForge agent spec (director role, gated tools)
├── src/
│   ├── director.ts     # one pipeline run via TrueForge SDK
│   ├── edit-mcp.ts     # VideoDB tools as MCP + approval gate + SSE
│   ├── plan.ts         # zod shot-list schema + planner prompt
│   └── review-server.ts# review console API (SSE proxy + decisions)
├── review-ui/          # the human-in-the-loop console (vanilla + GSAP)
├── docs/
│   └── SPIKE.md        # day-one riskiest-thing-first spike plan
└── README.md
```

## The three platform roles

- **TrueForge** — decides what happens, in what order, and gates what's irreversible
- **Cua** — the hands: VM sandbox, real keyboard/mouse, screen recording
- **VideoDB** — the eyes + editor: scene indexing, semantic moment search, Timeline API, exports

## What TrueForge is doing (for judges)

- **MCP tools**: Cua (computer use), VideoDB (edit/compile), plus this repo's own `demoforge-edit` MCP server
- **Approval gate**: `render_final` / `publish_video` gated via `requireApprovalForTools` — the harness pauses the turn, not a convention in the prompt
- **Sandbox**: Cua sandboxes are the film set; TrueForge's own sandbox covers agent-side compute
- **Subagents**: planner / camera-operator / editor split (config in `agent.json`)
- **Persistent sessions**: repo profiles and style preferences survive across runs
- **Structured output**: shot lists are zod-validated (`src/plan.ts`) before the agent acts on them

## Qodo Code Review Evidence

<!-- Fill in after the first merged PR. -->

_To be completed during the hackathon — every substantive change lands via a Qodo-reviewed PR._

## License

MIT
