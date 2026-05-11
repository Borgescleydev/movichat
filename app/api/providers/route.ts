import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user || !["superadmin", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const isSuperAdmin = user.role === "superadmin";

    const providers = await prisma.apiProvider.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        instances: {
          where: isSuperAdmin ? {} : { ownerId: user.userId },
          orderBy: { createdAt: "desc" },
          include: { owner: { select: { id: true, name: true } } },
        },
      },
    });

    const masked = providers.map((p) => ({
      ...p,
      apiKey: p.apiKey.length > 10
        ? p.apiKey.slice(0, 4) + "••••••" + p.apiKey.slice(-4)
        : "••••••",
      instances: p.instances.map((inst) => ({
        ...inst,
        ownerName: inst.owner?.name ?? null,
        owner: undefined,
      })),
    }));

    return NextResponse.json(masked);
  } catch (e) {
    console.error("GET /api/providers:", e);
    return NextResponse.json({ error: "Erro interno ao buscar provedores" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user || !["superadmin", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }

    const { name, type, baseUrl, apiKey, isDefault } = body as {
      name?: string; type?: string; baseUrl?: string; apiKey?: string; isDefault?: boolean;
    };

    if (!name?.trim() || !type || !baseUrl?.trim() || !apiKey?.trim()) {
      return NextResponse.json(
        { error: "Preencha: nome, tipo, URL base e chave de API" },
        { status: 400 }
      );
    }

    if (isDefault) {
      await prisma.apiProvider.updateMany({ where: {}, data: { isDefault: false } });
    }

    const provider = await prisma.apiProvider.create({
      data: {
        name: name.trim(),
        type,
        baseUrl: baseUrl.trim().replace(/\/$/, ""),
        apiKey: apiKey.trim(),
        isDefault: isDefault ?? false,
      },
    });

    return NextResponse.json({
      ...provider,
      apiKey: provider.apiKey.length > 10
        ? provider.apiKey.slice(0, 4) + "••••••" + provider.apiKey.slice(-4)
        : "••••••",
      instances: [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/providers ERROR:", msg);
    return NextResponse.json({ error: "Erro interno ao criar provedor", detail: msg }, { status: 500 });
  }
}
