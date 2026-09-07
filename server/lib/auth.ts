/** Password hashing and stateless session tokens. */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { AuthUser, Role } from "../../shared/types.js";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "safaitrack-dev-secret-change-me-in-production"
);
const ISSUER = "safaitrack";
const TOKEN_TTL = "7d";

export const SESSION_COOKIE = "safaitrack_session";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signSession(user: AuthUser): Promise<string> {
  return new SignJWT({
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    preferredLanguage: user.preferredLanguage,
    wardId: user.wardId ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.userId))
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
    if (!payload.sub) return null;
    return {
      userId: Number(payload.sub),
      role: payload.role as Role,
      fullName: String(payload.fullName ?? ""),
      email: String(payload.email ?? ""),
      preferredLanguage: (payload.preferredLanguage as "en" | "bn") ?? "en",
      wardId: (payload.wardId as number | null) ?? null,
    };
  } catch {
    // Expired, tampered, or wrong-issuer tokens all mean "not signed in".
    return null;
  }
}
