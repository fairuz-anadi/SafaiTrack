/** Authentication and role-based authorization middleware. */
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthUser, Role } from "../../shared/types.js";
import { SESSION_COOKIE, verifySession } from "../lib/auth.js";

export type AppEnv = { Variables: { user: AuthUser } };

/** Reads the session from a cookie or an Authorization header. */
async function readUser(c: {
  req: { header: (name: string) => string | undefined };
}): Promise<AuthUser | null> {
  const header = c.req.header("Authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const cookie = getCookie(c as never, SESSION_COOKIE);
  const token = bearer ?? cookie;
  return token ? verifySession(token) : null;
}

/** Rejects the request unless a valid session is present. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await readUser(c);
  if (!user) throw new HTTPException(401, { message: "Sign in to continue" });
  c.set("user", user);
  await next();
});

/** Rejects the request unless the signed-in user holds one of `roles`. */
export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = await readUser(c);
    if (!user) throw new HTTPException(401, { message: "Sign in to continue" });
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, {
        message: `This action is restricted to: ${roles.join(", ")}`,
      });
    }
    c.set("user", user);
    await next();
  });
}

/** Attaches the user when present but never rejects. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await readUser(c);
  if (user) c.set("user", user);
  await next();
});
