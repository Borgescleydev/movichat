import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  name: string;
  jti?: string; // session ID — present in tokens issued after session tracking was added
}

export interface UserPerms {
  reports?: boolean;
  contacts?: boolean;
  campaigns?: boolean;
  providers?: boolean;
  individual?: boolean;
}

export type AuthUserFull = JWTPayload & { permissions: UserPerms };

/**
 * Permissions that require explicit grant for agents (opt-in).
 * All other permissions are opt-out (true unless explicitly set to false).
 */
const OPT_IN_PERMISSIONS: (keyof UserPerms)[] = ["individual"];

/** Returns true when the user has the given permission. Admin/superadmin always pass. */
export function hasPermission(user: AuthUserFull, key: keyof UserPerms): boolean {
  if (["superadmin", "admin"].includes(user.role)) return true;
  if (OPT_IN_PERMISSIONS.includes(key)) return user.permissions[key] === true;
  return user.permissions[key] !== false;
}

/** Only superadmin sees all data; admins and agents are scoped to their own assets. */
export function isSuperAdmin(user: JWTPayload): boolean {
  return user.role === "superadmin";
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getAuthUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  // If token has a session ID, verify the session is still active
  if (payload.jti) {
    const { prisma } = await import("./prisma");
    const session = await prisma.userSession.findUnique({
      where: { id: payload.jti },
      select: { revokedAt: true, lastActiveAt: true },
    });
    if (!session || session.revokedAt) return null;

    // Touch lastActiveAt at most once per minute to avoid a DB write on every request.
    const lastActive = session.lastActiveAt?.getTime() ?? 0;
    if (Date.now() - lastActive > 60_000) {
      prisma.userSession.update({
        where: { id: payload.jti },
        data: { lastActiveAt: new Date() },
      }).catch(() => {});
    }
  }

  return payload;
}

/** Like getAuthUser but also loads permissions from DB (for page-level guards). */
export async function getAuthUserFull(): Promise<AuthUserFull | null> {
  const user = await getAuthUser();
  if (!user) return null;
  if (["superadmin", "admin"].includes(user.role)) {
    return { ...user, permissions: {} };
  }
  const { prisma } = await import("./prisma");
  const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { permissions: true } });
  let permissions: UserPerms = {};
  try { permissions = JSON.parse(dbUser?.permissions ?? "{}"); } catch { /* ignore */ }
  return { ...user, permissions };
}
