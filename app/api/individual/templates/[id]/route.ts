import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

async function checkOwnership(id: string, userId: string, superadmin: boolean) {
  const t = await prisma.contactTemplate.findUnique({ where: { id }, select: { createdById: true } });
  if (!t) return { error: "Template não encontrado", status: 404 };
  if (!superadmin && t.createdById !== userId) return { error: "Sem permissão", status: 403 };
  return { ok: true };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const template = await prisma.contactTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });

  return NextResponse.json(template);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const body = await req.json();
  const { name, variations, mediaType, mediaUrl, mediaCaption } = body;

  try {
    const template = await prisma.contactTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(variations !== undefined && { variations: JSON.stringify(Array.isArray(variations) ? variations : []) }),
        ...(mediaType !== undefined && { mediaType: mediaType || null }),
        ...(mediaUrl !== undefined && { mediaUrl: mediaUrl || null }),
        ...(mediaCaption !== undefined && { mediaCaption: mediaCaption || null }),
      },
    });
    return NextResponse.json(template);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    await prisma.contactTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao excluir template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
