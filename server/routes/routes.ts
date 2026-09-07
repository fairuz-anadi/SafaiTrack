/**
 * Route generation, assignment and execution.
 *
 * `POST /routes/generate` is the heart of the system: it selects eligible
 * bins, runs the optimizer, runs the legacy fixed-schedule baseline over the
 * same ward, and stores both so the saving is a measured number rather than a
 * claim.
 */
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  assignRouteSchema,
  collectStopSchema,
  generateRouteSchema,
} from "../../shared/schemas.js";
import { IMPACT_CONSTANTS } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { type AppEnv, requireAuth, requireRole } from "../middleware/auth.js";
import { compareRoutes } from "../services/impact.js";
import {
  baselineFixedScheduleRoute,
  optimizeRoute,
  type GeoNode,
} from "../services/routing.js";
import { emptyBin, getSimulationState } from "../services/simulation.js";

const {
  routes,
  routeStops,
  routeComparisons,
  bins,
  wards,
  trucks,
  users,
  truckDrivers,
  binForecasts,
  collectionHistory,
  notifications,
} = schema;

export const routeRoutes = new Hono<AppEnv>();

/* ───────────────────────────  GENERATION  ──────────────────────────────── */

routeRoutes.post(
  "/routes/generate",
  requireRole("staff"),
  zValidator("json", generateRouteSchema),
  async c => {
    const user = c.get("user");
    const { wardId, thresholdPercent, maxStops, lookaheadHours } = c.req.valid("json");

    const [ward] = await db.select().from(wards).where(eq(wards.wardId, wardId)).limit(1);
    if (!ward) throw new HTTPException(404, { message: "Ward not found" });

    const wardBins = await db
      .select({
        binId: bins.binId,
        binCode: bins.binCode,
        landmark: bins.landmark,
        latitude: bins.latitude,
        longitude: bins.longitude,
        currentFillPercent: bins.currentFillPercent,
        hoursToOverflow: binForecasts.hoursToOverflow,
      })
      .from(bins)
      .leftJoin(binForecasts, eq(bins.binId, binForecasts.binId))
      .where(and(eq(bins.wardId, wardId), eq(bins.operationalStatus, "active")));

    if (wardBins.length === 0) {
      throw new HTTPException(400, { message: "This ward has no active bins to collect" });
    }

    const depot: GeoNode = {
      id: -1,
      lat: ward.depotLat,
      lng: ward.depotLng,
      fillPercent: 0,
      label: "Depot",
    };
    const disposal: GeoNode = {
      id: -2,
      lat: ward.disposalLat,
      lng: ward.disposalLng,
      fillPercent: 0,
      label: "Amin Bazar landfill",
    };

    const toNode = (b: (typeof wardBins)[number]): GeoNode => ({
      id: b.binId,
      lat: b.latitude,
      lng: b.longitude,
      fillPercent: b.currentFillPercent,
      label: b.binCode,
    });

    // Eligible = already full enough, OR forecast to overflow inside the
    // lookahead window. The second clause is what makes the system proactive
    // rather than purely reactive.
    const candidates = wardBins.filter(
      b =>
        b.currentFillPercent >= thresholdPercent ||
        (b.hoursToOverflow !== null && b.hoursToOverflow <= lookaheadHours)
    );

    if (candidates.length === 0) {
      throw new HTTPException(400, {
        message: `No bin in ${ward.name} is above ${thresholdPercent}% or due to overflow within ${lookaheadHours}h. Nothing to collect right now.`,
      });
    }

    const optimized = optimizeRoute(depot, disposal, candidates.map(toNode), maxStops);
    // The baseline visits every bin in the ward, full or not — the fixed
    // schedule the city runs today.
    const baseline = baselineFixedScheduleRoute(depot, disposal, wardBins.map(toNode));

    const [truck] = await db
      .select()
      .from(trucks)
      .where(and(eq(trucks.homeWardId, wardId), eq(trucks.status, "available")))
      .limit(1);
    const fuelLitresPerKm = truck?.fuelLitresPerKm ?? 0.35;

    const comparison = compareRoutes({
      baseline,
      optimized,
      allBins: wardBins.map(toNode),
      fuelLitresPerKm,
      thresholdPercent,
    });

    const routeCode = `R-${ward.wardCode.replace("DNCC-", "")}-${Date.now().toString().slice(-5)}`;
    const simState = await getSimulationState();
    const startClock = new Date(simState.simClock);

    const [routeRow] = await db
      .insert(routes)
      .values({
        routeCode,
        wardId,
        generatedByStaffId: user.userId,
        algorithmName: optimized.algorithmName,
        totalDistanceKm: optimized.totalDistanceKm,
        status: "draft",
        baselineDistanceKm: comparison.baselineDistanceKm,
        baselineStopCount: comparison.baselineStopCount,
        optimizedStopCount: comparison.optimizedStopCount,
        fuelSavedLitres: comparison.fuelSavedLitres,
        costSavedBdt: comparison.costSavedBdt,
        co2SavedKg: comparison.co2SavedKg,
        estimatedMinutes: optimized.estimatedMinutes,
      })
      .returning({ routeId: routes.routeId });

    // Persist the ordered stops with a planned arrival time per stop.
    let cursorMinutes = 0;
    for (const [i, node] of optimized.order.entries()) {
      cursorMinutes +=
        (optimized.legDistancesKm[i] / IMPACT_CONSTANTS.avgSpeedKmh) * 60 +
        IMPACT_CONSTANTS.minutesPerStop;
      await db.insert(routeStops).values({
        routeId: routeRow.routeId,
        binId: node.id,
        sequenceOrder: i + 1,
        plannedFillPercent: node.fillPercent,
        legDistanceKm: optimized.legDistancesKm[i],
        plannedArrival: new Date(startClock.getTime() + cursorMinutes * 60_000).toISOString(),
        stopStatus: "pending",
      });
    }

    await db.insert(routeComparisons).values({
      routeId: routeRow.routeId,
      baselineAlgorithm: baseline.algorithmName,
      baselineDistanceKm: comparison.baselineDistanceKm,
      optimizedDistanceKm: comparison.optimizedDistanceKm,
      distanceSavedPercent: comparison.distanceSavedPercent,
      baselineFuelLitres: Math.round(comparison.baselineDistanceKm * fuelLitresPerKm * 100) / 100,
      optimizedFuelLitres: Math.round(comparison.optimizedDistanceKm * fuelLitresPerKm * 100) / 100,
      fuelSavedLitres: comparison.fuelSavedLitres,
      costSavedBdt: comparison.costSavedBdt,
      co2SavedKg: comparison.co2SavedKg,
      wastedStopsAvoided: comparison.wastedStopsAvoided,
      overflowsPrevented: comparison.overflowsPrevented,
    });

    return c.json(
      {
        route: { routeId: routeRow.routeId, routeCode, ...optimized, wardName: ward.name },
        comparison,
        /** Full baseline geometry so the UI can draw both routes on one map. */
        baselinePath: [
          { lat: depot.lat, lng: depot.lng, label: "Depot" },
          ...baseline.order.map(n => ({ lat: n.lat, lng: n.lng, label: n.label })),
          { lat: disposal.lat, lng: disposal.lng, label: "Landfill" },
        ],
        optimizedPath: [
          { lat: depot.lat, lng: depot.lng, label: "Depot" },
          ...optimized.order.map(n => ({ lat: n.lat, lng: n.lng, label: n.label })),
          { lat: disposal.lat, lng: disposal.lng, label: "Landfill" },
        ],
      },
      201
    );
  }
);

/* ────────────────────────────  READ / LIST  ────────────────────────────── */

routeRoutes.get("/routes", requireAuth, async c => {
  const user = c.get("user");
  const status = c.req.query("status");

  const conditions = [];
  if (status) conditions.push(eq(routes.status, status as never));
  // Drivers see only the routes assigned to them.
  if (user.role === "driver") conditions.push(eq(routes.assignedDriverId, user.userId));
  if (user.role === "officer" && user.wardId) conditions.push(eq(routes.wardId, user.wardId));

  const rows = await db
    .select({
      routeId: routes.routeId,
      routeCode: routes.routeCode,
      wardId: routes.wardId,
      wardName: wards.name,
      status: routes.status,
      totalDistanceKm: routes.totalDistanceKm,
      baselineDistanceKm: routes.baselineDistanceKm,
      optimizedStopCount: routes.optimizedStopCount,
      baselineStopCount: routes.baselineStopCount,
      costSavedBdt: routes.costSavedBdt,
      co2SavedKg: routes.co2SavedKg,
      estimatedMinutes: routes.estimatedMinutes,
      generatedAt: routes.generatedAt,
      startedAt: routes.startedAt,
      completedAt: routes.completedAt,
      plateNumber: trucks.plateNumber,
      driverName: users.fullName,
    })
    .from(routes)
    .innerJoin(wards, eq(routes.wardId, wards.wardId))
    .leftJoin(trucks, eq(routes.assignedTruckId, trucks.truckId))
    .leftJoin(users, eq(routes.assignedDriverId, users.userId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(routes.generatedAt))
    .limit(50);

  return c.json({ routes: rows });
});

routeRoutes.get("/routes/:id", requireAuth, async c => {
  const routeId = Number(c.req.param("id"));

  const [route] = await db
    .select({
      routeId: routes.routeId,
      routeCode: routes.routeCode,
      wardId: routes.wardId,
      wardName: wards.name,
      status: routes.status,
      algorithmName: routes.algorithmName,
      totalDistanceKm: routes.totalDistanceKm,
      estimatedMinutes: routes.estimatedMinutes,
      generatedAt: routes.generatedAt,
      startedAt: routes.startedAt,
      completedAt: routes.completedAt,
      assignedTruckId: routes.assignedTruckId,
      assignedDriverId: routes.assignedDriverId,
      plateNumber: trucks.plateNumber,
      driverName: users.fullName,
      depotLat: wards.depotLat,
      depotLng: wards.depotLng,
      disposalLat: wards.disposalLat,
      disposalLng: wards.disposalLng,
    })
    .from(routes)
    .innerJoin(wards, eq(routes.wardId, wards.wardId))
    .leftJoin(trucks, eq(routes.assignedTruckId, trucks.truckId))
    .leftJoin(users, eq(routes.assignedDriverId, users.userId))
    .where(eq(routes.routeId, routeId))
    .limit(1);

  if (!route) throw new HTTPException(404, { message: "Route not found" });

  const stops = await db
    .select({
      binId: routeStops.binId,
      binCode: bins.binCode,
      landmark: bins.landmark,
      landmarkBn: bins.landmarkBn,
      latitude: bins.latitude,
      longitude: bins.longitude,
      sequenceOrder: routeStops.sequenceOrder,
      plannedFillPercent: routeStops.plannedFillPercent,
      currentFillPercent: bins.currentFillPercent,
      legDistanceKm: routeStops.legDistanceKm,
      stopStatus: routeStops.stopStatus,
      plannedArrival: routeStops.plannedArrival,
      actualArrival: routeStops.actualArrival,
      note: routeStops.note,
    })
    .from(routeStops)
    .innerJoin(bins, eq(routeStops.binId, bins.binId))
    .where(eq(routeStops.routeId, routeId))
    .orderBy(routeStops.sequenceOrder);

  const [comparison] = await db
    .select()
    .from(routeComparisons)
    .where(eq(routeComparisons.routeId, routeId))
    .orderBy(desc(routeComparisons.computedAt))
    .limit(1);

  return c.json({ route, stops, comparison: comparison ?? null });
});

/* ──────────────────────────  ASSIGN & EXECUTE  ─────────────────────────── */

routeRoutes.post(
  "/routes/:id/assign",
  requireRole("staff"),
  zValidator("json", assignRouteSchema),
  async c => {
    const routeId = Number(c.req.param("id"));
    const { truckId, driverId } = c.req.valid("json");

    const [route] = await db.select().from(routes).where(eq(routes.routeId, routeId)).limit(1);
    if (!route) throw new HTTPException(404, { message: "Route not found" });
    if (route.status !== "draft") {
      throw new HTTPException(409, { message: `Route is already ${route.status}` });
    }

    const [truck] = await db.select().from(trucks).where(eq(trucks.truckId, truckId)).limit(1);
    if (!truck) throw new HTTPException(404, { message: "Truck not found" });
    if (truck.status !== "available") {
      throw new HTTPException(409, { message: `Truck ${truck.plateNumber} is ${truck.status}` });
    }

    const [driver] = await db
      .select()
      .from(truckDrivers)
      .where(eq(truckDrivers.userId, driverId))
      .limit(1);
    if (!driver) throw new HTTPException(404, { message: "Driver not found" });
    if (!driver.isAvailable) throw new HTTPException(409, { message: "Driver is not available" });

    await db
      .update(routes)
      .set({ assignedTruckId: truckId, assignedDriverId: driverId, status: "assigned" })
      .where(eq(routes.routeId, routeId));
    await db.update(trucks).set({ status: "on_route" }).where(eq(trucks.truckId, truckId));
    await db
      .update(truckDrivers)
      .set({ isAvailable: false })
      .where(eq(truckDrivers.userId, driverId));

    await db.insert(notifications).values({
      recipientUserId: driverId,
      routeId,
      notificationType: "route_assigned",
      title: `Route ${route.routeCode} assigned to you`,
      message: `${route.optimizedStopCount} stops · ${route.totalDistanceKm} km · truck ${truck.plateNumber}`,
      deliveryStatus: "delivered",
    });

    return c.json({ ok: true, routeId, status: "assigned" });
  }
);

routeRoutes.post("/routes/:id/start", requireRole("driver", "staff"), async c => {
  const routeId = Number(c.req.param("id"));
  const user = c.get("user");

  const [route] = await db.select().from(routes).where(eq(routes.routeId, routeId)).limit(1);
  if (!route) throw new HTTPException(404, { message: "Route not found" });
  if (user.role === "driver" && route.assignedDriverId !== user.userId) {
    throw new HTTPException(403, { message: "This route is assigned to another driver" });
  }
  if (route.status !== "assigned") {
    throw new HTTPException(409, { message: `Cannot start a route that is ${route.status}` });
  }

  await db
    .update(routes)
    .set({ status: "in_progress", startedAt: new Date().toISOString() })
    .where(eq(routes.routeId, routeId));

  return c.json({ ok: true, status: "in_progress" });
});

/** Driver logs a bin as collected. Empties the bin and records history. */
routeRoutes.post(
  "/routes/:id/collect",
  requireRole("driver", "staff"),
  zValidator("json", collectStopSchema),
  async c => {
    const routeId = Number(c.req.param("id"));
    const user = c.get("user");
    const { binId, fillPercentAtCollection, weightKg, note } = c.req.valid("json");

    const [route] = await db.select().from(routes).where(eq(routes.routeId, routeId)).limit(1);
    if (!route) throw new HTTPException(404, { message: "Route not found" });
    if (user.role === "driver" && route.assignedDriverId !== user.userId) {
      throw new HTTPException(403, { message: "This route is assigned to another driver" });
    }
    if (route.status !== "in_progress") {
      throw new HTTPException(409, { message: "Start the route before logging collections" });
    }

    const [stop] = await db
      .select()
      .from(routeStops)
      .where(and(eq(routeStops.routeId, routeId), eq(routeStops.binId, binId)))
      .limit(1);
    if (!stop) throw new HTTPException(404, { message: "That bin is not a stop on this route" });
    if (stop.stopStatus === "collected") {
      throw new HTTPException(409, { message: "This stop is already logged as collected" });
    }

    const [bin] = await db.select().from(bins).where(eq(bins.binId, binId)).limit(1);
    const fillAtCollection = fillPercentAtCollection ?? bin?.currentFillPercent ?? 0;
    const at = new Date();

    await db
      .update(routeStops)
      .set({ stopStatus: "collected", actualArrival: at.toISOString(), note: note ?? null })
      .where(and(eq(routeStops.routeId, routeId), eq(routeStops.binId, binId)));

    await db.insert(collectionHistory).values({
      routeId,
      binId,
      collectedByDriverId: user.userId,
      collectedAt: at.toISOString(),
      fillPercentAtCollection: fillAtCollection,
      weightKg: weightKg ?? null,
    });

    await emptyBin(binId, at);

    // Auto-complete the route once every stop is accounted for.
    const [{ pending }] = await db
      .select({ pending: sql<number>`count(*)` })
      .from(routeStops)
      .where(and(eq(routeStops.routeId, routeId), eq(routeStops.stopStatus, "pending")));

    let completed = false;
    if (Number(pending) === 0) {
      await finishRoute(routeId);
      completed = true;
    }

    return c.json({ ok: true, binId, routeCompleted: completed });
  }
);

routeRoutes.post("/routes/:id/complete", requireRole("driver", "staff"), async c => {
  const routeId = Number(c.req.param("id"));
  await finishRoute(routeId);
  return c.json({ ok: true, status: "completed" });
});

/** Release the truck and driver and roll the odometer forward. */
async function finishRoute(routeId: number): Promise<void> {
  const [route] = await db.select().from(routes).where(eq(routes.routeId, routeId)).limit(1);
  if (!route) throw new HTTPException(404, { message: "Route not found" });

  await db
    .update(routes)
    .set({ status: "completed", completedAt: new Date().toISOString() })
    .where(eq(routes.routeId, routeId));

  if (route.assignedTruckId) {
    await db
      .update(trucks)
      .set({
        status: "available",
        currentOdometerKm: sql`${trucks.currentOdometerKm} + ${route.totalDistanceKm}`,
      })
      .where(eq(trucks.truckId, route.assignedTruckId));
  }
  if (route.assignedDriverId) {
    await db
      .update(truckDrivers)
      .set({ isAvailable: true })
      .where(eq(truckDrivers.userId, route.assignedDriverId));
  }
}

/* ───────────────────────────────  FLEET  ───────────────────────────────── */

routeRoutes.get("/fleet", requireAuth, async c => {
  const truckRows = await db
    .select({
      truckId: trucks.truckId,
      plateNumber: trucks.plateNumber,
      capacityKg: trucks.capacityKg,
      status: trucks.status,
      make: trucks.make,
      model: trucks.model,
      currentOdometerKm: trucks.currentOdometerKm,
      fuelLitresPerKm: trucks.fuelLitresPerKm,
      homeWardId: trucks.homeWardId,
      homeWardName: wards.name,
    })
    .from(trucks)
    .leftJoin(wards, eq(trucks.homeWardId, wards.wardId))
    .orderBy(trucks.plateNumber);

  const driverRows = await db
    .select({
      userId: users.userId,
      fullName: users.fullName,
      phone: users.phone,
      licenseNo: truckDrivers.licenseNo,
      shift: truckDrivers.shift,
      isAvailable: truckDrivers.isAvailable,
    })
    .from(truckDrivers)
    .innerJoin(users, eq(truckDrivers.userId, users.userId))
    .orderBy(users.fullName);

  return c.json({ trucks: truckRows, drivers: driverRows });
});
