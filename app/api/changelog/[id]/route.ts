import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const { version, title, description, changes, deployedAt } = await req.json();

  const entry = await prisma.systemChangelog.update({
    where: { id },
    data: {
      ...(version !== undefined ? { version: version.trim() } : {}),
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(changes !== undefined ? { changes: JSON.stringify(Array.isArray(changes) ? changes : []) } : {}),
      ...(deployedAt !== undefined ? { deployedAt: new Date(deployedAt) } : {}),
    },
  });

  return NextResponse.json({ ...entry, changes: JSON.parse(entry.changes) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  await prisma.systemChangelog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
