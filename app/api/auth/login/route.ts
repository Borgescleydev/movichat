import { NextRequest, NextResponse, after } from "next/server";
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

    // Gather session metadata (geolocation is resolved after the response — see below)
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || "";
    const { browser, os, deviceType } = parseUserAgent(ua);

    // Create session record without geo; it is backfilled post-response.
    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        ipAddress: ip === "unknown" ? null : ip,
        userAgent: ua || null,
        browser,
        os,
        deviceType,
        country: null,
        city: null,
        region: null,
      },
    });

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      jti: session.id,
    });

    // Backfill geolocation after the response is sent. `after` is backed by
    // waitUntil on serverless (Fluid Compute), so the work survives past the
    // response without blocking login latency. Geo is best-effort: any error
    // here is swallowed and must never affect authentication.
    after(async () => {
      try {
        const geo = await geolocateIp(ip);
        await prisma.userSession.update({
          where: { id: session.id },
          data: { country: geo.country, city: geo.city, region: geo.region },
        });
      } catch (err) {
        console.error("geolocate backfill failed", err);
      }
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
