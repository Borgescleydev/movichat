import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const ownerFilter = isSuperAdmin(user) ? {} : { createdById: user.userId };
  const groups = await prisma.dispatchGroup.findMany({
    where: ownerFilter,
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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ dispatchGroups: groups });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const { name, description, groupIds } = body as {
    name: string;
    description?: string;
    groupIds: string[];
  };

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!Array.isArray(groupIds) || groupIds.length === 0)
    return NextResponse.json({ error: "Selecione ao menos um grupo" }, { status: 400 });

  const dispatcGroup = await prisma.dispatchGroup.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      createdById: user.userId,
      items: {
        create: groupIds.map((groupId) => ({ groupId })),
      },
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

  return NextResponse.json(dispatcGroup, { status: 201 });
}
