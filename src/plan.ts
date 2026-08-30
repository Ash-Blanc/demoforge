/**
 * Shot planning — turn a repo into a shot list.
 * Pure function + zod schema so the agent output is validated, not vibes.
 */

import { z } from "zod";

export const ShotSchema = z.object({
  id: z.string(),
  title: z.string().describe("Caption card text, max 60 chars"),
  goal: z.string().describe("What the viewer should learn from this shot"),
  actions: z.array(z.string()).describe("Concrete UI actions, e.g. 'click Settings in the sidebar'"),
  estSeconds: z.number().min(2).max(30),
  priority: z.number().min(1).max(5),
});
export type Shot = z.infer<typeof ShotSchema>;

export const ShotListSchema = z.object({
  repo: z.string(),
  stack: z.string().describe("Detected stack, e.g. 'Next.js 15 + SQLite'"),
  bootPlan: z.object({
    installCmd: z.string(),
    runCmd: z.string(),
    url: z.string().url().describe("Where the app will be reachable inside the VM"),
    notes: z.string().optional(),
  }),
  shots: z.array(ShotSchema).min(3).max(6),
  riskNotes: z.array(z.string()).describe("Things likely to break during filming"),
});
export type ShotList = z.infer<typeof ShotListSchema>;

/** Build the planner prompt for the director model. */
export function planPrompt(repoUrl: string, repoContext: string): string {
  return `You are planning a demo video for this repo: ${repoUrl}

Produce a shot list following the ShotList schema. Rules:
- 4 to 6 shots, total under 90 seconds of footage
- Shot 1 must be the app booting (first impression)
- Include exactly one "money shot": the single most impressive thing this app does
- Actions must be concrete UI verbs (click, type, scroll) — an agent will execute them on a real desktop
- Flag anything that could break filming (env vars, API keys, ports, migrations) in risks

Respond ONLY with JSON matching the schema.`;
}

export function parseShotList(raw: string): ShotList {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}") + 1;
  const candidate = jsonStart >= 0 ? raw.slice(jsonStart, jsonEnd) : raw;
  return ShotSchema.parse(JSON.parse(candidate));
}
