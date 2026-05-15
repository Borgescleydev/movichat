import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Revoke a single session
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const session = await prisma.userSession.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });

  const isAdmin = ["superadmin", "admin"].includes(auth.role);
  // Users can revoke their own sessions; admins can revoke any
  if (!isAdmin && session.userId !== auth.userId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.userSession.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// Revoke ALL sessions for a user
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id: userId } = await params;
  const isAdmin = ["superadmin", "admin"].includes(auth.role);

  if (!isAdmin && userId !== auth.userId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { keepCurrent?: boolean };

  await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(body.keepCurrent && auth.jti ? { id: { not: auth.jti } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
