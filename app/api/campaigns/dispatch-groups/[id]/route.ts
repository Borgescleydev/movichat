import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

async function checkOwnership(id: string, userId: string, superadmin: boolean) {
  const dg = await prisma.dispatchGroup.findUnique({ where: { id }, select: { createdById: true } });
  if (!dg) return { error: "Não encontrado", status: 404 };
  if (!superadmin && dg.createdById !== userId) return { error: "Sem permissão", status: 403 };
  return { ok: true };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const dg = await prisma.dispatchGroup.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          group: {
            select: {
              id: true,
              name: true,
              groupJid: true,
              participantCount: true,
              instance: { select: { id: true, label: true, instanceName: true, status: true } },
            },
          },
        },
      },
    },
  });
  if (!dg) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(dg);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await req.json();
  const { name, description, groupIds } = body as {
    name?: string;
    description?: string;
    groupIds?: string[];
  };

  const dg = await prisma.dispatchGroup.update({
    where: { id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(Array.isArray(groupIds)
        ? {
            items: {
              deleteMany: {},
              create: groupIds.map((groupId) => ({ groupId })),
            },
          }
        : {}),
    },
    include: {
      items: {
        include: {
          group: {
            select: {
              id: true,
              name: true,
              groupJid: true,
              participantCount: true,
              instance: { select: { id: true, label: true, instanceName: true, status: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(dg);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  await prisma.dispatchGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
