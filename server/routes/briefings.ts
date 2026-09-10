import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { dashboardBriefingSchema, routeBriefingSchema } from "../../shared/schemas.js";
import { explainSnapshot } from "../ai/briefing.js";
import type { BriefingProvider } from "../ai/client.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { resolveOperator } from "../services/access.js";
import { dashboardBriefingContext } from "../services/dashboard-briefing-context.js";
import { routeBriefingContext } from "../services/route-briefing-context.js";

/** Per-process call budget; evidence reads and deterministic explanations remain available. */
export function createBriefingRoutes(provider?: BriefingProvider) {
  const app = new Hono<AppEnv>();
  const usage = new Map<number, { count: number; until: number }>();
  let concurrent = 0;
  const allow = (id: number) => {
    for (const [key, value] of usage) if (value.until <= Date.now()) usage.delete(key);
    if (usage.size >= 1000 || concurrent >= 3) return false;
    const entry = usage.get(id) ?? { count: 0, until: Date.now() + 60_000 };
    if (entry.count >= 5) return false;
    entry.count++; usage.set(id, entry); return true;
  };
  app.post("/agent/route-briefing", requireRole("staff", "officer"), zValidator("json", routeBriefingSchema), async c => {
    const user = await resolveOperator(c.get("user"));
    const input = c.req.valid("json");
    const snapshot = await routeBriefingContext(user, input.target);
    const limited = input.mode === "auto" && !allow(user.userId);
    if (!limited && input.mode === "auto") concurrent++;
    try {
      const response = await explainSnapshot(snapshot, input.language, input.question, limited ? "deterministic" : input.mode, provider);
      if (limited) response.fallbackReason = "rate_limited";
      return c.json(response);
    } finally { if (!limited && input.mode === "auto") concurrent--; }
  });
  app.post("/agent/dashboard-briefing", requireRole("staff", "officer"), zValidator("json", dashboardBriefingSchema), async c => {
    const user = await resolveOperator(c.get("user"));
    const input = c.req.valid("json");
    const snapshot = await dashboardBriefingContext(user, input.scope.wardId, input.focus);
    const limited = input.mode === "auto" && !allow(user.userId);
    if (!limited && input.mode === "auto") concurrent++;
    try {
      const response = await explainSnapshot(snapshot, input.language, input.question, limited ? "deterministic" : input.mode, provider);
      if (limited) response.fallbackReason = "rate_limited";
      return c.json(response);
    } finally { if (!limited && input.mode === "auto") concurrent--; }
  });
  return app;
}
