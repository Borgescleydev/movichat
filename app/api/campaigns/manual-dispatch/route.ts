import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const instanceId = searchParams.get("instanceId") || undefined;
  const status = searchParams.get("status") || undefined; // sent | failed | mixed
  const search = searchParams.get("search") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = 20;

  const where: Record<string, unknown> = {};
  if (instanceId) where.instanceId = instanceId;

  const logs = await prisma.manualDispatchLog.findMany({
    where,
    include: { instance: { select: { label: true, instanceName: true } } },
    orderBy: { sentAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.manualDispatchLog.count({ where });

  // Filter by status/search in memory (results is JSON)
  let filtered = logs.map((log) => ({
    ...log,
    results: JSON.parse(log.results || "[]") as { groupId: string; name: string; status: string; error?: string }[],
  }));

  if (status === "failed") filtered = filtered.filter((l) => l.failedCount > 0);
  else if (status === "sent") filtered = filtered.filter((l) => l.failedCount === 0);

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((l) =>
      l.message.toLowerCase().includes(q) ||
      l.results.some((r) => r.name.toLowerCase().includes(q))
    );
  }

  return NextResponse.json({ logs: filtered, total, page, pages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { instanceId, groupIds, message, mediaType, mediaUrl, mediaCaption, fileName } = body as {
    instanceId: string;
    groupIds: string[];
    message: string;
    mediaType?: string;
    mediaUrl?: string;
    mediaCaption?: string;
    fileName?: string;
  };

  const hasMedia = !!(mediaType && mediaUrl?.trim());
  if (!instanceId || !groupIds?.length || (!message?.trim() && !hasMedia)) {
    return NextResponse.json({ error: "instanceId, groupIds e message (ou mídia) são obrigatórios" }, { status: 400 });
  }

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    include: { provider: true },
  });
  if (!instance) return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
  if (instance.status !== "connected") {
    return NextResponse.json({ error: "A instância não está conectada" }, { status: 400 });
  }

  const groups = await prisma.whatsAppGroup.findMany({
    where: { id: { in: groupIds }, instanceId },
  });
  if (groups.length === 0) return NextResponse.json({ error: "Nenhum grupo válido encontrado" }, { status: 400 });

  const provider = getProvider(instance.provider.type);
  const config = { baseUrl: instance.provider.baseUrl, apiKey: instance.provider.apiKey };

  const results: { groupId: string; name: string; status: "sent" | "failed"; error?: string }[] = [];

  for (const group of groups) {
    try {
      if (hasMedia && provider.sendGroupMedia) {
        await provider.sendGroupMedia(
          config,
          instance.instanceName,
          group.groupJid,
          mediaType!,
          mediaUrl!,
          mediaCaption || message?.trim() || "",
          fileName,
        );
      } else if (provider.sendGroupMessage) {
        await provider.sendGroupMessage(config, instance.instanceName, group.groupJid, message.trim());
      } else {
        await provider.sendTextMessage(config, instance.instanceName, group.groupJid, message.trim());
      }
      results.push({ groupId: group.id, name: group.name, status: "sent" });
    } catch (e) {
      results.push({ groupId: group.id, name: group.name, status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;

  // Save dispatch log
  try {
    await prisma.manualDispatchLog.create({
      data: {
        instanceId,
        message: message?.trim() || "",
        mediaType: hasMedia ? mediaType : null,
        mediaCaption: hasMedia ? (mediaCaption || null) : null,
        hasMedia,
        groupCount: groups.length,
        sentCount: sent,
        failedCount: failed,
        results: JSON.stringify(results),
        sentAt: new Date(),
      },
    });
  } catch {
    // Log save failure is non-fatal
  }

  return NextResponse.json({ sent, failed, results });
}
