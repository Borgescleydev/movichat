import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

interface RemoteInstance {
  name: string;
  status: string;
  phone?: string;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const provider = await prisma.apiProvider.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });

  const base = provider.baseUrl.replace(/\/$/, "");
  const instances: RemoteInstance[] = [];

  try {
    if (provider.type === "uazapi") {
      // Try various UazAPI list endpoints
      const endpoints = [
        `${base}/instance/list`,
        `${base}/session/list`,
        `${base}/sessions`,
      ];

      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            headers: { Token: provider.apiKey },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.sessions || data.instances || data.data || [];
            list.forEach((item: Record<string, unknown>) => {
              instances.push({
                name: String(item.name || item.session || item.instanceName || item.id || ""),
                status: String(item.status || item.state || "unknown"),
                phone: item.phone ? String(item.phone) : undefined,
              });
            });
            break;
          }
        } catch { /* try next */ }
      }

    } else if (provider.type === "evolution") {
      const res = await fetch(`${base}/instance/fetchInstances`, {
        headers: { apikey: provider.apiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        list.forEach((item: Record<string, unknown>) => {
          const inst = (item.instance || item) as Record<string, unknown>;
          instances.push({
            name: String(inst.instanceName || inst.name || ""),
            status: String(inst.state || inst.status || "unknown"),
            phone: inst.owner ? String(inst.owner) : undefined,
          });
        });
      }

    } else if (provider.type === "wppconnect") {
      // WPPConnect Server doesn't have a list-all-sessions endpoint in the free version.
      // Return local instances from DB.
      const dbInstances = await prisma.whatsAppInstance.findMany({ where: { providerId: id } });
      for (const inst of dbInstances) {
        try {
          const res = await fetch(`${base}/api/${provider.apiKey}/${inst.instanceName}/check-connection-session`, {
            signal: AbortSignal.timeout(5000),
          });
          const data = res.ok ? await res.json() : {};
          instances.push({
            name: inst.label || inst.instanceName,
            status: data.status === true ? "CONNECTED" : "DISCONNECTED",
            phone: inst.phone || undefined,
          });
        } catch {
          instances.push({ name: inst.label || inst.instanceName, status: "OFFLINE" });
        }
      }
    }

    return NextResponse.json({ instances, total: instances.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: `Falha ao buscar instâncias: ${msg}` }, { status: 500 });
  }
}
