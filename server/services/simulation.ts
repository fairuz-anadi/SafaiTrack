/**
 * Simulation engine — the stand-in for IoT hardware.
 *
 * The proposal's central design choice is that bin fill data is *simulated*
 * rather than sensed, so the system can be deployed without per-bin hardware
 * (§4.1). This module is that simulation: each tick advances an in-world
 * clock, grows every bin according to its own fill rate, writes a timestamped
 * reading in the exact shape a real ultrasonic sensor would emit, and lets
 * events (complaints, overflows) fall out of the data.
 *
 * Because readings are written through the same table a real sensor would
 * write to, swapping in real hardware means changing the `readingSource`
 * value and nothing else.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { forecastBin } from "./forecast.js";

const { bins, binSensorReadings, binForecasts, simulationState, notifications, users } = schema;

const HOUR_MS = 3_600_000;

export interface TickResult {
  simClock: string;
  ticksElapsed: number;
  minutesAdvanced: number;
  binsUpdated: number;
  newlyCritical: { binId: number; binCode: string; landmark: string; fillPercent: number }[];
  overflowing: number;
}

/**
 * Diurnal load factor. Dhaka wards do not fill at a constant rate — market
 * hours and evening meal prep drive most of the volume, and almost nothing
 * accumulates between midnight and dawn. Modelling this makes the fill curves
 * look like real operations data rather than a straight line.
 */
function diurnalFactor(hourOfDay: number): number {
  if (hourOfDay >= 0 && hourOfDay < 5) return 0.25; // overnight
  if (hourOfDay >= 5 && hourOfDay < 9) return 1.35; // morning market
  if (hourOfDay >= 9 && hourOfDay < 12) return 1.05;
  if (hourOfDay >= 12 && hourOfDay < 15) return 0.9;
  if (hourOfDay >= 15 && hourOfDay < 19) return 1.4; // evening peak
  if (hourOfDay >= 19 && hourOfDay < 22) return 1.15;
  return 0.5;
}

export async function getSimulationState() {
  const [state] = await db.select().from(simulationState).where(eq(simulationState.id, 1));
  if (state) return state;
  const [created] = await db
    .insert(simulationState)
    .values({ id: 1, simClock: new Date().toISOString() })
    .returning();
  return created;
}

/** Advance the world by one tick. */
export async function tick(): Promise<TickResult> {
  const state = await getSimulationState();
  const minutes = state.minutesPerTick;
  const from = new Date(state.simClock);
  const to = new Date(from.getTime() + minutes * 60_000);
  const hours = minutes / 60;

  const activeBins = await db.select().from(bins).where(eq(bins.operationalStatus, "active"));

  const newlyCritical: TickResult["newlyCritical"] = [];
  let overflowing = 0;

  for (const bin of activeBins) {
    const wasCritical = bin.currentFillPercent >= 85;

    const factor = diurnalFactor(to.getHours());
    // ±15% variance so no two ticks look mechanically identical.
    const variance = 0.85 + Math.random() * 0.3;
    const delta = bin.fillRatePctPerHour * hours * factor * variance;
    const nextFill = Math.min(100, bin.currentFillPercent + delta);

    // Time spent overflowing is what the system exists to reduce — track it.
    const overflowHours = nextFill >= 100 && bin.currentFillPercent >= 100 ? hours : 0;
    if (nextFill >= 100) overflowing++;

    await db
      .update(bins)
      .set({
        currentFillPercent: round1(nextFill),
        overflowHoursTotal: bin.overflowHoursTotal + overflowHours,
      })
      .where(eq(bins.binId, bin.binId));

    // Write the reading exactly as a hardware sensor would.
    const [{ maxNo }] = await db
      .select({ maxNo: sql<number>`coalesce(max(${binSensorReadings.readingNo}), 0)` })
      .from(binSensorReadings)
      .where(eq(binSensorReadings.binId, bin.binId));

    await db.insert(binSensorReadings).values({
      binId: bin.binId,
      readingNo: Number(maxNo) + 1,
      recordedAt: to.toISOString(),
      fillLevelPercent: round1(nextFill),
      readingSource: "simulated",
      isValid: true,
    });

    if (!wasCritical && nextFill >= 85) {
      newlyCritical.push({
        binId: bin.binId,
        binCode: bin.binCode,
        landmark: bin.landmark,
        fillPercent: round1(nextFill),
      });
    }
  }

  // Alert operations staff about bins that crossed into critical this tick.
  if (newlyCritical.length > 0) {
    const staff = await db.select().from(users).where(eq(users.userType, "staff"));
    for (const s of staff) {
      for (const b of newlyCritical.slice(0, 5)) {
        await db.insert(notifications).values({
          recipientUserId: s.userId,
          binId: b.binId,
          notificationType: "bin_critical",
          title: `${b.binCode} reached ${b.fillPercent}%`,
          message: `${b.landmark} needs collection.`,
          deliveryStatus: "delivered",
        });
      }
    }
  }

  await db
    .update(simulationState)
    .set({
      simClock: to.toISOString(),
      ticksElapsed: state.ticksElapsed + 1,
      lastTickAt: new Date().toISOString(),
    })
    .where(eq(simulationState.id, 1));

  return {
    simClock: to.toISOString(),
    ticksElapsed: state.ticksElapsed + 1,
    minutesAdvanced: minutes,
    binsUpdated: activeBins.length,
    newlyCritical,
    overflowing,
  };
}

/** Run several ticks back to back — "fast-forward the day" for a demo. */
export async function fastForward(ticks: number): Promise<TickResult> {
  let last: TickResult | null = null;
  const allCritical: TickResult["newlyCritical"] = [];
  for (let i = 0; i < ticks; i++) {
    last = await tick();
    allCritical.push(...last.newlyCritical);
  }
  await refreshAllForecasts();
  return { ...last!, newlyCritical: allCritical };
}

/** Refit every bin's overflow forecast against its stored reading history. */
export async function refreshAllForecasts(): Promise<number> {
  const activeBins = await db.select().from(bins).where(eq(bins.operationalStatus, "active"));
  const state = await getSimulationState();
  const asOf = new Date(state.simClock);

  for (const bin of activeBins) {
    const readings = await db
      .select({
        recordedAt: binSensorReadings.recordedAt,
        fillLevelPercent: binSensorReadings.fillLevelPercent,
      })
      .from(binSensorReadings)
      .where(and(eq(binSensorReadings.binId, bin.binId), eq(binSensorReadings.isValid, true)))
      .orderBy(desc(binSensorReadings.recordedAt))
      .limit(40);

    const f = forecastBin(bin.currentFillPercent, readings, asOf);

    // Feed the learned rate back onto the bin so routing can use it directly.
    if (f.fillRatePctPerHour > 0 && f.confidence > 0.4) {
      await db
        .update(bins)
        .set({ fillRatePctPerHour: f.fillRatePctPerHour })
        .where(eq(bins.binId, bin.binId));
    }

    const existing = await db
      .select()
      .from(binForecasts)
      .where(eq(binForecasts.binId, bin.binId))
      .limit(1);

    const payload = {
      binId: bin.binId,
      computedAt: new Date().toISOString(),
      currentFillPercent: bin.currentFillPercent,
      fillRatePctPerHour: f.fillRatePctPerHour,
      hoursToOverflow: f.hoursToOverflow,
      predictedOverflowAt: f.predictedOverflowAt,
      confidence: f.confidence,
      sampleSize: f.sampleSize,
    };

    if (existing.length > 0) {
      await db.update(binForecasts).set(payload).where(eq(binForecasts.binId, bin.binId));
    } else {
      await db.insert(binForecasts).values(payload);
    }
  }
  return activeBins.length;
}

/** Empty a bin — used when a driver logs a collection. */
export async function emptyBin(binId: number, at: Date = new Date()): Promise<void> {
  const [{ maxNo }] = await db
    .select({ maxNo: sql<number>`coalesce(max(${binSensorReadings.readingNo}), 0)` })
    .from(binSensorReadings)
    .where(eq(binSensorReadings.binId, binId));

  await db
    .update(bins)
    .set({ currentFillPercent: 0, lastCollectedAt: at.toISOString() })
    .where(eq(bins.binId, binId));

  await db.insert(binSensorReadings).values({
    binId,
    readingNo: Number(maxNo) + 1,
    recordedAt: at.toISOString(),
    fillLevelPercent: 0,
    readingSource: "driver",
    isValid: true,
  });
}

/** Reset the world clock without touching bin data. */
export async function resetClock(): Promise<void> {
  await db
    .update(simulationState)
    .set({
      simClock: new Date().toISOString(),
      ticksElapsed: 0,
      isRunning: false,
      lastTickAt: null,
    })
    .where(eq(simulationState.id, 1));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
