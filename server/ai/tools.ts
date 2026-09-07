/**
 * Tools the AI operations assistant can call.
 *
 * Every tool is a real, read-only query against the live database — the
 * assistant answers from the actual operating picture, not from a summary
 * pasted into its prompt. Write access is deliberately absent: the assistant
 * can compute a route proposal as a dry run, but it cannot assign trucks,
 * change complaint status, or delete anything. Those stay with an accountable
 * human, which is the whole point of the audit trail.
 *
 * Schemas are declared as raw JSON Schema (rather than Zod) because the SDK's
 * Zod helper requires Zod v4 while the rest of the project — including the
 * Hono request validators — is on Zod v3.
 */
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { IMPACT_CONSTANTS } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { compareRoutes } from "../services/impact.js";
import { baselineFixedScheduleRoute, optimizeRoute, type GeoNode } from "../services/routing.js";

const { bins, wards, routes, routeComparisons, complaints, binForecasts, trucks, collectionHistory } =
  schema;

/** Empty-object schema, for tools that take no arguments. */
const NO_ARGS = { type: "object" as const, properties: {}, additionalProperties: false };

/* ─────────────────────────────  READ TOOLS  ────────────────────────────── */

const listWards = betaTool({
  name: "list_wards",
  description:
    "List every ward with its bin count, average fill level and number of critical bins. Call this first when the user asks about the city as a whole, or to resolve a ward name to the wardId that other tools need.",
  inputSchema: NO_ARGS,
  run: async () => {
    const rows = await db
      .select({
        wardId: wards.wardId,
        wardCode: wards.wardCode,
        name: wards.name,
        population: wards.population,
        binCount: sql<number>`count(${bins.binId})`,
        avgFill: sql<number>`coalesce(round(avg(${bins.currentFillPercent}), 1), 0)`,
        critical: sql<number>`sum(case when ${bins.currentFillPercent} >= 85 then 1 else 0 end)`,
      })
      .from(wards)
      .leftJoin(bins, and(eq(bins.wardId, wards.wardId), eq(bins.operationalStatus, "active")))
      .groupBy(wards.wardId);
    return JSON.stringify(rows);
  },
});

const getBins = betaTool({
  name: "get_bins",
  description:
    "Fetch bins, optionally filtered by ward and/or a minimum fill percentage. Returns fill level, coordinates, landmark and last collection time. Use minFillPercent=85 to find bins needing urgent collection.",
  inputSchema: {
    type: "object",
    properties: {
      wardId: { type: "integer", description: "Restrict to one ward" },
      minFillPercent: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Only return bins at or above this fill level",
      },
      limit: { type: "integer", minimum: 1, maximum: 60, description: "Default 25" },
    },
    additionalProperties: false,
  },
  run: async (input: { wardId?: number; minFillPercent?: number; limit?: number }) => {
    const conditions = [eq(bins.operationalStatus, "active")];
    if (input.wardId) conditions.push(eq(bins.wardId, input.wardId));
    if (input.minFillPercent !== undefined) {
      conditions.push(sql`${bins.currentFillPercent} >= ${input.minFillPercent}`);
    }
    const rows = await db
      .select({
        binCode: bins.binCode,
        landmark: bins.landmark,
        ward: wards.name,
        fillPercent: bins.currentFillPercent,
        capacityLiters: bins.capacityLiters,
        fillRatePctPerHour: bins.fillRatePctPerHour,
        lastCollectedAt: bins.lastCollectedAt,
        latitude: bins.latitude,
        longitude: bins.longitude,
      })
      .from(bins)
      .innerJoin(wards, eq(bins.wardId, wards.wardId))
      .where(and(...conditions))
      .orderBy(desc(bins.currentFillPercent))
      .limit(input.limit ?? 25);
    return JSON.stringify(rows);
  },
});

const getOverflowForecast = betaTool({
  name: "get_overflow_forecast",
  description:
    "Bins predicted to overflow within a time horizon, with hours remaining and a confidence score. Use this for questions about what will go wrong soon, or to plan a route before bins overflow rather than after.",
  inputSchema: {
    type: "object",
    properties: {
      hours: {
        type: "number",
        minimum: 1,
        maximum: 72,
        description: "Forecast horizon in hours. Default 12.",
      },
      wardId: { type: "integer", description: "Restrict to one ward" },
    },
    additionalProperties: false,
  },
  run: async (input: { hours?: number; wardId?: number }) => {
    const hours = input.hours ?? 12;
    const conditions = [
      sql`${binForecasts.hoursToOverflow} is not null`,
      sql`${binForecasts.hoursToOverflow} <= ${hours}`,
    ];
    if (input.wardId) conditions.push(eq(bins.wardId, input.wardId));

    const rows = await db
      .select({
        binCode: bins.binCode,
        landmark: bins.landmark,
        ward: wards.name,
        currentFillPercent: bins.currentFillPercent,
        fillRatePctPerHour: binForecasts.fillRatePctPerHour,
        hoursToOverflow: binForecasts.hoursToOverflow,
        confidence: binForecasts.confidence,
        sampleSize: binForecasts.sampleSize,
      })
      .from(binForecasts)
      .innerJoin(bins, eq(binForecasts.binId, bins.binId))
      .innerJoin(wards, eq(bins.wardId, wards.wardId))
      .where(and(...conditions))
      .orderBy(binForecasts.hoursToOverflow)
      .limit(30);
    return JSON.stringify({ horizonHours: hours, forecasts: rows });
  },
});

const getComplaints = betaTool({
  name: "get_complaints",
  description:
    "Fetch citizen complaints, optionally filtered by status. Includes type, priority, the channel it arrived on (web, sms, ussd, hotline), age and location.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["pending", "assigned", "in_progress", "resolved", "rejected", "open"],
        description: "'open' means anything not yet resolved or rejected",
      },
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 20" },
    },
    additionalProperties: false,
  },
  run: async (input: { status?: string; limit?: number }) => {
    const conditions = [];
    if (input.status === "open") {
      conditions.push(sql`${complaints.status} in ('pending','assigned','in_progress')`);
    } else if (input.status) {
      conditions.push(eq(complaints.status, input.status as never));
    }
    const rows = await db
      .select({
        code: complaints.complaintCode,
        type: complaints.complaintType,
        status: complaints.status,
        priority: complaints.priority,
        channel: complaints.channel,
        location: complaints.locationText,
        description: complaints.description,
        createdAt: complaints.createdAt,
        resolvedAt: complaints.resolvedAt,
      })
      .from(complaints)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(complaints.createdAt))
      .limit(input.limit ?? 20);
    return JSON.stringify(rows);
  },
});

const getImpactSummary = betaTool({
  name: "get_impact_summary",
  description:
    "Measured savings of optimized routing versus the legacy fixed schedule, across every route scored so far: distance, fuel, cost in BDT and CO2. Use this for any question about how much the system is actually saving.",
  inputSchema: NO_ARGS,
  run: async () => {
    const [agg] = await db
      .select({
        routesScored: sql<number>`count(*)`,
        baselineKm: sql<number>`coalesce(round(sum(${routeComparisons.baselineDistanceKm}), 1), 0)`,
        optimizedKm: sql<number>`coalesce(round(sum(${routeComparisons.optimizedDistanceKm}), 1), 0)`,
        avgSavedPercent: sql<number>`coalesce(round(avg(${routeComparisons.distanceSavedPercent}), 1), 0)`,
        fuelSavedLitres: sql<number>`coalesce(round(sum(${routeComparisons.fuelSavedLitres}), 1), 0)`,
        costSavedBdt: sql<number>`coalesce(round(sum(${routeComparisons.costSavedBdt})), 0)`,
        co2SavedKg: sql<number>`coalesce(round(sum(${routeComparisons.co2SavedKg}), 1), 0)`,
        wastedStopsAvoided: sql<number>`coalesce(sum(${routeComparisons.wastedStopsAvoided}), 0)`,
      })
      .from(routeComparisons);

    const [collections] = await db.select({ total: sql<number>`count(*)` }).from(collectionHistory);

    return JSON.stringify({
      ...agg,
      totalCollectionsLogged: Number(collections?.total ?? 0),
      assumptions: IMPACT_CONSTANTS,
      note: "Cost and CO2 are derived from the distance difference using the stated constants, not estimated separately.",
    });
  },
});

const getFleetStatus = betaTool({
  name: "get_fleet_status",
  description:
    "Current status of every truck plus the routes currently in flight. Use for questions about capacity, availability, or what is on the road right now.",
  inputSchema: NO_ARGS,
  run: async () => {
    const truckRows = await db
      .select({
        plate: trucks.plateNumber,
        status: trucks.status,
        capacityKg: trucks.capacityKg,
        odometerKm: trucks.currentOdometerKm,
        fuelLitresPerKm: trucks.fuelLitresPerKm,
        homeWard: wards.name,
      })
      .from(trucks)
      .leftJoin(wards, eq(trucks.homeWardId, wards.wardId));

    const routeRows = await db
      .select({
        routeCode: routes.routeCode,
        ward: wards.name,
        status: routes.status,
        stops: routes.optimizedStopCount,
        distanceKm: routes.totalDistanceKm,
        estimatedMinutes: routes.estimatedMinutes,
      })
      .from(routes)
      .innerJoin(wards, eq(routes.wardId, wards.wardId))
      .where(sql`${routes.status} in ('draft','assigned','in_progress')`)
      .limit(15);

    return JSON.stringify({ trucks: truckRows, activeRoutes: routeRows });
  },
});

/* ──────────────────────────  PLANNING TOOL  ────────────────────────────── */

const proposeRoute = betaTool({
  name: "propose_route",
  description:
    "Run the route optimizer for a ward and return the proposed stop sequence together with the measured saving against the legacy fixed schedule. This is a DRY RUN: it computes and returns a plan but does not save a route or dispatch anyone. Use it to answer 'what would happen if we collected ward X now'.",
  inputSchema: {
    type: "object",
    properties: {
      wardId: { type: "integer", description: "Ward to plan for. Get this from list_wards." },
      thresholdPercent: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Minimum fill level for a bin to be worth collecting. Default 55.",
      },
      maxStops: { type: "integer", minimum: 1, maximum: 40, description: "Default 20" },
    },
    required: ["wardId"],
    additionalProperties: false,
  },
  run: async (input: { wardId: number; thresholdPercent?: number; maxStops?: number }) => {
    const thresholdPercent = input.thresholdPercent ?? 55;
    const maxStops = input.maxStops ?? 20;

    const [ward] = await db.select().from(wards).where(eq(wards.wardId, input.wardId)).limit(1);
    if (!ward) return JSON.stringify({ error: "No ward with that id. Call list_wards first." });

    const wardBins = await db
      .select()
      .from(bins)
      .where(and(eq(bins.wardId, input.wardId), eq(bins.operationalStatus, "active")));
    if (wardBins.length === 0) return JSON.stringify({ error: "This ward has no active bins." });

    const toNode = (b: (typeof wardBins)[number]): GeoNode => ({
      id: b.binId,
      lat: b.latitude,
      lng: b.longitude,
      fillPercent: b.currentFillPercent,
      label: b.binCode,
    });
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
      label: "Landfill",
    };

    const candidates = wardBins.filter(b => b.currentFillPercent >= thresholdPercent);
    if (candidates.length === 0) {
      return JSON.stringify({
        ward: ward.name,
        result: `No bin in ${ward.name} is at or above ${thresholdPercent}%. Nothing needs collecting.`,
      });
    }

    const optimized = optimizeRoute(depot, disposal, candidates.map(toNode), maxStops);
    const baseline = baselineFixedScheduleRoute(depot, disposal, wardBins.map(toNode));
    const comparison = compareRoutes({
      baseline,
      optimized,
      allBins: wardBins.map(toNode),
      fuelLitresPerKm: 0.35,
      thresholdPercent,
    });

    return JSON.stringify({
      ward: ward.name,
      dryRun: true,
      stops: optimized.order.map((n, i) => ({
        sequence: i + 1,
        binCode: n.label,
        fillPercent: n.fillPercent,
        legKm: optimized.legDistancesKm[i],
      })),
      totalDistanceKm: optimized.totalDistanceKm,
      estimatedMinutes: optimized.estimatedMinutes,
      comparison,
    });
  },
});

export const agentTools = [
  listWards,
  getBins,
  getOverflowForecast,
  getComplaints,
  getImpactSummary,
  getFleetStatus,
  proposeRoute,
];

export const TOOL_NAMES = agentTools.map(t => t.name);
