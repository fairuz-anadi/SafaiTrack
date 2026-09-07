/** Analytics dashboard, impact totals, and simulation control. */
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { simulationControlSchema } from "../../shared/schemas.js";
import { IMPACT_CONSTANTS } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { type AppEnv, optionalAuth, requireRole } from "../middleware/auth.js";
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
  const wardId = c.req.query("wardId");
  const wardFilter = wardId ? eq(bins.wardId, Number(wardId)) : undefined;

  const [binStats] = await db
    .select({
      total: sql<number>`count(*)`,
      avgFill: sql<number>`coalesce(avg(${bins.currentFillPercent}), 0)`,
      critical: sql<number>`sum(case when ${bins.currentFillPercent} >= 85 then 1 else 0 end)`,
      overflowing: sql<number>`sum(case when ${bins.currentFillPercent} >= 100 then 1 else 0 end)`,
      overflowHours: sql<number>`coalesce(sum(${bins.overflowHoursTotal}), 0)`,
    })
    .from(bins)
    .where(and(eq(bins.operationalStatus, "active"), wardFilter));

  const [complaintStats] = await db
    .select({
      total: sql<number>`count(*)`,
      open: sql<number>`sum(case when ${complaints.status} in ('pending','assigned','in_progress') then 1 else 0 end)`,
      resolved: sql<number>`sum(case when ${complaints.status} = 'resolved' then 1 else 0 end)`,
      urgent: sql<number>`sum(case when ${complaints.priority} = 'urgent' and ${complaints.status} != 'resolved' then 1 else 0 end)`,
    })
    .from(complaints);

  // Mean hours from filing to resolution — the accountability metric.
  const [resolution] = await db
    .select({
      avgHours: sql<number>`coalesce(avg((julianday(${complaints.resolvedAt}) - julianday(${complaints.createdAt})) * 24), 0)`,
    })
    .from(complaints)
    .where(sql`${complaints.resolvedAt} is not null`);

  const [routeStats] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`sum(case when ${routes.status} in ('assigned','in_progress') then 1 else 0 end)`,
      completed: sql<number>`sum(case when ${routes.status} = 'completed' then 1 else 0 end)`,
      distanceKm: sql<number>`coalesce(sum(${routes.totalDistanceKm}), 0)`,
    })
    .from(routes);

  const [impact] = await db
    .select({
      routesScored: sql<number>`count(*)`,
      totalBaselineKm: sql<number>`coalesce(sum(${routeComparisons.baselineDistanceKm}), 0)`,
      totalOptimizedKm: sql<number>`coalesce(sum(${routeComparisons.optimizedDistanceKm}), 0)`,
      avgSavedPercent: sql<number>`coalesce(avg(${routeComparisons.distanceSavedPercent}), 0)`,
      fuelSaved: sql<number>`coalesce(sum(${routeComparisons.fuelSavedLitres}), 0)`,
      costSaved: sql<number>`coalesce(sum(${routeComparisons.costSavedBdt}), 0)`,
      co2Saved: sql<number>`coalesce(sum(${routeComparisons.co2SavedKg}), 0)`,
      wastedStopsAvoided: sql<number>`coalesce(sum(${routeComparisons.wastedStopsAvoided}), 0)`,
    })
    .from(routeComparisons);

  const [{ wardCount }] = await db.select({ wardCount: sql<number>`count(*)` }).from(wards);

  const routesScored = Number(impact?.routesScored ?? 0);
  const annual =
    routesScored > 0
      ? projectAnnual(
          Number(impact.costSaved) / routesScored,
          Number(impact.co2Saved) / routesScored,
          Number(wardCount)
        )
      : { runsPerYear: 0, annualCostSavedBdt: 0, annualCo2SavedTonnes: 0 };

  const state = await getSimulationState();

  return c.json({
    bins: {
      total: Number(binStats?.total ?? 0),
      avgFill: round1(Number(binStats?.avgFill ?? 0)),
      critical: Number(binStats?.critical ?? 0),
      overflowing: Number(binStats?.overflowing ?? 0),
      overflowHours: round1(Number(binStats?.overflowHours ?? 0)),
    },
    complaints: {
      total: Number(complaintStats?.total ?? 0),
      open: Number(complaintStats?.open ?? 0),
      resolved: Number(complaintStats?.resolved ?? 0),
      urgent: Number(complaintStats?.urgent ?? 0),
      avgResolutionHours: round1(Number(resolution?.avgHours ?? 0)),
    },
    routes: {
      total: Number(routeStats?.total ?? 0),
      active: Number(routeStats?.active ?? 0),
      completed: Number(routeStats?.completed ?? 0),
      distanceKm: round1(Number(routeStats?.distanceKm ?? 0)),
    },
    impact: {
      routesScored,
      totalBaselineKm: round1(Number(impact?.totalBaselineKm ?? 0)),
      totalOptimizedKm: round1(Number(impact?.totalOptimizedKm ?? 0)),
      avgSavedPercent: round1(Number(impact?.avgSavedPercent ?? 0)),
      fuelSavedLitres: round1(Number(impact?.fuelSaved ?? 0)),
      costSavedBdt: Math.round(Number(impact?.costSaved ?? 0)),
      co2SavedKg: round1(Number(impact?.co2Saved ?? 0)),
      wastedStopsAvoided: Number(impact?.wastedStopsAvoided ?? 0),
      annual,
    },
    simulation: {
      simClock: state.simClock,
      ticksElapsed: state.ticksElapsed,
      minutesPerTick: state.minutesPerTick,
      isRunning: state.isRunning,
    },
    constants: IMPACT_CONSTANTS,
  });
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
