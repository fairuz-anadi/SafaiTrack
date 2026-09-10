import { and, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { IMPACT_CONSTANTS, binTone } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { projectAnnual } from "./impact.js";
import { readOperationalBins } from "./operational-data.js";

/** One scoped read model for dashboard KPIs and explanations. No write or provider calls. */
export async function readDashboard(wardId?: number, lookaheadHours = 8) {
  const wards = await db.select().from(schema.wards).where(wardId === undefined ? undefined : eq(schema.wards.wardId, wardId));
  if (wardId !== undefined && !wards.length) throw new HTTPException(404, { message: "Ward not found" });
  const { bins, clock } = await readOperationalBins(wardId);
  const complaints = await db.select({ status: schema.complaints.status, priority: schema.complaints.priority, createdAt: schema.complaints.createdAt, resolvedAt: schema.complaints.resolvedAt }).from(schema.complaints)
    .leftJoin(schema.bins, eq(schema.complaints.binId, schema.bins.binId))
    .where(wardId === undefined ? undefined : sql`coalesce(${schema.complaints.wardId}, ${schema.bins.wardId}) = ${wardId}`);
  const routes = await db.select().from(schema.routes).where(wardId === undefined ? undefined : eq(schema.routes.wardId, wardId));
  const comparisons = await db.select({ comparison: schema.routeComparisons, status: schema.routes.status }).from(schema.routeComparisons)
    .innerJoin(schema.routes, eq(schema.routes.routeId, schema.routeComparisons.routeId))
    .where(and(sql`${schema.routes.status} != 'cancelled'`, wardId === undefined ? undefined : eq(schema.routes.wardId, wardId)))
    .orderBy(desc(schema.routeComparisons.comparisonId));
  // A route may have several historical scores; do not double-count it.
  const seen = new Set<number>();
  const latest = comparisons.filter(r => !seen.has(r.comparison.routeId) && !!seen.add(r.comparison.routeId));
  const trucks = await db.select({ status: schema.trucks.status }).from(schema.trucks).where(wardId === undefined ? undefined : eq(schema.trucks.homeWardId, wardId));
  const [{ collections }] = await db.select({ collections: sql<number>`count(*)` }).from(schema.collectionHistory).innerJoin(schema.bins, eq(schema.bins.binId, schema.collectionHistory.binId)).where(wardId === undefined ? undefined : eq(schema.bins.wardId, wardId));
  const total = bins.length;
  const count = (tone: ReturnType<typeof binTone>) => bins.filter(b => binTone(b.currentFillPercent) === tone).length;
  const open = complaints.filter(c => ["pending", "assigned", "in_progress"].includes(c.status));
  const resolved = complaints.filter(c => c.status === "resolved" && c.resolvedAt);
  const sum = (key: "baselineDistanceKm" | "optimizedDistanceKm" | "fuelSavedLitres" | "costSavedBdt" | "co2SavedKg" | "wastedStopsAvoided", rows = latest) => round(rows.reduce((s, r) => s + r.comparison[key], 0));
  const groupedImpact = (rows: typeof latest) => ({ routes: rows.length, modeledFuelSavedLitres: sum("fuelSavedLitres", rows), modeledCostSavedBdt: sum("costSavedBdt", rows), modeledCo2SavedKg: sum("co2SavedKg", rows) });
  const impact = {
    routesScored: latest.length, totalBaselineKm: sum("baselineDistanceKm"), totalOptimizedKm: sum("optimizedDistanceKm"),
    avgSavedPercent: latest.length ? round(latest.reduce((s, r) => s + r.comparison.distanceSavedPercent, 0) / latest.length) : 0,
    fuelSavedLitres: sum("fuelSavedLitres"), costSavedBdt: sum("costSavedBdt"), co2SavedKg: sum("co2SavedKg"), wastedStopsAvoided: sum("wastedStopsAvoided"),
    planned: groupedImpact(latest.filter(r => r.status !== "completed")), completedModeled: groupedImpact(latest.filter(r => r.status === "completed")),
    actualFuelSavingsKnown: false,
    annual: latest.length ? projectAnnual(sum("costSavedBdt") / latest.length, sum("co2SavedKg") / latest.length, wards.length) : { runsPerYear: 0, annualCostSavedBdt: 0, annualCo2SavedTonnes: 0 },
  };
  return {
    scope: { wardId: wardId ?? null }, wardName: wardId === undefined ? null : wards[0].name, dataAsOf: clock.simClock, timeBasis: "mixed" as const,
    bins: { total, healthy: count("healthy"), watch: count("watch"), high: count("high"), critical: count("critical"), avgFill: total ? round(bins.reduce((s, b) => s + b.currentFillPercent, 0) / total) : 0, overflowing: bins.filter(b => b.currentFillPercent >= 100).length, overflowHours: round(bins.reduce((s, b) => s + b.overflowHoursTotal, 0)) },
    forecasting: { lookaheadHours, additionalAtRisk: bins.filter(b => b.currentFillPercent < 100 && b.forecast.hoursToOverflow !== null && b.forecast.hoursToOverflow <= lookaheadHours).length, usableForecastCount: bins.filter(b => !b.forecastStale && !b.forecastMissing).length, staleForecastCount: bins.filter(b => b.forecastStale && !b.forecastMissing).length, missingForecastCount: bins.filter(b => b.forecastMissing).length, refittedOnRead: true },
    complaints: { total: complaints.length, open: open.length, resolved: resolved.length, urgent: open.filter(c => c.priority === "urgent").length, highPriority: open.filter(c => c.priority === "high").length, avgResolutionHours: resolved.length ? round(resolved.reduce((s, c) => s + (Date.parse(c.resolvedAt!) - Date.parse(c.createdAt)) / 3_600_000, 0) / resolved.length) : 0 },
    routes: { total: routes.length, active: routes.filter(r => ["assigned", "in_progress"].includes(r.status)).length, completed: routes.filter(r => r.status === "completed").length, distanceKm: round(routes.reduce((s, r) => s + r.totalDistanceKm, 0)) },
    fleet: { availableTrucks: trucks.filter(t => t.status === "available").length },
    completedCollections: Number(collections), impact, simulation: clock, constants: IMPACT_CONSTANTS,
    latestModeledComparison: latest[0]?.comparison ?? null,
  };
}
const round = (n: number) => Math.round(n * 100) / 100;
export type DashboardData = Awaited<ReturnType<typeof readDashboard>>;
