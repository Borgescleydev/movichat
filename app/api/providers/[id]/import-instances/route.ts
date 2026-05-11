import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// POST - import all existing remote instances into local DB
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const base = provider.baseUrl.replace(/\/$/, "");

  type RemoteInst = { name: string; instanceId?: string; status: string; phone?: string };
  let remoteInstances: RemoteInst[] = [];

  try {
    if (provider.type === "evolution") {
      const res = await fetch(`${base}/instance/fetchInstances`, {
        headers: { apikey: provider.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Record<string, unknown>[] = Array.isArray(data) ? data : [];
      remoteInstances = list.map((item) => {
        const inst = (item.instance || item) as Record<string, unknown>;
        const rawState = String(inst.state || inst.status || inst.connectionStatus || "");
        const status = rawState === "open" || rawState === "CONNECTED" ? "connected"
          : rawState === "connecting" || rawState === "CONNECTING" ? "connecting"
          : "disconnected";
        const phone = inst.owner ? String(inst.owner).replace(/:\d+$/, "") : undefined;
        return {
          name: String(inst.instanceName || inst.name || ""),
          instanceId: String(inst.instanceId || inst.id || inst.instanceName || ""),
          status,
          phone,
        };
      }).filter((i) => i.name);

    } else if (provider.type === "wppconnect") {
      // WPPConnect: only has local instances in our DB
      return NextResponse.json({ error: "WPPConnect não suporta listagem remota de sessões" }, { status: 400 });
    } else {
      return NextResponse.json({ error: "Tipo de provedor não suportado para importação" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `Falha ao buscar instâncias: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  const existingNames = new Set(provider.instances.map((i) => i.instanceName));
  let imported = 0;
  let updated = 0;

  for (const remote of remoteInstances) {
    if (existingNames.has(remote.name)) {
      // Update status for existing instance
      const existing = provider.instances.find((i) => i.instanceName === remote.name);
      if (existing) {
        await prisma.whatsAppInstance.update({
          where: { id: existing.id },
          data: {
            status: remote.status,
            ...(remote.phone ? { phone: remote.phone } : {}),
            ...(remote.status === "connected" ? { qrCode: null } : {}),
          },
        });
        updated++;
      }
    } else {
      // Create new instance record
      await prisma.whatsAppInstance.create({
        data: {
          providerId: id,
          instanceName: remote.name,
          instanceId: remote.instanceId || remote.name,
          label: remote.name,
          status: remote.status,
          phone: remote.phone || null,
        },
      });
      imported++;
    }
  }

  return NextResponse.json({ imported, updated, total: remoteInstances.length });
}
