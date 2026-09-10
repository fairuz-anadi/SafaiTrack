import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { AuthUser } from "../../shared/types.js";
import { generateRouteSchema } from "../../shared/schemas.js";
import { authorizedWard } from "../services/access.js";
import { readDashboard } from "../services/dashboard-data.js";
import { readOperationalBins } from "../services/operational-data.js";
import { calculateRoutePlan } from "../services/route-plan.js";
import { routeSnapshot } from "../services/route-briefing-context.js";

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  run: (raw: unknown) => Promise<string>;
}

export const TOOL_NAMES = ["list_wards", "get_bins", "get_overflow_forecast", "get_complaints", "get_impact_summary", "get_fleet_status", "propose_route"];
export function createAgentTools(user: AuthUser): AgentTool[] {
  const scope = (id?: number) => authorizedWard(user, id);
  const ward = z.number().int().positive().optional();
  const common = { wardId: { type: "integer", minimum: 1 } };
  function tool<T>(name: string, description: string, validator: z.ZodType<T, z.ZodTypeDef, any>, properties: Record<string, unknown>, run: (input: T) => Promise<unknown>, required: string[] = []): AgentTool {
    return {
      name,
      description,
      input_schema: { type: "object", properties, required, additionalProperties: false },
      run: async (raw: unknown) => JSON.stringify(await run(validator.parse(raw))),
    };
  }
  return [
    tool("list_wards", "Authorized wards and their current bin counts. Resolve ward IDs here.", z.object({}).strict(), {}, async () => {
      const rows = await db.select({ wardId: schema.wards.wardId, wardCode: schema.wards.wardCode }).from(schema.wards).where(scope() === undefined ? undefined : eq(schema.wards.wardId, scope()!));
      return Promise.all(rows.map(async w => ({ ...w, bins: (await readDashboard(w.wardId)).bins })));
    }),
    tool("get_bins", "Authorized current bin observations; totalMatched distinguishes totals from truncated results.", z.object({ wardId: ward, minFillPercent: z.number().min(0).max(100).default(0), limit: z.number().int().min(1).max(60).default(25) }).strict(), { ...common, minFillPercent: { type: "number", minimum: 0, maximum: 100 }, limit: { type: "integer", minimum: 1, maximum: 60 } }, async i => {
      const { bins } = await readOperationalBins(scope(i.wardId)); const filtered = bins.filter(b => b.currentFillPercent >= i.minFillPercent).sort((a,b) => b.currentFillPercent-a.currentFillPercent);
      return { totalMatched: filtered.length, bins: filtered.slice(0,i.limit).map(b => ({ binCode:b.binCode, wardId:b.wardId, fillPercent:b.currentFillPercent })) };
    }),
    tool("get_overflow_forecast", "Already-full bins and future projections separately. Null forecasts do not imply healthy bins.", z.object({ wardId: ward, hours: z.number().min(1).max(72).default(12) }).strict(), { ...common, hours: { type:"number", minimum:1, maximum:72 } }, async i => {
      const { bins, clock } = await readOperationalBins(scope(i.wardId));
      return { dataAsOf:clock.simClock, alreadyFull:bins.filter(b=>b.currentFillPercent>=100).map(b=>b.binCode), projections:bins.filter(b=>b.currentFillPercent<100 && b.forecast.hoursToOverflow!==null && b.forecast.hoursToOverflow<=i.hours).map(b=>({binCode:b.binCode,...b.forecast})), note:"Heuristic confidence; missing or stale forecasts are not evidence of no risk." };
    }),
    tool("get_complaints", "Authorized complaint codes, status and priority only. Citizen reports are not verified incidents.", z.object({ status:z.enum(["open","pending","assigned","in_progress","resolved","rejected"]).optional(), limit:z.number().int().min(1).max(50).default(20) }).strict(), { status:{type:"string",enum:["open","pending","assigned","in_progress","resolved","rejected"]},limit:{type:"integer",minimum:1,maximum:50} }, async i => {
      const wardId=scope();
      const rows=await db.select({ code:schema.complaints.complaintCode,status:schema.complaints.status,priority:schema.complaints.priority,type:schema.complaints.complaintType }).from(schema.complaints).leftJoin(schema.bins,eq(schema.complaints.binId,schema.bins.binId)).where(wardId===undefined?undefined:sql`coalesce(${schema.complaints.wardId},${schema.bins.wardId})=${wardId}`);
      const filtered=rows.filter(r=>!i.status || (i.status==="open"?["pending","assigned","in_progress"].includes(r.status):r.status===i.status));return {totalMatched:filtered.length,complaints:filtered.slice(0,i.limit)};
    }),
    tool("get_impact_summary", "Modeled comparisons split by planned and completed route status. No actual fuel savings are measured.", z.object({}).strict(), {}, async()=> (await readDashboard(scope())).impact),
    tool("get_fleet_status", "Authorized fleet availability and route counts; no driver personal information.", z.object({}).strict(), {}, async()=> {const d=await readDashboard(scope());return {fleet:d.fleet,routes:d.routes};}),
    tool("propose_route", "Compute a read-only route preview through the same planner as generation. Does not save or dispatch.", generateRouteSchema.strict(), { ...common,thresholdPercent:{type:"number",minimum:0,maximum:100},maxStops:{type:"integer",minimum:1,maximum:60},lookaheadHours:{type:"number",minimum:0,maximum:48} }, async i=> {scope(i.wardId);const snapshot=routeSnapshot(await calculateRoutePlan(i),user.role);return {context:snapshot.context,limitations:snapshot.methodNotes.en};}, ["wardId"]),
  ];
}
