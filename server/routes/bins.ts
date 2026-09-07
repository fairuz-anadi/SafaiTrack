/** Bins, wards, sensor readings and overflow forecasts. */
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { reportFillSchema } from "../../shared/schemas.js";
import type { BinView } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { type AppEnv, optionalAuth, requireAuth } from "../middleware/auth.js";
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

  return c.json({ bins: rows as BinView[] });
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

  return c.json({ bin: row, readings: readings.reverse() });
});

/**
 * Citizen-reported fill level. Recorded through the same table the simulated
 * feed writes to, with `readingSource: "citizen"` — so a citizen report and a
 * sensor reading are interchangeable inputs to the router.
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

  await db.insert(binSensorReadings).values({
    binId,
    readingNo: Number(maxNo) + 1,
    recordedAt: new Date().toISOString(),
    fillLevelPercent,
    readingSource: "citizen",
    reportedByCitizenId: user.userId,
    isValid: true,
  });

  // A citizen standing at the bin is better evidence than an extrapolation,
  // so the report becomes the bin's current state.
  await db.update(bins).set({ currentFillPercent: fillLevelPercent }).where(eq(bins.binId, binId));

  if (user.role === "citizen") {
    await db
      .update(citizens)
      .set({ reportsFiled: sql`${citizens.reportsFiled} + 1` })
      .where(eq(citizens.userId, user.userId));
  }

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

binRoutes.get("/waste-categories", async c => {
  const rows = await db.select().from(wasteCategories).orderBy(wasteCategories.categoryName);
  return c.json({ categories: rows });
});

/** Bins predicted to overflow within `hours`, most urgent first. */
binRoutes.get("/forecasts", optionalAuth, async c => {
  const hours = Number(c.req.query("hours") ?? 12);
  const wardId = c.req.query("wardId");

  const conditions = [sql`${binForecasts.hoursToOverflow} is not null`, sql`${binForecasts.hoursToOverflow} <= ${hours}`];
  if (wardId) conditions.push(eq(bins.wardId, Number(wardId)));

  const rows = await db
    .select({
      binId: bins.binId,
      binCode: bins.binCode,
      landmark: bins.landmark,
      wardName: wards.name,
      latitude: bins.latitude,
      longitude: bins.longitude,
      currentFillPercent: bins.currentFillPercent,
      fillRatePctPerHour: binForecasts.fillRatePctPerHour,
      hoursToOverflow: binForecasts.hoursToOverflow,
      predictedOverflowAt: binForecasts.predictedOverflowAt,
      confidence: binForecasts.confidence,
      sampleSize: binForecasts.sampleSize,
    })
    .from(binForecasts)
    .innerJoin(bins, eq(binForecasts.binId, bins.binId))
    .innerJoin(wards, eq(bins.wardId, wards.wardId))
    .where(and(...conditions))
    .orderBy(binForecasts.hoursToOverflow);

  return c.json({ forecasts: rows, horizonHours: hours });
});

binRoutes.post("/forecasts/refresh", requireAuth, async c => {
  const count = await refreshAllForecasts();
  return c.json({ ok: true, binsForecast: count });
});
