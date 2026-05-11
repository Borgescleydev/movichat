import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const providers = await prisma.apiProvider.findMany({
    orderBy: { createdAt: "asc" },
    include: { instances: { orderBy: { createdAt: "desc" } } },
  });

  // Mask API keys
  const masked = providers.map((p) => ({
    ...p,
    apiKey: p.apiKey.slice(0, 6) + "••••••" + p.apiKey.slice(-4),
    apiKeyFull: p.apiKey, // kept for server use only — remove if needed
  }));

  return NextResponse.json(masked);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { name, type, baseUrl, apiKey, isDefault } = await req.json();

  if (!name || !type || !baseUrl || !apiKey) {
    return NextResponse.json({ error: "Campos obrigatórios: name, type, baseUrl, apiKey" }, { status: 400 });
  }

  // If setting as default, unset others
  if (isDefault) {
    await prisma.apiProvider.updateMany({ where: {}, data: { isDefault: false } });
  }

  const provider = await prisma.apiProvider.create({
    data: { name, type, baseUrl: baseUrl.replace(/\/$/, ""), apiKey, isDefault: isDefault || false },
  });

  return NextResponse.json({ ...provider, apiKey: provider.apiKey.slice(0, 6) + "••••••" });
}
