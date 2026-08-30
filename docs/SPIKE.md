# DemoForge — Day One Spike Plan
# Rule: the riskiest thing gets proven first. Everything else is downstream.

## Spike 1 (do first): screen recording → VideoDB → playable cut
The whole product hinges on ONE unproven link: Cua session footage becoming
VideoDB-editable video. Prove it in isolation before any agent wiring.

1. Provision a Cua sandbox (Linux is cheapest; Windows support is "soon" on cloud)
2. Clone a tiny app, boot it, do 3 clicks slowly
3. Capture the screen to MP4 (ffmpeg x11grab on Linux VM, or Cua's trajectory screenshots → mp4)
4. Upload to VideoDB via `upload_footage` (this repo's MCP tool)
5. `scene_index` it, `search_moments` "the app is open"
6. `assemble_timeline` with 2 shots → `generateStream()` → open the URL. Does it play?

Exit criteria: a stream URL you can watch. If this works, everything else is glue.

## Spike 2: TrueForge approval gate on render_final
- Register demoforge-edit connector in TrueForge
- Verify the turn PAUSES at render_final until POST /approvals/:id fires
- (Same enforcement model proven in Oracle; expect it to just work)

## Spike 3: OpenUI review console
- OpenUI Lang renders the shot list + rough-cut cards from agent output
- Fallback if OpenUI fights back: plain HTML console (already in review-ui/)
  and keep OpenUI for a stretch-goal "agent-generated review UI" moment

## De-risk notes
- Cua cloud Windows = soon → plan on Linux/macOS sandboxes for web apps
- Cua trajectories are JSON + screenshots; screen→MP4 is the only bespoke piece
- VideoDB free tier is fine for a hackathon; scene indexing + TTS are the
  billable calls — budget them like Oracle budgets tokens
- If Cua VM video capture is awkward, demo recordings can come from the
  review console screen-recording the VM stream — same footage, worse UX,
  still works
