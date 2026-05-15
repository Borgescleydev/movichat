import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

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
  if (!["evolution", "wppconnect"].includes(instance.provider.type)) {
    return NextResponse.json({ error: "Este provedor não suporta sincronização de grupos" }, { status: 400 });
  }

  try {
    const { getProvider } = await import("@/lib/providers");
    const providerImpl = getProvider(instance.provider.type);
    if (!providerImpl.fetchGroups) {
      return NextResponse.json({ error: "Este provedor não suporta listagem de grupos" }, { status: 400 });
    }
    const freshGroups = await providerImpl.fetchGroups(
      { baseUrl: instance.provider.baseUrl, apiKey: instance.provider.apiKey },
      instance.instanceName
    );

    const freshJids = new Set(freshGroups.map((g) => g.groupJid));
    const now = new Date();

    // Batch upsert all fresh groups in a single transaction
    await prisma.$transaction(
      freshGroups.map((group) =>
        prisma.whatsAppGroup.upsert({
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
        })
      )
    );

    // Find stale groups (no longer in the provider)
    const existing = await prisma.whatsAppGroup.findMany({ where: { instanceId } });
    const toRemove = existing.filter((g) => !freshJids.has(g.groupJid));

    if (toRemove.length > 0) {
      // Check pending dispatches for all stale groups in one query
      const pendingCounts = await prisma.campaignDispatch.groupBy({
        by: ["groupId"],
        where: {
          groupId: { in: toRemove.map((g) => g.id) },
          status: { in: ["pending", "processing"] },
        },
        _count: { id: true },
      });
      const pendingGroupIds = new Set(pendingCounts.map((p) => p.groupId));
      const deleteIds = toRemove.filter((g) => !pendingGroupIds.has(g.id)).map((g) => g.id);
      if (deleteIds.length > 0) {
        await prisma.whatsAppGroup.deleteMany({ where: { id: { in: deleteIds } } });
      }
    }

    const groups = await prisma.whatsAppGroup.findMany({
      where: { instanceId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      synced: freshGroups.length,
      groups,
      message: freshGroups.length === 0
        ? "A instância está conectada mas não possui grupos do WhatsApp. Certifique-se de que o número conectado participa de grupos."
        : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: `Falha ao sincronizar: ${msg}` }, { status: 500 });
  }
}
