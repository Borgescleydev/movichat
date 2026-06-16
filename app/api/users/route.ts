import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, username: true, role: true, active: true, avatar: true, permissions: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users.map((u) => ({
    ...u,
    permissions: (() => { try { return JSON.parse(u.permissions); } catch { return {}; } })(),
  })));
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { name, username, password, role, permissions } = await req.json();

  const targetRole = role || "agent";
  // F-400: only superadmin may create a superadmin account.
  if (targetRole === "superadmin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Sem permissão para criar o papel superadmin" }, { status: 403 });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return NextResponse.json({ error: "Usuário já existe" }, { status: 400 });

  const hashed = await hashPassword(password);
  const newUser = await prisma.user.create({
    data: {
      name,
      username,
      password: hashed,
      role: targetRole,
      permissions: JSON.stringify(permissions ?? {}),
    },
    select: { id: true, name: true, username: true, role: true, active: true, avatar: true, permissions: true },
  });

  return NextResponse.json({
    ...newUser,
    permissions: (() => { try { return JSON.parse(newUser.permissions); } catch { return {}; } })(),
  });
}
