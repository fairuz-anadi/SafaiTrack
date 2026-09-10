import { and, desc, eq, lte, gte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { forecastBin } from "./forecast.js";

/** Read-only operational clock. Reading evidence must never initialize DB rows. */
export async function readClock() {
  const [state] = await db.select().from(schema.simulationState).where(eq(schema.simulationState.id, 1));
  return state ?? { simClock: new Date().toISOString(), ticksElapsed: 0, minutesPerTick: 30, isRunning: false };
}

/** Fit from authoritative readings on read, so stale materialized forecasts cannot drive a plan. */
export async function readOperationalBins(wardId?: number) {
  const clock = await readClock();
  const asOf = new Date(clock.simClock);
  const rows = await db.select().from(schema.bins).where(and(
    eq(schema.bins.operationalStatus, "active"),
    wardId === undefined ? undefined : eq(schema.bins.wardId, wardId)
  ));
  const result = await Promise.all(rows.map(async bin => {
    const readings = await db.select().from(schema.binSensorReadings).where(and(
      eq(schema.binSensorReadings.binId, bin.binId), eq(schema.binSensorReadings.isValid, true),
      lte(schema.binSensorReadings.recordedAt, clock.simClock),
      bin.lastCollectedAt ? gte(schema.binSensorReadings.recordedAt, bin.lastCollectedAt) : undefined
    )).orderBy(desc(schema.binSensorReadings.recordedAt), desc(schema.binSensorReadings.readingNo)).limit(40);
    const [stored] = await db.select().from(schema.binForecasts).where(eq(schema.binForecasts.binId, bin.binId));
    const latest = readings[0]?.recordedAt ?? null;
    const stale = !latest || asOf.getTime() - new Date(latest).getTime() > 6 * 3_600_000 || Math.abs(readings[0].fillLevelPercent - bin.currentFillPercent) > 2;
    const forecast = forecastBin(bin.currentFillPercent, readings, asOf);
    // A full bin is an observation, independent of whether its trend can be fitted.
    const hoursToOverflow = bin.currentFillPercent >= 100 ? 0 : stale ? null : forecast.hoursToOverflow;
    return { ...bin, forecast: { ...forecast, hoursToOverflow, predictedOverflowAt: hoursToOverflow === null ? null : forecast.predictedOverflowAt }, latestReadingAt: latest,
      forecastStale: stale, forecastMissing: readings.length === 0,
      storedForecastStale: !stored || stored.currentFillPercent !== bin.currentFillPercent || stored.hoursToOverflow !== forecast.hoursToOverflow,
      readingSources: [...new Set(readings.map(r => r.readingSource))] };
  }));
  return { clock, bins: result };
}

export type OperationalBin = Awaited<ReturnType<typeof readOperationalBins>>["bins"][number];
