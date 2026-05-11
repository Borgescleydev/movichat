import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const provider = await prisma.apiProvider.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });

  const base = provider.baseUrl.replace(/\/$/, "");

  try {
    let ok = false;
    let detail = "";

    if (provider.type === "uazapi") {
      // UazAPI: test with Token header
      const endpoints = [
        { url: `${base}/instance/status`, headers: { Token: provider.apiKey } },
        { url: `${base}/status`, headers: { Token: provider.apiKey } },
      ];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url, { headers: ep.headers, signal: AbortSignal.timeout(8000) });
          const body = await res.json().catch(() => ({}));
          if (res.status !== 404) {
            ok = res.status !== 401 && res.status !== 403;
            detail = ok
              ? `Servidor online${body.info ? ` · ${body.info}` : ""}`
              : `Erro de autenticação (${res.status}) — verifique a API Key`;
            break;
          }
        } catch { /* try next */ }
      }
      if (!detail) detail = "Servidor acessível mas sem endpoints reconhecidos";

    } else if (provider.type === "evolution") {
      // Evolution API: test with apikey header
      const res = await fetch(`${base}/instance/fetchInstances`, {
        headers: { apikey: provider.apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      ok = res.ok;
      detail = ok ? "Conectado à Evolution API" : `Erro ${res.status} — verifique a API Key`;

    } else if (provider.type === "wppconnect") {
      // WPPConnect Server: GET /api/{secretKey}/generate-token (health check)
      const checkUrl = `${base}/api/${provider.apiKey}/WPPCONNECT/generate-token`;
      try {
        const res = await fetch(checkUrl, { signal: AbortSignal.timeout(8000) });
        // Any response (even 404 for unknown session) means server is reachable
        ok = res.status !== 401 && res.status !== 403;
        detail = ok ? "Servidor WPPConnect acessível" : `Erro de autenticação (${res.status}) — verifique o SECRETKEY`;
      } catch {
        ok = false;
        detail = "Servidor WPPConnect inacessível — verifique a URL e se está rodando";
      }
    }

    return NextResponse.json({ ok, detail, type: provider.type, baseUrl: base });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, detail: `Falha de conexão: ${msg}` });
  }
}
