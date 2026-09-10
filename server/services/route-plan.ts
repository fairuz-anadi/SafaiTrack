import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { GenerateRouteInput } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { compareRoutes } from "./impact.js";
import { readOperationalBins } from "./operational-data.js";
import { baselineFixedScheduleRoute, optimizeRoute, type GeoNode } from "./routing.js";

/** Shared read-only calculation used by generation, preview and the assistant. */
export async function calculateRoutePlan(input: GenerateRouteInput, refine = true) {
  const [ward] = await db.select().from(schema.wards).where(eq(schema.wards.wardId, input.wardId));
  if (!ward) throw new HTTPException(404, { message: "Ward not found" });
  const { bins: wardBins, clock } = await readOperationalBins(input.wardId);
  const toNode = (b: (typeof wardBins)[number]): GeoNode => ({ id: b.binId, lat: b.latitude, lng: b.longitude, fillPercent: b.currentFillPercent, label: b.binCode });
  const depot: GeoNode = { id: -1, lat: ward.depotLat, lng: ward.depotLng, fillPercent: 0, label: "Depot" };
  const disposal: GeoNode = { id: -2, lat: ward.disposalLat, lng: ward.disposalLng, fillPercent: 0, label: "Disposal" };
  const candidates = wardBins.filter(b => b.currentFillPercent >= input.thresholdPercent || (b.forecast.hoursToOverflow !== null && b.forecast.hoursToOverflow <= input.lookaheadHours));
  const optimized = optimizeRoute(depot, disposal, candidates.map(toNode), input.maxStops, new Set(), { refine });
  const baseline = baselineFixedScheduleRoute(depot, disposal, wardBins.map(toNode));
  const [truck] = await db.select().from(schema.trucks).where(and(eq(schema.trucks.homeWardId, input.wardId), eq(schema.trucks.status, "available"))).orderBy(schema.trucks.truckId).limit(1);
  const fuelLitresPerKm = truck?.fuelLitresPerKm ?? 0.35;
  const comparison = compareRoutes({ baseline, optimized, allBins: wardBins.map(toNode), fuelLitresPerKm, thresholdPercent: input.thresholdPercent });
  return { input, ward, wardBins, candidates, depot, disposal, optimized, baseline, comparison, fuelLitresPerKm, clock };
}

export type RoutePlan = Awaited<ReturnType<typeof calculateRoutePlan>>;
