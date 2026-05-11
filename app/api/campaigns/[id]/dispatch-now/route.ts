import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { EvolutionApiProvider } from "@/lib/providers/evolution";

function resolveTemplate(body: string, variableValues: Record<string, string>, groupName: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, v) => {
    if (v === "group_name") return groupName;
    if (v === "date") return new Date().toLocaleDateString("pt-BR");
    if (v === "time") return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return variableValues[v] ?? `{{${v}}}`;
  });
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      instance: { include: { provider: true } },
      groups: { include: { group: true }, orderBy: { order: "asc" } },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  if (!["draft", "scheduled", "paused", "error"].includes(campaign.status)) {
    return NextResponse.json({ error: `Não é possível disparar campanha com status "${campaign.status}"` }, { status: 400 });
  }
  if (campaign.groups.length === 0) {
    return NextResponse.json({ error: "Adicione ao menos um grupo antes de disparar" }, { status: 400 });
  }
  if (campaign.instance.status !== "connected") {
    return NextResponse.json({ error: "A instância WhatsApp não está conectada" }, { status: 400 });
  }

  const runIndex = campaign.runCount;

  // Ensure dispatches exist — create them if campaign was a draft with no queue yet
  const existingPending = await prisma.campaignDispatch.count({
    where: { campaignId: id, runIndex, status: { in: ["pending", "processing"] } },
  });

  if (existingPending === 0) {
    // Build dispatch list with cadence spacing
    const now = Date.now();
    let cursor = now;
    const newDispatches: { campaignId: string; groupId: string; runIndex: number; scheduledFor: Date }[] = [];

    for (let i = 0; i < campaign.groups.length; i++) {
      if (i > 0) cursor += randomBetween(campaign.cadenceMinSeconds, campaign.cadenceMaxSeconds) * 1000;
      newDispatches.push({ campaignId: id, groupId: campaign.groups[i].groupId, runIndex, scheduledFor: new Date(cursor) });
    }

    // Remove any stale dispatches for this run index before re-creating
    await prisma.campaignDispatch.deleteMany({ where: { campaignId: id, runIndex, status: { in: ["pending", "processing"] } } });
    await prisma.campaignDispatch.createMany({ data: newDispatches });
  }

  // Push ALL pending dispatch times to right now (bypass future scheduling)
  await prisma.campaignDispatch.updateMany({
    where: { campaignId: id, runIndex, status: "pending" },
    data: { scheduledFor: new Date() },
  });

  // Mark campaign as running
  await prisma.campaign.update({ where: { id }, data: { status: "running" } });

  // Process all due dispatches for this campaign
  const duePending = await prisma.campaignDispatch.findMany({
    where: { campaignId: id, runIndex, status: { in: ["pending", "processing"] }, scheduledFor: { lte: new Date() } },
    include: { group: true },
    orderBy: { scheduledFor: "asc" },
  });

  const evolution = new EvolutionApiProvider();
  const config = { baseUrl: campaign.instance.provider.baseUrl, apiKey: campaign.instance.provider.apiKey };
  const variableValues = JSON.parse(campaign.variableValues || "{}") as Record<string, string>;

  let processed = 0;
  let errors = 0;

  for (const dispatch of duePending) {
    // Claim atomically
    const claimed = await prisma.campaignDispatch.updateMany({
      where: { id: dispatch.id, status: { in: ["pending", "processing"] } },
      data: { status: "processing" },
    });
    if (claimed.count === 0) continue;

    try {
      const resolvedText = resolveTemplate(campaign.template.body, variableValues, dispatch.group.name);

      if (campaign.template.mediaType && campaign.template.mediaUrl) {
        await evolution.sendGroupMedia(
          config, campaign.instance.instanceName, dispatch.group.groupJid,
          campaign.template.mediaType, campaign.template.mediaUrl,
          campaign.template.mediaCaption
            ? resolveTemplate(campaign.template.mediaCaption, variableValues, dispatch.group.name)
            : resolvedText
        );
        if (resolvedText && campaign.template.mediaCaption !== null) {
          await evolution.sendGroupMessage(config, campaign.instance.instanceName, dispatch.group.groupJid, resolvedText);
        }
      } else {
        await evolution.sendGroupMessage(config, campaign.instance.instanceName, dispatch.group.groupJid, resolvedText);
      }

      await prisma.campaignDispatch.update({
        where: { id: dispatch.id },
        data: { status: "sent", sentAt: new Date() },
      });
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      await prisma.campaignDispatch.update({
        where: { id: dispatch.id },
        data: { status: "failed", errorMessage: msg },
      });
      errors++;
    }
  }

  // Finalise campaign status
  const remaining = await prisma.campaignDispatch.count({
    where: { campaignId: id, runIndex, status: { in: ["pending", "processing"] } },
  });

  if (remaining === 0) {
    const finalStatus = processed === 0 && errors > 0 ? "error" : "completed";
    await prisma.campaign.update({ where: { id }, data: { status: finalStatus } });
  }

  return NextResponse.json({ processed, errors, remaining });
}
