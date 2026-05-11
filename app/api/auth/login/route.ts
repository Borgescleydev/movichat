import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, signToken, hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Usuário e senha obrigatórios" }, { status: 400 });
    }

    // Bootstrap: create superadmin if DB is empty (first deploy)
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const hashed = await hashPassword("borges123");
      await prisma.user.create({
        data: { name: "Borgescley", username: "borgescley", password: hashed, role: "superadmin" },
      });
      await prisma.pipelineColumn.create({
        data: { name: "Novos Contatos", order: 0, isDefault: true, color: "#22c55e" },
      });
      await prisma.whatsAppSession.upsert({
        where: { id: "default" },
        create: { id: "default", status: "disconnected" },
        update: {},
      });
      await prisma.systemSettings.upsert({
        where: { id: "default" },
        create: { id: "default", themeJson: "{}" },
        update: {},
      });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    const token = signToken({ userId: user.id, username: user.username, role: user.role, name: user.name });

    const response = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
