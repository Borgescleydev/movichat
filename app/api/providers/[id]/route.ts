import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  if (body.isDefault) {
    await prisma.apiProvider.updateMany({ where: {}, data: { isDefault: false } });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl.replace(/\/$/, "");
  if (body.apiKey !== undefined) data.apiKey = body.apiKey;
  if (body.active !== undefined) data.active = body.active;
  if (body.isDefault !== undefined) data.isDefault = body.isDefault;

  const provider = await prisma.apiProvider.update({ where: { id }, data });
  return NextResponse.json({ ...provider, apiKey: provider.apiKey.slice(0, 6) + "••••••" });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.apiProvider.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
