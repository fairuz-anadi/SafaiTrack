/** Analytics dashboard, impact totals, and simulation control. */
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { simulationControlSchema } from "../../shared/schemas.js";
import { IMPACT_CONSTANTS } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { type AppEnv, optionalAuth, requireRole } from "../middleware/auth.js";
import { readDashboard } from "../services/dashboard-data.js";
import { authorizedWard, resolveOperator } from "../services/access.js";
import { projectAnnual } from "../services/impact.js";
import {
  fastForward,
  getSimulationState,
  refreshAllForecasts,
  resetClock,
  tick,
} from "../services/simulation.js";

const {
  bins,
  wards,
  routes,
  routeComparisons,
  complaints,
  complaintStatusHistory,
  collectionHistory,
  binSensorReadings,
  binForecasts,
  simulationState,
  trucks,
} = schema;

export const analyticsRoutes = new Hono<AppEnv>();

/* ───────────────────────────  HEADLINE NUMBERS  ────────────────────────── */

analyticsRoutes.get("/analytics/overview", optionalAuth, async c => {
  const requested = c.req.query("wardId");
  const wardId = requested === undefined ? undefined : Number(requested);
  if (wardId !== undefined && (!Number.isInteger(wardId) || wardId <= 0)) return c.json({ error: "Invalid ward ID" }, 400);
  const session = c.get("user");
  const scope = session?.role === "officer" ? authorizedWard(await resolveOperator(session), wardId) : wardId;
  return c.json(await readDashboard(scope));
});

/** Ward-by-ward league table. */
analyticsRoutes.get("/analytics/wards", optionalAuth, async c => {
  const rows = await db
    .select({
      wardId: wards.wardId,
      wardCode: wards.wardCode,
      name: wards.name,
      nameBn: wards.nameBn,
      population: wards.population,
      binCount: sql<number>`count(${bins.binId})`,
      avgFill: sql<number>`coalesce(avg(${bins.currentFillPercent}), 0)`,
      critical: sql<number>`sum(case when ${bins.currentFillPercent} >= 85 then 1 else 0 end)`,
      overflowHours: sql<number>`coalesce(sum(${bins.overflowHoursTotal}), 0)`,
    })
    .from(wards)
    .leftJoin(bins, and(eq(bins.wardId, wards.wardId), eq(bins.operationalStatus, "active")))
    .groupBy(wards.wardId)
    .orderBy(desc(sql`avg(${bins.currentFillPercent})`));

  // Complaint counts per ward, resolved through the bin the complaint targets.
  const complaintCounts = await db
    .select({
      wardId: bins.wardId,
      total: sql<number>`count(*)`,
      open: sql<number>`sum(case when ${complaints.status} != 'resolved' then 1 else 0 end)`,
    })
    .from(complaints)
    .innerJoin(bins, eq(complaints.binId, bins.binId))
    .groupBy(bins.wardId);

  const byWard = new Map(complaintCounts.map(r => [r.wardId, r]));

  return c.json({
    wards: rows.map(w => ({
      ...w,
      binCount: Number(w.binCount),
      avgFill: round1(Number(w.avgFill)),
      critical: Number(w.critical),
      overflowHours: round1(Number(w.overflowHours)),
      complaintsTotal: Number(byWard.get(w.wardId)?.total ?? 0),
      complaintsOpen: Number(byWard.get(w.wardId)?.open ?? 0),
    })),
  });
});

/** Fill-level trend, bucketed by hour, for the dashboard chart. */
analyticsRoutes.get("/analytics/fill-trend", optionalAuth, async c => {
  const hours = Number(c.req.query("hours") ?? 48);
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const rows = await db
    .select({
      bucket: sql<string>`strftime('%Y-%m-%dT%H:00', ${binSensorReadings.recordedAt})`,
      avgFill: sql<number>`avg(${binSensorReadings.fillLevelPercent})`,
      maxFill: sql<number>`max(${binSensorReadings.fillLevelPercent})`,
      readings: sql<number>`count(*)`,
    })
    .from(binSensorReadings)
    .where(and(gte(binSensorReadings.recordedAt, since), eq(binSensorReadings.isValid, true)))
    .groupBy(sql`strftime('%Y-%m-%dT%H:00', ${binSensorReadings.recordedAt})`)
    .orderBy(sql`strftime('%Y-%m-%dT%H:00', ${binSensorReadings.recordedAt})`);

  return c.json({
    trend: rows.map(r => ({
      bucket: r.bucket,
      avgFill: round1(Number(r.avgFill)),
      maxFill: round1(Number(r.maxFill)),
      readings: Number(r.readings),
    })),
  });
});

/** Complaint volume and resolution time by type. */
analyticsRoutes.get("/analytics/complaints", optionalAuth, async c => {
  const byType = await db
    .select({
      complaintType: complaints.complaintType,
      total: sql<number>`count(*)`,
      resolved: sql<number>`sum(case when ${complaints.status} = 'resolved' then 1 else 0 end)`,
      avgHours: sql<number>`coalesce(avg(case when ${complaints.resolvedAt} is not null then (julianday(${complaints.resolvedAt}) - julianday(${complaints.createdAt})) * 24 end), 0)`,
    })
    .from(complaints)
    .groupBy(complaints.complaintType);

  const byChannel = await db
    .select({
      channel: complaints.channel,
      total: sql<number>`count(*)`,
    })
    .from(complaints)
    .groupBy(complaints.channel);

  return c.json({
    byType: byType.map(r => ({
      ...r,
      total: Number(r.total),
      resolved: Number(r.resolved),
      avgHours: round1(Number(r.avgHours)),
    })),
    byChannel: byChannel.map(r => ({ ...r, total: Number(r.total) })),
  });
});

/** Every scored route, for the baseline-vs-optimized proof screen. */
analyticsRoutes.get("/analytics/impact", optionalAuth, async c => {
  const rows = await db
    .select({
      comparisonId: routeComparisons.comparisonId,
      routeId: routeComparisons.routeId,
      routeCode: routes.routeCode,
      wardName: wards.name,
      computedAt: routeComparisons.computedAt,
      baselineDistanceKm: routeComparisons.baselineDistanceKm,
      optimizedDistanceKm: routeComparisons.optimizedDistanceKm,
      distanceSavedPercent: routeComparisons.distanceSavedPercent,
      baselineFuelLitres: routeComparisons.baselineFuelLitres,
      optimizedFuelLitres: routeComparisons.optimizedFuelLitres,
      fuelSavedLitres: routeComparisons.fuelSavedLitres,
      costSavedBdt: routeComparisons.costSavedBdt,
      co2SavedKg: routeComparisons.co2SavedKg,
      wastedStopsAvoided: routeComparisons.wastedStopsAvoided,
      overflowsPrevented: routeComparisons.overflowsPrevented,
      baselineStopCount: routes.baselineStopCount,
      optimizedStopCount: routes.optimizedStopCount,
    })
    .from(routeComparisons)
    .innerJoin(routes, eq(routeComparisons.routeId, routes.routeId))
    .innerJoin(wards, eq(routes.wardId, wards.wardId))
    .orderBy(desc(routeComparisons.computedAt))
    .limit(40);

  return c.json({ comparisons: rows, constants: IMPACT_CONSTANTS });
});

/* ──────────────────────────  SIMULATION CONTROL  ───────────────────────── */

analyticsRoutes.get("/simulation", optionalAuth, async c => {
  const state = await getSimulationState();
  return c.json({ simulation: state });
});

analyticsRoutes.post(
  "/simulation",
  requireRole("staff"),
  zValidator("json", simulationControlSchema),
  async c => {
    const { action, ticks, minutesPerTick } = c.req.valid("json");

    if (minutesPerTick) {
      await db
        .update(simulationState)
        .set({ minutesPerTick })
        .where(eq(simulationState.id, 1));
    }

    switch (action) {
      case "tick": {
        const result = await tick();
        await refreshAllForecasts();
        return c.json({ ok: true, result });
      }
      case "fast_forward": {
        const result = await fastForward(ticks);
        return c.json({ ok: true, result });
      }
      case "start":
        await db.update(simulationState).set({ isRunning: true }).where(eq(simulationState.id, 1));
        return c.json({ ok: true, isRunning: true });
      case "pause":
        await db.update(simulationState).set({ isRunning: false }).where(eq(simulationState.id, 1));
        return c.json({ ok: true, isRunning: false });
      case "reset":
        await resetClock();
        return c.json({ ok: true, reset: true });
    }
  }
);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
