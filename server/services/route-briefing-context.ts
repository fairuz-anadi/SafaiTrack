import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { EvidenceSnapshot, Language, Localized } from "../../shared/briefings.js";
import type { RouteBriefingInput } from "../../shared/schemas.js";
import { IMPACT_CONSTANTS, type AuthUser } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { authorizedWard, assertRouteAccess } from "./access.js";
import { calculateRoutePlan, type RoutePlan } from "./route-plan.js";

// Retain the calculated preview, not an AI answer. Never silently re-plan an expired preview.
const previews = new Map<string, { plan: RoutePlan; expires: number }>();
export function rememberPreview(plan: RoutePlan): string {
  for (const [key, value] of previews) if (value.expires < Date.now()) previews.delete(key);
  if (previews.size >= 100) previews.delete(previews.keys().next().value!);
  const id = randomUUID();
  previews.set(id, { plan, expires: Date.now() + 5 * 60_000 });
  return id;
}

/** The technical account, shown only when a reader asks how a number is produced. */
export const routeMethodNotes: Record<Language, string[]> = {
  en: [
    "Distances use Haversine straight-line geometry multiplied by a 1.35 road factor, not a street routing engine or driven GPS distance.",
    "Stops are ordered by a priority nearest-neighbour pass over a distance graph, then refined by 2-opt. The result is a good order, not a proven minimum.",
    "Truck capacity, shift length, road access and waste-category compatibility are not validated by this calculation.",
    "Fuel, cost and CO₂ are derived from the modeled distance difference using fixed coefficients. No counterfactual fuel measurement exists, including for completed routes.",
    "Overflow projections are fitted by ordinary least squares over recent valid readings; the confidence figure is a heuristic score, not a calibrated probability.",
  ],
  bn: [
    "দূরত্ব বের করা হয় Haversine সরলরেখার হিসাবে 1.35 সড়ক গুণক দিয়ে; এটি সড়কভিত্তিক রুটিং ইঞ্জিন বা GPS-এ মাপা দূরত্ব নয়।",
    "স্টপের ক্রম ঠিক হয় দূরত্ব গ্রাফে অগ্রাধিকারভিত্তিক nearest-neighbour দিয়ে, পরে 2-opt দিয়ে উন্নত করা হয়। ফলটি ভালো ক্রম, প্রমাণিত সর্বনিম্ন নয়।",
    "ট্রাকের ধারণক্ষমতা, শিফটের দৈর্ঘ্য, রাস্তায় প্রবেশযোগ্যতা ও বর্জ্যের শ্রেণির সামঞ্জস্য এই গণনায় যাচাই হয় না।",
    "জ্বালানি, খরচ ও CO₂ আসে মডেল করা দূরত্বের পার্থক্য থেকে নির্দিষ্ট সহগ দিয়ে। সম্পন্ন রুটসহ কোথাও প্রকৃত জ্বালানির তুলনামূলক পরিমাপ নেই।",
    "ভরে যাওয়ার পূর্বাভাস সাম্প্রতিক বৈধ রিডিংয়ের উপর ordinary least squares দিয়ে বসানো; আস্থার মানটি একটি হিউরিস্টিক স্কোর, নিশ্চিত সম্ভাবনা নয়।",
  ],
};

/** Plain-language caveats. Prose never writes one of these, so it never has to phrase a negation. */
export const routeNotes: Record<string, Localized> = {
  estimates: {
    en: "The savings here are planning estimates from the route comparison, not amounts measured after a collection.",
    bn: "এখানকার সাশ্রয় রুট তুলনা থেকে পাওয়া পরিকল্পনার অনুমান, সংগ্রহের পরে মাপা পরিমাণ নয়।",
  },
  distance_model: {
    en: "Distances are straight-line estimates with a road adjustment, so they will differ from what the truck actually drives.",
    bn: "দূরত্ব সরলরেখার হিসাবে সড়ক সমন্বয় করে বের করা, তাই ট্রাকের প্রকৃত পথের সঙ্গে পার্থক্য থাকবে।",
  },
  not_dispatched: {
    en: "This is a plan. Nothing has been sent to a driver as a result of this explanation.",
    bn: "এটি একটি পরিকল্পনা। এই ব্যাখ্যার কারণে কোনো চালকের কাছে কিছু যায়নি।",
  },
  unknown_history: {
    en: "The settings used when this route was created were not stored, so parts of it cannot be explained from the record.",
    bn: "রুটটি তৈরির সময়ের সেটিংস সংরক্ষণ করা হয়নি, তাই রেকর্ড থেকে এর কিছু অংশ ব্যাখ্যা করা যায় না।",
  },
  forecast_estimate: {
    en: "Bins added from the overflow outlook are an estimate from recent readings, not a certainty.",
    bn: "ভরে যাওয়ার আউটলুক থেকে যোগ হওয়া বিনগুলো সাম্প্রতিক রিডিং থেকে করা অনুমান, নিশ্চিত কিছু নয়।",
  },
  field_conditions: {
    en: "The plan does not look at road conditions or vehicle limits, so the crew may need to adapt on the ground.",
    bn: "পরিকল্পনায় রাস্তার পরিস্থিতি বা গাড়ির সীমা ধরা হয়নি, তাই মাঠে ক্রু-কে মানিয়ে নিতে হতে পারে।",
  },
  order_not_proven: {
    en: "The stop order is an improved one rather than a proven best one.",
    bn: "স্টপের ক্রমটি উন্নত করা ক্রম, প্রমাণিত সেরা ক্রম নয়।",
  },
};

export function routeSnapshot(plan: RoutePlan, role: string): EvidenceSnapshot {
  const { input, optimized, comparison: c } = plan;
  const selected = optimized.order.map((node, index) => {
    const bin = plan.wardBins.find(candidate => candidate.binId === node.id)!;
    const byThreshold = bin.currentFillPercent >= input.thresholdPercent;
    const byForecast = bin.forecast.hoursToOverflow !== null && bin.forecast.hoursToOverflow <= input.lookaheadHours;
    return {
      binId: bin.binId, binCode: bin.binCode, sequence: index + 1, currentFillPercent: bin.currentFillPercent,
      selectionReason: byThreshold ? (byForecast ? "threshold_and_forecast" : "threshold") : "forecast",
      forecastHoursToOverflow: bin.forecast.hoursToOverflow, forecastConfidence: bin.forecast.confidence,
    };
  });
  return buildRouteSnapshot({
    role, wardId: input.wardId, wardName: plan.ward.name, dataAsOf: plan.clock.simClock, routeCode: null,
    target: { kind: "preview", wardId: input.wardId },
    provenance: { persisted: false, dispatched: false, completed: false, timeBasis: "simulation", status: "preview" },
    selection: {
      activeBinCount: plan.wardBins.length, selectedBinCount: selected.length, excludedBinCount: plan.wardBins.length - selected.length,
      thresholdSelected: selected.filter(stop => stop.selectionReason !== "forecast").length,
      forecastSelected: selected.filter(stop => stop.selectionReason === "forecast").length,
      thresholdPercent: input.thresholdPercent, lookaheadHours: input.lookaheadHours, maxStops: input.maxStops, reasonsKnown: true,
    },
    stops: selected,
    comparison: {
      baselineDistanceKm: c.baselineDistanceKm, optimizedDistanceKm: c.optimizedDistanceKm,
      distanceSavedKm: round(c.baselineDistanceKm - c.optimizedDistanceKm), distanceSavedPercent: c.distanceSavedPercent,
      baselineMinutes: c.baselineMinutes, optimizedMinutes: c.optimizedMinutes,
      modeledFuelSavedLitres: c.fuelSavedLitres, modeledCostSavedBdt: c.costSavedBdt, modeledCo2SavedKg: c.co2SavedKg,
    },
    assumptions: { distanceMethod: "Haversine × 1.35", fuelLitresPerKm: plan.fuelLitresPerKm, ...IMPACT_CONSTANTS },
  });
}

interface RouteFacts {
  role: string; wardId: number; wardName: string | null; dataAsOf: string; routeCode: string | null;
  target: Record<string, unknown>;
  provenance: { persisted: boolean; dispatched: boolean; completed: boolean; timeBasis: string; status: string };
  selection: {
    activeBinCount: number | null; selectedBinCount: number; excludedBinCount: number | null; reasonsKnown: boolean;
    thresholdSelected: number | null; forecastSelected: number | null;
    thresholdPercent?: number; lookaheadHours?: number; maxStops?: number;
  };
  stops: { binId: number; binCode: string; currentFillPercent: number; plannedFillPercent?: number | null; sequence: number; selectionReason?: string; forecastHoursToOverflow?: number | null; forecastConfidence?: number | null }[];
  comparison: {
    baselineDistanceKm: number; optimizedDistanceKm: number; distanceSavedKm: number; distanceSavedPercent: number;
    baselineMinutes?: number; optimizedMinutes?: number | null;
    modeledFuelSavedLitres: number; modeledCostSavedBdt: number; modeledCo2SavedKg: number;
  } | null;
  assumptions: Record<string, unknown>;
}

export function buildRouteSnapshot(facts: RouteFacts): EvidenceSnapshot {
  const { selection, comparison, provenance } = facts;
  const snapshot: EvidenceSnapshot = {
    feature: "route",
    scope: { role: facts.role, wardId: facts.wardId },
    dataAsOf: facts.dataAsOf,
    context: { target: facts.target, provenance, selection, stops: facts.stops, comparison, assumptions: facts.assumptions },
    evidence: {},
    identities: [
      ...facts.stops.map(stop => stop.binCode),
      ...(facts.routeCode ? [facts.routeCode] : []),
      ...(facts.wardName ? [facts.wardName] : []),
      `Ward ${facts.wardId}`,
    ],
    notes: routeNotes,
    mandatoryNotes: [],
    methodNotes: structuredClone(routeMethodNotes),
    highlights: [],
    suggestedQuestions: [],
    sectionLabels: ["selection", "savings", "outlook", "next_step"],
    allowedViews: ["critical_bins", "forecasts", ...(facts.role === "staff" ? (["routes"] as const) : [])],
    historyAvailable: false,
    focus: null,
  };
  const record = (id: string, value: string | number | boolean | null, kind: EvidenceSnapshot["evidence"][string]["kind"], label: string) => {
    snapshot.evidence[id] = { value, kind, label };
  };

  for (const [key, value] of Object.entries(selection)) {
    if (typeof value === "number") record(`selection.${key}`, value, selection.reasonsKnown ? "modeled" : "unknown", key);
  }
  record("scope.wardId", facts.wardId, "observation", "ward");
  for (const stop of facts.stops) {
    record(`stop.${stop.binId}`, stop.binCode, selection.reasonsKnown ? "modeled" : "unknown", `stop ${stop.sequence}`);
    record(`stop.${stop.binId}.fill`, stop.currentFillPercent, "observation", `${stop.binCode} current fill`);
    if (stop.forecastHoursToOverflow !== null && stop.forecastHoursToOverflow !== undefined) {
      record(`stop.${stop.binId}.hours`, stop.forecastHoursToOverflow, "forecast", `${stop.binCode} hours to overflow`);
    }
  }
  for (const [key, value] of Object.entries(facts.assumptions)) {
    if (typeof value === "number") record(`assumptions.${key}`, value, "assumption", key);
  }

  if (comparison) {
    for (const [key, value] of Object.entries(comparison)) {
      if (typeof value === "number") record(`comparison.${key}`, value, "modeled", key);
    }
    // Rounded the way the copy rounds it, so the figure on the card matches the sentence beside it.
    const percent = `~${Math.round(comparison.distanceSavedPercent)}%`;
    const km = Math.round(comparison.distanceSavedKm * 10) / 10;
    snapshot.highlights = [
      { value: { en: percent, bn: percent }, label: { en: "less planned travel", bn: "কম পরিকল্পিত পথ" } },
      { value: { en: `~${km} km`, bn: `~${km} কিমি` }, label: { en: "shorter than the fixed-order run", bn: "কোড-ক্রমে ঘোরার চেয়ে কম" } },
    ];
    snapshot.mandatoryNotes.push("estimates");
  }
  if (!provenance.dispatched) snapshot.mandatoryNotes.push("not_dispatched");
  if (!selection.reasonsKnown) snapshot.mandatoryNotes.push("unknown_history");
  if (selection.forecastSelected) snapshot.mandatoryNotes.push("forecast_estimate");

  const ask = (en: string, bn: string) => snapshot.suggestedQuestions.push({ en, bn });
  if (selection.reasonsKnown) ask("Why were these bins selected?", "এই বিনগুলো কেন বাছাই হলো?");
  if (comparison) {
    ask("Why is this route shorter?", "এই রুটটি ছোট কেন?");
    ask("Are these savings actual or estimated?", "এই সাশ্রয় কি প্রকৃত, নাকি অনুমান?");
  }
  ask("What should I know before dispatch?", "পাঠানোর আগে কী জানা দরকার?");
  ask("How is this calculated?", "এটি কীভাবে হিসাব করা হয়?");

  return snapshot;
}

export async function routeBriefingContext(user: AuthUser, target: RouteBriefingInput["target"]): Promise<EvidenceSnapshot> {
  if (target.kind === "preview") {
    authorizedWard(user, target.wardId);
    let plan: RoutePlan;
    if (target.previewId) {
      const entry = previews.get(target.previewId);
      if (!entry || entry.expires < Date.now()) throw new HTTPException(409, { message: "Preview expired; refresh the preview before explaining it" });
      plan = entry.plan;
      authorizedWard(user, plan.input.wardId);
      for (const key of ["wardId", "thresholdPercent", "lookaheadHours", "maxStops"] as const) {
        if (plan.input[key] !== target[key]) throw new HTTPException(409, { message: "Preview parameters changed" });
      }
    } else {
      // Parameter-only requests create one authoritative dry-run; the model never replans.
      plan = await calculateRoutePlan(target);
    }
    return routeSnapshot(plan, user.role);
  }

  const route = await assertRouteAccess(user, target.routeId);
  const stops = await db.select({
    binId: schema.routeStops.binId, binCode: schema.bins.binCode, sequence: schema.routeStops.sequenceOrder,
    currentFillPercent: schema.bins.currentFillPercent, plannedFillPercent: schema.routeStops.plannedFillPercent,
  }).from(schema.routeStops).innerJoin(schema.bins, eq(schema.bins.binId, schema.routeStops.binId))
    .where(eq(schema.routeStops.routeId, route.routeId)).orderBy(schema.routeStops.sequenceOrder);
  const [comparison] = await db.select().from(schema.routeComparisons).where(eq(schema.routeComparisons.routeId, route.routeId))
    .orderBy(desc(schema.routeComparisons.computedAt), desc(schema.routeComparisons.comparisonId)).limit(1);
  const [ward] = await db.select({ name: schema.wards.name }).from(schema.wards).where(eq(schema.wards.wardId, route.wardId));

  return buildRouteSnapshot({
    role: user.role, wardId: route.wardId, wardName: ward?.name ?? null, dataAsOf: route.generatedAt, routeCode: route.routeCode,
    target: { kind: "saved_route", routeId: route.routeId },
    provenance: {
      persisted: true, dispatched: ["assigned", "in_progress", "completed"].includes(route.status),
      completed: route.status === "completed", status: route.status, timeBasis: "mixed",
    },
    selection: { activeBinCount: null, selectedBinCount: stops.length, excludedBinCount: null, thresholdSelected: null, forecastSelected: null, reasonsKnown: false },
    stops,
    comparison: comparison
      ? {
          baselineDistanceKm: comparison.baselineDistanceKm, optimizedDistanceKm: comparison.optimizedDistanceKm,
          distanceSavedKm: round(comparison.baselineDistanceKm - comparison.optimizedDistanceKm), distanceSavedPercent: comparison.distanceSavedPercent,
          optimizedMinutes: route.estimatedMinutes, modeledFuelSavedLitres: comparison.fuelSavedLitres,
          modeledCostSavedBdt: comparison.costSavedBdt, modeledCo2SavedKg: comparison.co2SavedKg,
        }
      : null,
    assumptions: { historicalParametersKnown: false, algorithmName: route.algorithmName },
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
