/** Bins, wards, sensor readings and overflow forecasts. */
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { reportFillSchema } from "../../shared/schemas.js";
import type { BinView } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { type AppEnv, optionalAuth, requireAuth } from "../middleware/auth.js";
import { readOperationalBins, readClock } from "../services/operational-data.js";
import { refreshAllForecasts } from "../services/simulation.js";

const {
  bins,
  wards,
  wasteCategories,
  binSensorReadings,
  binForecasts,
  collectionZones,
  citizens,
} = schema;

export const binRoutes = new Hono<AppEnv>();

/** Full bin picture, joined with ward, category and forecast. */
const binSelection = {
  binId: bins.binId,
  binCode: bins.binCode,
  wardId: bins.wardId,
  wardName: wards.name,
  zoneNo: bins.zoneNo,
  landmark: bins.landmark,
  landmarkBn: bins.landmarkBn,
  latitude: bins.latitude,
  longitude: bins.longitude,
  capacityLiters: bins.capacityLiters,
  currentFillPercent: bins.currentFillPercent,
  operationalStatus: bins.operationalStatus,
  categoryName: wasteCategories.categoryName,
  colorHex: wasteCategories.colorHex,
  lastCollectedAt: bins.lastCollectedAt,
  fillRatePctPerHour: bins.fillRatePctPerHour,
  hoursToOverflow: binForecasts.hoursToOverflow,
  predictedOverflowAt: binForecasts.predictedOverflowAt,
  forecastConfidence: binForecasts.confidence,
};

binRoutes.get("/bins", optionalAuth, async c => {
  const wardId = c.req.query("wardId");
  const minFill = c.req.query("minFill");

  const conditions = [];
  if (wardId) conditions.push(eq(bins.wardId, Number(wardId)));
  if (minFill) conditions.push(sql`${bins.currentFillPercent} >= ${Number(minFill)}`);

  const rows = await db
    .select(binSelection)
    .from(bins)
    .innerJoin(wards, eq(bins.wardId, wards.wardId))
    .innerJoin(wasteCategories, eq(bins.wasteCategoryId, wasteCategories.wasteCategoryId))
    .leftJoin(binForecasts, eq(bins.binId, binForecasts.binId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bins.currentFillPercent));

  const fresh = new Map((await readOperationalBins(wardId ? Number(wardId) : undefined)).bins.map(b => [b.binId,b.forecast]));
  return c.json({ bins: rows.map(b => ({ ...b, hoursToOverflow: fresh.get(b.binId)?.hoursToOverflow ?? null, predictedOverflowAt: fresh.get(b.binId)?.predictedOverflowAt ?? null, forecastConfidence: fresh.get(b.binId)?.confidence ?? null })) });
});

binRoutes.get("/bins/:id", optionalAuth, async c => {
  const binId = Number(c.req.param("id"));
  const [row] = await db
    .select(binSelection)
    .from(bins)
    .innerJoin(wards, eq(bins.wardId, wards.wardId))
    .innerJoin(wasteCategories, eq(bins.wasteCategoryId, wasteCategories.wasteCategoryId))
    .leftJoin(binForecasts, eq(bins.binId, binForecasts.binId))
    .where(eq(bins.binId, binId))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Bin not found" });

  const readings = await db
    .select()
    .from(binSensorReadings)
    .where(eq(binSensorReadings.binId, binId))
    .orderBy(desc(binSensorReadings.recordedAt))
    .limit(60);

  const fresh = (await readOperationalBins(row.wardId)).bins.find(b => b.binId === binId)?.forecast;
  return c.json({
    bin: {
      ...row,
      hoursToOverflow: fresh?.hoursToOverflow ?? null,
      predictedOverflowAt: fresh?.predictedOverflowAt ?? null,
      forecastConfidence: fresh?.confidence ?? null,
      // Provenance for the fill level: what was last reported, when, and what
      // that becomes once carried forward at the fitted rate.
      observedFillPercent: fresh?.observedFillPercent ?? null,
      observedAt: fresh?.observedAt ?? null,
      hoursSinceObservation: fresh?.hoursSinceObservation ?? null,
      estimatedFillPercent: fresh?.estimatedFillPercent ?? null,
    },
    readings: readings.reverse(),
  });
});

/**
 * A reported fill level, from whoever is standing at the bin.
 *
 * Recorded through the same table the simulated feed writes to, so a report
 * and a sensor reading are interchangeable inputs to the router. The source is
 * taken from the caller's role rather than passed in the body — a client
 * cannot claim to be an inspection.
 */
binRoutes.post("/bins/report-fill", requireAuth, zValidator("json", reportFillSchema), async c => {
  const user = c.get("user");
  const { binId, fillLevelPercent } = c.req.valid("json");

  const [bin] = await db.select().from(bins).where(eq(bins.binId, binId)).limit(1);
  if (!bin) throw new HTTPException(404, { message: "Bin not found" });

  const [{ maxNo }] = await db
    .select({ maxNo: sql<number>`coalesce(max(${binSensorReadings.readingNo}), 0)` })
    .from(binSensorReadings)
    .where(eq(binSensorReadings.binId, binId));

  /*
   * Staff and ward officers reading a bin on a round are inspecting it, and an
   * inspection is stronger evidence than a passer-by's estimate. Drivers get
   * their own source so a collection is never mistaken for an observation.
   */
  const readingSource =
    user.role === "officer" || user.role === "staff"
      ? "officer"
      : user.role === "driver"
        ? "driver"
        : "citizen";

  await db.insert(binSensorReadings).values({
    binId,
    readingNo: Number(maxNo) + 1,
    recordedAt: (await readClock()).simClock,
    fillLevelPercent,
    readingSource,
    reportedByCitizenId: user.userId,
    isValid: true,
  });

  // Somebody standing at the bin is better evidence than an extrapolation, so
  // the report becomes the bin's current state whoever filed it.
  await db.update(bins).set({ currentFillPercent: fillLevelPercent }).where(eq(bins.binId, binId));

  if (user.role === "citizen") {
    await db
      .update(citizens)
      .set({ reportsFiled: sql`${citizens.reportsFiled} + 1` })
      .where(eq(citizens.userId, user.userId));
  }

  await refreshAllForecasts(binId);
  return c.json({ ok: true, binId, fillLevelPercent }, 201);
});

binRoutes.get("/wards", async c => {
  const rows = await db.select().from(wards).orderBy(wards.wardCode);
  const withCounts = await Promise.all(
    rows.map(async w => {
      const [stats] = await db
        .select({
          binCount: sql<number>`count(*)`,
          avgFill: sql<number>`coalesce(avg(${bins.currentFillPercent}), 0)`,
          critical: sql<number>`sum(case when ${bins.currentFillPercent} >= 85 then 1 else 0 end)`,
        })
        .from(bins)
        .where(and(eq(bins.wardId, w.wardId), eq(bins.operationalStatus, "active")));
      return {
        ...w,
        binCount: Number(stats?.binCount ?? 0),
        avgFill: Math.round(Number(stats?.avgFill ?? 0) * 10) / 10,
        criticalCount: Number(stats?.critical ?? 0),
      };
    })
  );
  return c.json({ wards: withCounts });
});

binRoutes.get("/wards/:id/zones", async c => {
  const wardId = Number(c.req.param("id"));
  const rows = await db
    .select()
    .from(collectionZones)
    .where(eq(collectionZones.wardId, wardId))
    .orderBy(collectionZones.zoneNo);
  return c.json({ zones: rows });
});

/**
 * The waste streams, each with how many active bins currently carry it and how
 * full they are on average.
 *
 * The landing page's segregation section renders straight off this, so the
 * stream colours, the Bangla names, the handling notes and the counts all come
 * from the database rather than being retyped into the markup — which is the
 * same claim the rest of the site makes about its numbers.
 */
binRoutes.get("/waste-categories", async c => {
  const rows = await db
    .select({
      wasteCategoryId: wasteCategories.wasteCategoryId,
      categoryName: wasteCategories.categoryName,
      categoryNameBn: wasteCategories.categoryNameBn,
      handlingNotes: wasteCategories.handlingNotes,
      isHazardous: wasteCategories.isHazardous,
      colorHex: wasteCategories.colorHex,
      binCount: sql<number>`count(${bins.binId})`,
      avgFill: sql<number>`coalesce(avg(${bins.currentFillPercent}), 0)`,
    })
    .from(wasteCategories)
    .leftJoin(
      bins,
      and(eq(bins.wasteCategoryId, wasteCategories.wasteCategoryId), eq(bins.operationalStatus, "active"))
    )
    .groupBy(wasteCategories.wasteCategoryId)
    .orderBy(wasteCategories.wasteCategoryId);

  return c.json({
    categories: rows.map(r => ({
      ...r,
      binCount: Number(r.binCount),
      avgFill: Math.round(Number(r.avgFill) * 10) / 10,
    })),
  });
});

/** Bins predicted to overflow within `hours`, most urgent first. */
binRoutes.get("/forecasts", optionalAuth, async c => {
  const hours = Number(c.req.query("hours") ?? 12);
  const wardId = c.req.query("wardId");

  if (!Number.isFinite(hours) || hours < 0 || hours > 168) return c.json({ error: "Invalid horizon" }, 400);
  const { bins: current } = await readOperationalBins(wardId ? Number(wardId) : undefined);
  const wardRows = await db.select().from(wards);
  return c.json({ forecasts: current.filter(b => b.forecast.hoursToOverflow !== null && b.forecast.hoursToOverflow <= hours).sort((a,b) => a.forecast.hoursToOverflow! - b.forecast.hoursToOverflow!).map(b => ({ binId: b.binId, binCode: b.binCode, landmark: b.landmark, wardName: wardRows.find(w => w.wardId === b.wardId)?.name, latitude: b.latitude, longitude: b.longitude, currentFillPercent: b.currentFillPercent, ...b.forecast })), horizonHours: hours });
});

binRoutes.post("/forecasts/refresh", requireAuth, async c => {
  const count = await refreshAllForecasts();
  return c.json({ ok: true, binsForecast: count });
});
