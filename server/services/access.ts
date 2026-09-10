import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { AuthUser } from "../../shared/types.js";
import { db, schema } from "../db/client.js";

/** Re-resolve privileges from the database; JWT ward/role claims can be stale. */
export async function resolveOperator(session: AuthUser): Promise<AuthUser> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.userId, session.userId));
  if (!row?.isActive) throw new HTTPException(401, { message: "Session no longer valid" });
  if (row.userType !== "staff" && row.userType !== "officer") {
    throw new HTTPException(403, { message: "Municipal access required" });
  }
  let wardId: number | null = null;
  if (row.userType === "officer") {
    const [officer] = await db.select().from(schema.wardOfficers).where(eq(schema.wardOfficers.userId, row.userId));
    if (!officer) throw new HTTPException(403, { message: "No authorized ward" });
    wardId = officer.wardId;
  }
  return { ...session, role: row.userType, wardId };
}

export function authorizedWard(user: AuthUser, requested?: number): number | undefined {
  if (user.role === "officer") {
    if (!user.wardId || (requested !== undefined && requested !== user.wardId)) {
      throw new HTTPException(403, { message: "This ward is outside your access" });
    }
    return user.wardId;
  }
  if (user.role !== "staff") throw new HTTPException(403, { message: "Municipal access required" });
  return requested;
}

export async function assertRouteAccess(user: AuthUser, routeId: number) {
  const [route] = await db.select().from(schema.routes).where(eq(schema.routes.routeId, routeId));
  if (!route) throw new HTTPException(404, { message: "Route not found" });
  if (user.role === "driver") {
    if (route.assignedDriverId !== user.userId) throw new HTTPException(403, { message: "Route not assigned to you" });
  } else {
    authorizedWard(await resolveOperator(user), route.wardId);
  }
  return route;
}

export async function assertComplaintWard(user: AuthUser, complaint: { wardId: number | null; binId: number | null }) {
  const operator = await resolveOperator(user);
  let wardId = complaint.wardId;
  if (complaint.binId) {
    const [bin] = await db.select({ wardId: schema.bins.wardId }).from(schema.bins).where(eq(schema.bins.binId, complaint.binId));
    wardId = bin?.wardId ?? null;
  }
  if (!wardId) throw new HTTPException(403, { message: "Complaint ward unavailable" });
  authorizedWard(operator, wardId);
}
