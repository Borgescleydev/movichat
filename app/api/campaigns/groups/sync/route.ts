import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { EvolutionApiProvider } from "@/lib/providers/evolution";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { instanceId } = await req.json();
  if (!instanceId) return NextResponse.json({ error: "instanceId obrigatório" }, { status: 400 });

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    include: { provider: true },
  });
  if (!instance) return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
  if (instance.provider.type !== "evolution") {
    return NextResponse.json({ error: "Apenas Evolution API suporta sincronização de grupos" }, { status: 400 });
  }

  try {
    const evolution = new EvolutionApiProvider();
    const freshGroups = await evolution.fetchGroups(
      { baseUrl: instance.provider.baseUrl, apiKey: instance.provider.apiKey },
      instance.instanceName
    );

    const freshJids = new Set(freshGroups.map((g) => g.groupJid));
    const now = new Date();

    // Upsert all fresh groups
    for (const group of freshGroups) {
      await prisma.whatsAppGroup.upsert({
        where: { instanceId_groupJid: { instanceId, groupJid: group.groupJid } },
        create: {
          instanceId,
          groupJid: group.groupJid,
          name: group.name,
          participantCount: group.participantCount,
          lastSyncAt: now,
        },
        update: {
          name: group.name,
          participantCount: group.participantCount,
          lastSyncAt: now,
        },
      });
    }

    // Remove groups no longer in Evolution (only if no pending dispatches)
    const existing = await prisma.whatsAppGroup.findMany({ where: { instanceId } });
    for (const g of existing) {
      if (!freshJids.has(g.groupJid)) {
        const pending = await prisma.campaignDispatch.count({
          where: { groupId: g.id, status: { in: ["pending", "processing"] } },
        });
        if (pending === 0) {
          await prisma.whatsAppGroup.delete({ where: { id: g.id } });
        }
      }
    }

    const groups = await prisma.whatsAppGroup.findMany({
      where: { instanceId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ synced: freshGroups.length, groups });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: `Falha ao sincronizar: ${msg}` }, { status: 500 });
  }
}
