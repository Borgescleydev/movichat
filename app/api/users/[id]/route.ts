import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  // Allow users to edit their own profile (any role)
  const isSelf = user.userId === id;
  const isAdminOrAbove = ["superadmin", "admin"].includes(user.role);
  if (!isSelf && !isAdminOrAbove) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.username !== undefined) {
    const taken = await prisma.user.findFirst({ where: { username: body.username.trim(), NOT: { id } } });
    if (taken) return NextResponse.json({ error: "Nome de usuário já está em uso" }, { status: 400 });
    data.username = body.username.trim();
  }
  if (body.role !== undefined && isAdminOrAbove && !isSelf) data.role = body.role;
  if (body.role !== undefined && user.role === "superadmin") data.role = body.role;
  if (body.active !== undefined && isAdminOrAbove) data.active = body.active;
  if (body.password !== undefined && body.password.trim()) data.password = await hashPassword(body.password.trim());

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, username: true, role: true, active: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  if (user.userId === id) return NextResponse.json({ error: "Não pode excluir a si mesmo" }, { status: 400 });

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
