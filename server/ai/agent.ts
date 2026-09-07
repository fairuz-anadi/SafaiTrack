/**
 * The SafaiTrack operations assistant.
 *
 * Two implementations behind one interface:
 *
 *  1. `askClaude`  — Claude with tool access to the live database. It decides
 *     which queries to run, chains them, and reasons over the results.
 *  2. `askOffline` — a deterministic rule-based advisor that answers the same
 *     core question set directly from SQL, with no network at all.
 *
 * The fallback is not a nicety. The competition venue may have no usable
 * internet, and a demo that dies when the wifi does is not a demo. The UI
 * labels which engine answered, so nothing is passed off as more than it is.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { agentTools } from "./tools.js";

const { bins, wards, complaints, binForecasts, routeComparisons, trucks } = schema;

export type AgentSource = "claude" | "offline";

export interface AgentReply {
  text: string;
  source: AgentSource;
  toolCalls: { name: string; input: unknown }[];
  /** Present when Claude was attempted and failed, so the UI can be honest. */
  fallbackReason?: string;
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

const SYSTEM_PROMPT = `You are the SafaiTrack operations assistant for Dhaka North City Corporation's ward-level waste collection system.

You are talking to municipal staff, ward officers and drivers who are making real dispatch decisions right now. Answer like a competent operations colleague: lead with the number or the recommendation, then the reasoning in one or two sentences.

How to work:
- Always ground answers in tool results. Never invent a bin code, a ward name, a distance or a saving. If a tool returns nothing, say so plainly.
- Resolve ward names to IDs with list_wards before calling anything that takes a wardId.
- For "what should we do next", combine get_overflow_forecast with get_bins, then propose_route for the ward with the worst outlook.
- When you quote a saving, say what it is measured against (the fixed-schedule baseline) and over how many routes.

Be direct and brief — two or three short paragraphs at most, or a short list. Use plain figures with units (km, litres, ৳, kg CO2). No preamble, no restating the question.

Scope: you can read operational data and compute route proposals. You cannot assign trucks, change complaint status, or message citizens — if asked, say that it needs a staff member to confirm in the dashboard, and offer the plan instead.`;

/* ────────────────────────────  CLAUDE PATH  ────────────────────────────── */

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function askClaude(
  message: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<AgentReply> {
  const client = new Anthropic();
  const toolCalls: { name: string; input: unknown }[] = [];

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    // Server-side fallback: if a safety classifier declines the request, the
    // API routes to a comparable model instead of returning nothing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: agentTools,
    messages: [...history, { role: "user", content: message }],
    max_iterations: 8,
  });

  // Iterate so tool calls can be recorded for the UI's "what it looked at" trail.
  for await (const msg of runner) {
    for (const block of msg.content) {
      if (block.type === "tool_use") {
        toolCalls.push({ name: block.name, input: block.input });
      }
    }
  }

  const final = await runner.done();
  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error(
      final.stop_reason === "refusal"
        ? "The request was declined by the model's safety classifier."
        : "Claude returned no text content."
    );
  }

  return { text, source: "claude", toolCalls };
}

/* ───────────────────────────  OFFLINE PATH  ───────────────────────────── */

/**
 * Rule-based advisor. Matches the question against a small set of operational
 * intents and answers each one from a real query. It is narrower than Claude
 * and does not chain reasoning, but it is always available and never wrong
 * about the data, because it reads the same tables.
 */
async function askOffline(message: string): Promise<AgentReply> {
  const q = message.toLowerCase();
  const toolCalls: { name: string; input: unknown }[] = [];
  const note = (name: string, input: unknown) => toolCalls.push({ name, input });

  /* — savings / impact — */
  if (/sav|impact|cost|fuel|co2|carbon|money|taka|৳|efficien/.test(q)) {
    note("get_impact_summary", {});
    const [agg] = await db
      .select({
        n: sql<number>`count(*)`,
        base: sql<number>`coalesce(round(sum(${routeComparisons.baselineDistanceKm}),1),0)`,
        opt: sql<number>`coalesce(round(sum(${routeComparisons.optimizedDistanceKm}),1),0)`,
        pct: sql<number>`coalesce(round(avg(${routeComparisons.distanceSavedPercent}),1),0)`,
        fuel: sql<number>`coalesce(round(sum(${routeComparisons.fuelSavedLitres}),1),0)`,
        cost: sql<number>`coalesce(round(sum(${routeComparisons.costSavedBdt})),0)`,
        co2: sql<number>`coalesce(round(sum(${routeComparisons.co2SavedKg}),1),0)`,
        wasted: sql<number>`coalesce(sum(${routeComparisons.wastedStopsAvoided}),0)`,
      })
      .from(routeComparisons);

    if (Number(agg?.n ?? 0) === 0) {
      return {
        text: "No routes have been scored yet. Generate a route from the dashboard and the baseline comparison will be computed automatically.",
        source: "offline",
        toolCalls,
      };
    }
    return {
      text: `Across ${agg.n} scored route${Number(agg.n) === 1 ? "" : "s"}, optimized routing covered ${agg.opt} km against a fixed-schedule baseline of ${agg.base} km — an average reduction of ${agg.pct}%.\n\nThat is ${agg.fuel} litres of diesel not burned, ৳${Number(agg.cost).toLocaleString("en-BD")} saved, and ${agg.co2} kg of CO₂ avoided. It also skipped ${agg.wasted} stops at bins that were not full enough to be worth visiting.`,
      source: "offline",
      toolCalls,
    };
  }

  /* — forecast / what happens next — */
  if (/forecast|predict|overflow|next|soon|will|upcoming|before/.test(q)) {
    note("get_overflow_forecast", { hours: 12 });
    const rows = await db
      .select({
        binCode: bins.binCode,
        landmark: bins.landmark,
        ward: wards.name,
        fill: bins.currentFillPercent,
        hours: binForecasts.hoursToOverflow,
        confidence: binForecasts.confidence,
      })
      .from(binForecasts)
      .innerJoin(bins, eq(binForecasts.binId, bins.binId))
      .innerJoin(wards, eq(bins.wardId, wards.wardId))
      .where(
        and(
          sql`${binForecasts.hoursToOverflow} is not null`,
          sql`${binForecasts.hoursToOverflow} <= 12`
        )
      )
      .orderBy(binForecasts.hoursToOverflow)
      .limit(8);

    if (rows.length === 0) {
      return {
        text: "No bin is forecast to overflow in the next 12 hours. The network is in good shape right now.",
        source: "offline",
        toolCalls,
      };
    }
    const lines = rows
      .map(
        r =>
          `• ${r.binCode} — ${r.landmark} (${r.ward}) · ${r.fill}% now · overflows in ~${r.hours}h (confidence ${Math.round(Number(r.confidence) * 100)}%)`
      )
      .join("\n");
    return {
      text: `${rows.length} bin${rows.length === 1 ? " is" : "s are"} forecast to overflow within 12 hours:\n\n${lines}\n\nGenerate a route for the worst-affected ward to reach these before they spill.`,
      source: "offline",
      toolCalls,
    };
  }

  /* — critical bins right now — */
  if (/critical|urgent|full|worst|attention|priorit|now/.test(q)) {
    note("get_bins", { minFillPercent: 85 });
    const rows = await db
      .select({
        binCode: bins.binCode,
        landmark: bins.landmark,
        ward: wards.name,
        fill: bins.currentFillPercent,
      })
      .from(bins)
      .innerJoin(wards, eq(bins.wardId, wards.wardId))
      .where(and(eq(bins.operationalStatus, "active"), sql`${bins.currentFillPercent} >= 85`))
      .orderBy(desc(bins.currentFillPercent))
      .limit(10);

    if (rows.length === 0) {
      return {
        text: "No bin is above 85% right now. Nothing needs urgent collection.",
        source: "offline",
        toolCalls,
      };
    }
    const lines = rows.map(r => `• ${r.binCode} — ${r.landmark} (${r.ward}) · ${r.fill}%`).join("\n");
    const worstWard = rows[0].ward;
    return {
      text: `${rows.length} bin${rows.length === 1 ? " is" : "s are"} at or above 85%:\n\n${lines}\n\n${worstWard} has the fullest bin. Generate a route there first.`,
      source: "offline",
      toolCalls,
    };
  }

  /* — complaints — */
  if (/complaint|citizen|report|resolv|sms|ussd/.test(q)) {
    note("get_complaints", { status: "open" });
    const [agg] = await db
      .select({
        total: sql<number>`count(*)`,
        open: sql<number>`sum(case when ${complaints.status} in ('pending','assigned','in_progress') then 1 else 0 end)`,
        urgent: sql<number>`sum(case when ${complaints.priority}='urgent' and ${complaints.status}!='resolved' then 1 else 0 end)`,
        avgHours: sql<number>`coalesce(round(avg(case when ${complaints.resolvedAt} is not null then (julianday(${complaints.resolvedAt})-julianday(${complaints.createdAt}))*24 end),1),0)`,
        sms: sql<number>`sum(case when ${complaints.channel} in ('sms','ussd') then 1 else 0 end)`,
      })
      .from(complaints);

    return {
      text: `${agg.open} of ${agg.total} complaints are still open, ${agg.urgent} of them urgent. Average time from filing to resolution is ${agg.avgHours} hours.\n\n${agg.sms} arrived through the SMS/USSD channel rather than the web form — that is the share of residents who would have had no trackable way to report at all.`,
      source: "offline",
      toolCalls,
    };
  }

  /* — fleet — */
  if (/truck|fleet|driver|vehicle|capacity/.test(q)) {
    note("get_fleet_status", {});
    const rows = await db
      .select({
        plate: trucks.plateNumber,
        status: trucks.status,
        capacityKg: trucks.capacityKg,
        ward: wards.name,
      })
      .from(trucks)
      .leftJoin(wards, eq(trucks.homeWardId, wards.wardId));
    const available = rows.filter(r => r.status === "available").length;
    const lines = rows
      .map(r => `• ${r.plate} — ${r.status} · ${r.capacityKg} kg · ${r.ward ?? "unassigned"}`)
      .join("\n");
    return {
      text: `${available} of ${rows.length} trucks are available.\n\n${lines}`,
      source: "offline",
      toolCalls,
    };
  }

  /* — ward overview / default — */
  note("list_wards", {});
  const rows = await db
    .select({
      name: wards.name,
      binCount: sql<number>`count(${bins.binId})`,
      avgFill: sql<number>`coalesce(round(avg(${bins.currentFillPercent}),1),0)`,
      critical: sql<number>`sum(case when ${bins.currentFillPercent} >= 85 then 1 else 0 end)`,
    })
    .from(wards)
    .leftJoin(bins, and(eq(bins.wardId, wards.wardId), eq(bins.operationalStatus, "active")))
    .groupBy(wards.wardId)
    .orderBy(desc(sql`avg(${bins.currentFillPercent})`));

  const lines = rows
    .map(r => `• ${r.name} — ${r.binCount} bins · ${r.avgFill}% average · ${r.critical} critical`)
    .join("\n");

  return {
    text: `Current picture across ${rows.length} wards:\n\n${lines}\n\nAsk me about overflow forecasts, open complaints, fleet status, or measured savings.`,
    source: "offline",
    toolCalls,
  };
}

/* ─────────────────────────────  ENTRY POINT  ───────────────────────────── */

export async function ask(
  message: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<AgentReply> {
  if (!isClaudeConfigured()) {
    const reply = await askOffline(message);
    return { ...reply, fallbackReason: "No ANTHROPIC_API_KEY configured — using the offline advisor." };
  }

  try {
    return await askClaude(message, history);
  } catch (err) {
    // Network down, rate limited, bad key, refusal — the demo continues.
    const reason =
      err instanceof Anthropic.APIError
        ? `Claude API error ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    console.warn("[agent] Claude unavailable, falling back to offline advisor:", reason);
    const reply = await askOffline(message);
    return { ...reply, fallbackReason: reason };
  }
}
