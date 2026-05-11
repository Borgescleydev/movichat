import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runMigrations } from "@/lib/migrations";
import { hashPassword } from "@/lib/auth";

// One-time migration endpoint — also runs automatically via instrumentation.ts on startup
// Protected by WEBHOOK_SECRET env var passed as ?secret= query param
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    await runMigrations();
    return NextResponse.json({ ok: true, message: "Migrations applied (errors on existing columns are safe)" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// GET: debug DB state
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, active: true } });
  const providers = await prisma.apiProvider.findMany({
    select: { id: true, name: true, type: true, baseUrl: true, active: true, instances: { select: { id: true, instanceName: true, status: true, phone: true, label: true } } }
  });
  return NextResponse.json({ users, providers });
}

// PUT: reset superadmin password
export async function PUT(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  const body = await req.json();
  const { username, password } = body;
  if (!username || !password) return NextResponse.json({ error: "username e password obrigatórios" }, { status: 400 });

  const hashed = await hashPassword(password);
  const existing = await prisma.user.findFirst({ where: { username } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { password: hashed, role: "superadmin", active: true } });
    return NextResponse.json({ updated: username });
  } else {
    await prisma.user.create({ data: { name: username, username, password: hashed, role: "superadmin" } });
    return NextResponse.json({ created: username });
  }
}
