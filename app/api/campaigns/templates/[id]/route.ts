import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) data.name = body.name.trim();
  if (body.body !== undefined) {
    data.body = body.body.trim();
    data.variables = JSON.stringify(extractVariables(body.body));
  }
  if (body.mediaType !== undefined) data.mediaType = body.mediaType || null;
  if (body.mediaUrl !== undefined) data.mediaUrl = body.mediaUrl?.trim() || null;
  if (body.mediaCaption !== undefined) data.mediaCaption = body.mediaCaption?.trim() || null;

  const template = await prisma.messageTemplate.update({ where: { id }, data });
  return NextResponse.json(template);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const inUse = await prisma.campaign.count({
    where: { templateId: id, status: { in: ["draft", "scheduled", "running", "paused"] } },
  });
  if (inUse > 0) {
    return NextResponse.json({ error: `Template em uso por ${inUse} campanha(s) ativa(s)` }, { status: 400 });
  }

  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
