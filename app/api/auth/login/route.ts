import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, signToken, hashPassword } from "@/lib/auth";
import { parseUserAgent, geolocateIp, getClientIp } from "@/lib/session-utils";

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

    // Gather session metadata
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || "";
    const { browser, os, deviceType } = parseUserAgent(ua);
    const geo = await geolocateIp(ip);

    // Create session record
    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        ipAddress: ip === "unknown" ? null : ip,
        userAgent: ua || null,
        browser,
        os,
        deviceType,
        country: geo.country,
        city: geo.city,
        region: geo.region,
      },
    });

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      jti: session.id,
    });

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
