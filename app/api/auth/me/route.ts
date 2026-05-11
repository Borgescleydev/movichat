import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { avatar: true, permissions: true, active: true },
  });

  let permissions: Record<string, boolean> = {};
  try { permissions = JSON.parse(dbUser?.permissions ?? "{}"); } catch { /* ignore */ }

  return NextResponse.json({
    ...user,
    avatar: dbUser?.avatar ?? null,
    permissions,
  });
}
