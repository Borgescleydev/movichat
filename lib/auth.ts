import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET || "movichat-secret-2024";

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  name: string;
}

export interface UserPerms {
  reports?: boolean;
  pipeline?: boolean;
  contacts?: boolean;
  conversations?: boolean;
  campaigns?: boolean;
  providers?: boolean;
}

export type AuthUserFull = JWTPayload & { permissions: UserPerms };

/** Returns true when permission is not explicitly set to false, or user is admin/superadmin. */
export function hasPermission(user: AuthUserFull, key: keyof UserPerms): boolean {
  if (["superadmin", "admin"].includes(user.role)) return true;
  return user.permissions[key] !== false;
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
  return verifyToken(token);
}

/** Like getAuthUser but also loads permissions from DB (for page-level guards). */
export async function getAuthUserFull(): Promise<AuthUserFull | null> {
  const user = await getAuthUser();
  if (!user) return null;
  if (["superadmin", "admin"].includes(user.role)) {
    return { ...user, permissions: {} };
  }
  // Dynamic import to avoid bundling prisma in edge contexts
  const { prisma } = await import("./prisma");
  const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { permissions: true } });
  let permissions: UserPerms = {};
  try { permissions = JSON.parse(dbUser?.permissions ?? "{}"); } catch { /* ignore */ }
  return { ...user, permissions };
}
