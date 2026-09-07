/** Registration, sign-in, sign-out and session lookup. */
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { loginSchema, registerSchema } from "../../shared/schemas.js";
import type { AuthUser } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { SESSION_COOKIE, hashPassword, signSession, verifyPassword } from "../lib/auth.js";
import { type AppEnv, requireAuth } from "../middleware/auth.js";

const { users, citizens, municipalStaff, truckDrivers, wardOfficers } = schema;

export const authRoutes = new Hono<AppEnv>();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "Lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
  secure: process.env.NODE_ENV === "production",
};

authRoutes.post("/register", zValidator("json", registerSchema), async c => {
  const input = c.req.valid("json");

  const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length > 0) {
    throw new HTTPException(409, { message: "An account with that email already exists" });
  }

  // Self-service registration is citizens only. Staff, drivers and ward
  // officers are municipal roles — they are provisioned, not signed up for.
  if (input.role !== "citizen") {
    throw new HTTPException(403, {
      message: "Staff, driver and ward-officer accounts are created by the city corporation",
    });
  }

  const [row] = await db
    .insert(users)
    .values({
      userType: "citizen",
      fullName: input.fullName,
      email: input.email,
      phone: input.phone || null,
      passwordHash: await hashPassword(input.password),
      preferredLanguage: input.preferredLanguage,
    })
    .returning({ userId: users.userId });

  await db.insert(citizens).values({
    userId: row.userId,
    address: input.address ?? null,
    wardId: input.wardId ?? null,
  });

  const user: AuthUser = {
    userId: row.userId,
    role: "citizen",
    fullName: input.fullName,
    email: input.email,
    preferredLanguage: input.preferredLanguage,
    wardId: input.wardId ?? null,
  };
  const token = await signSession(user);
  setCookie(c, SESSION_COOKIE, token, COOKIE_OPTS);
  return c.json({ user, token }, 201);
});

authRoutes.post("/login", zValidator("json", loginSchema), async c => {
  const { email, password } = c.req.valid("json");

  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Same message whether the email is unknown or the password is wrong, so
  // the endpoint cannot be used to enumerate registered accounts.
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new HTTPException(401, { message: "Email or password is incorrect" });
  }
  if (!row.isActive) {
    throw new HTTPException(403, { message: "This account has been deactivated" });
  }

  const user: AuthUser = {
    userId: row.userId,
    role: row.userType,
    fullName: row.fullName,
    email: row.email,
    preferredLanguage: row.preferredLanguage,
    wardId: await resolveWardId(row.userId, row.userType),
  };

  const token = await signSession(user);
  setCookie(c, SESSION_COOKIE, token, COOKIE_OPTS);
  return c.json({ user, token });
});

authRoutes.post("/logout", c => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async c => {
  const user = c.get("user");
  const [row] = await db.select().from(users).where(eq(users.userId, user.userId)).limit(1);
  if (!row) throw new HTTPException(401, { message: "Session no longer valid" });
  return c.json({
    user: {
      ...user,
      fullName: row.fullName,
      preferredLanguage: row.preferredLanguage,
    },
  });
});

authRoutes.patch("/me/language", requireAuth, async c => {
  const user = c.get("user");
  const body = await c.req.json<{ preferredLanguage: "en" | "bn" }>();
  const lang = body.preferredLanguage === "bn" ? "bn" : "en";
  await db.update(users).set({ preferredLanguage: lang }).where(eq(users.userId, user.userId));
  return c.json({ ok: true, preferredLanguage: lang });
});

/** Ward officers and citizens carry a ward; staff and drivers do not. */
async function resolveWardId(userId: number, role: string): Promise<number | null> {
  if (role === "officer") {
    const [o] = await db
      .select({ wardId: wardOfficers.wardId })
      .from(wardOfficers)
      .where(eq(wardOfficers.userId, userId))
      .limit(1);
    return o?.wardId ?? null;
  }
  if (role === "citizen") {
    const [z] = await db
      .select({ wardId: citizens.wardId })
      .from(citizens)
      .where(eq(citizens.userId, userId))
      .limit(1);
    return z?.wardId ?? null;
  }
  return null;
}

export { municipalStaff, truckDrivers };
