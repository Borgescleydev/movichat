import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { EvolutionApiProvider } from "@/lib/providers/evolution";

// Fetch live instance list + status directly from Evolution API
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const provider = await prisma.apiProvider.findUnique({
    where: { id },
    include: { instances: true },
  });
  if (!provider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });
  if (provider.type !== "evolution") {
    return NextResponse.json({ instances: provider.instances });
  }

  const evolution = new EvolutionApiProvider();
  const base = provider.baseUrl.replace(/\/$/, "");

  try {
    const res = await fetch(`${base}/instance/fetchInstances`, {
      headers: { apikey: provider.apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const liveList: Record<string, unknown>[] = Array.isArray(data) ? data : [];

    // Sync status back to DB
    const updates: Promise<unknown>[] = [];
    for (const live of liveList) {
      const inst = live.instance as Record<string, unknown> | undefined ?? live;
      const name = String(inst.instanceName || inst.name || "");
      const rawState = String(inst.state || inst.status || inst.connectionStatus || "");
      const status = rawState === "open" || rawState === "CONNECTED" ? "connected"
        : rawState === "connecting" || rawState === "CONNECTING" ? "connecting"
        : "disconnected";
      const phone = inst.owner ? String(inst.owner).replace(/:\d+$/, "") : undefined;

      const dbInst = provider.instances.find((i) => i.instanceName === name);
      if (dbInst && (dbInst.status !== status || (phone && dbInst.phone !== phone))) {
        updates.push(
          prisma.whatsAppInstance.update({
            where: { id: dbInst.id },
            data: { status, ...(phone ? { phone } : {}) },
          })
        );
      }
    }
    await Promise.all(updates);

    // Return enriched instances
    const liveMap = new Map(liveList.map((l) => {
      const inst = l.instance as Record<string, unknown> | undefined ?? l;
      return [String(inst.instanceName || inst.name || ""), inst];
    }));

    const enriched = provider.instances.map((dbInst) => {
      const live = liveMap.get(dbInst.instanceName);
      if (!live) return { ...dbInst, liveStatus: "not_found" };
      const rawState = String(live.state || live.status || live.connectionStatus || "");
      const liveStatus = rawState === "open" || rawState === "CONNECTED" ? "connected"
        : rawState === "connecting" || rawState === "CONNECTING" ? "connecting"
        : "disconnected";
      const phone = live.owner ? String(live.owner).replace(/:\d+$/, "") : dbInst.phone;
      return { ...dbInst, status: liveStatus, phone, liveStatus };
    });

    return NextResponse.json({ instances: enriched, liveCount: liveList.length });
  } catch (e) {
    // Fall back to DB data
    return NextResponse.json({
      instances: provider.instances,
      error: e instanceof Error ? e.message : "Erro ao consultar Evolution API",
    });
  }
}
