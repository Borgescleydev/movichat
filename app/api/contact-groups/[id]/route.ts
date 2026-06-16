import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { id } = await params;
  const where = isSuperAdmin(user) ? { id } : { id, createdById: user.userId };
  const contactGroup = await prisma.contactGroup.findFirst({
    where,
    include: {
      sourceInstance: { select: { id: true, label: true, instanceName: true } },
      items: {
        include: {
          contact: {
            select: { id: true, name: true, phone: true, email: true, notes: true, instanceId: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!contactGroup) return NextResponse.json({ error: "Grupo de contatos nao encontrado" }, { status: 404 });
  return NextResponse.json(contactGroup);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { id } = await params;
  const where = isSuperAdmin(user) ? { id } : { id, createdById: user.userId };
  const contactGroup = await prisma.contactGroup.findFirst({ where, select: { id: true } });
  if (!contactGroup) return NextResponse.json({ error: "Grupo de contatos nao encontrado" }, { status: 404 });

  await prisma.contactGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
