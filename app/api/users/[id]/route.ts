import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const isSelf = user.userId === id;
  const isSuperAdmin = user.role === "superadmin";
  if (!isSelf && !isSuperAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const [dbUser, instances, contacts, campaigns] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, username: true, role: true, active: true, avatar: true, permissions: true, createdAt: true },
    }),
    prisma.whatsAppInstance.findMany({
      where: { ownerId: id },
      select: { id: true, label: true, instanceName: true, status: true, phone: true, provider: { select: { name: true, type: true } } },
    }),
    prisma.contact.count({ where: { assignedToId: id } }),
    prisma.campaign.findMany({
      where: { instance: { ownerId: id } },
      select: { id: true, name: true, status: true, startAt: true, instance: { select: { label: true, instanceName: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  if (!dbUser) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  return NextResponse.json({
    ...dbUser,
    permissions: (() => { try { return JSON.parse(dbUser.permissions); } catch { return {}; } })(),
    resources: { instances, contactCount: contacts, campaigns },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const isSelf = user.userId === id;
  const isSuperAdmin = user.role === "superadmin";
  const isAdminOrAbove = ["superadmin", "admin"].includes(user.role);

  if (!isSelf && !isAdminOrAbove) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!targetUser) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  // F-401: only superadmin may modify admin/superadmin accounts (self-edit still allowed).
  if (!isSelf && !isSuperAdmin && (targetUser.role === "admin" || targetUser.role === "superadmin")) {
    return NextResponse.json({ error: "Sem permissão para modificar este usuário" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.username !== undefined) {
    const taken = await prisma.user.findFirst({ where: { username: body.username.trim(), NOT: { id } } });
    if (taken) return NextResponse.json({ error: "Nome de usuário já está em uso" }, { status: 400 });
    data.username = body.username.trim();
  }
  if (body.avatar !== undefined) data.avatar = body.avatar; // base64 or null
  if (body.role !== undefined && !isSelf && isAdminOrAbove) {
    // F-400: only superadmin may grant the superadmin role.
    if (body.role === "superadmin" && !isSuperAdmin) {
      return NextResponse.json({ error: "Sem permissão para atribuir o papel superadmin" }, { status: 403 });
    }
    data.role = body.role;
  }
  if (body.active !== undefined && isAdminOrAbove) data.active = body.active;
  if (body.password !== undefined && body.password.trim()) data.password = await hashPassword(body.password.trim());
  if (body.permissions !== undefined && isAdminOrAbove) data.permissions = JSON.stringify(body.permissions);

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, username: true, role: true, active: true, avatar: true, permissions: true },
  });

  return NextResponse.json({
    ...updated,
    permissions: (() => { try { return JSON.parse(updated.permissions); } catch { return {}; } })(),
  });
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
