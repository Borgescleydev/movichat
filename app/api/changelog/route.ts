import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (user.role !== "superadmin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const entries = await prisma.systemChangelog.findMany({
    orderBy: { deployedAt: "desc" },
  });

  return NextResponse.json(entries.map(e => ({
    ...e,
    changes: JSON.parse(e.changes),
  })));
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { version, title, description, changes, deployedAt } = await req.json();
  if (!version?.trim() || !title?.trim()) {
    return NextResponse.json({ error: "version e title são obrigatórios" }, { status: 400 });
  }

  const entry = await prisma.systemChangelog.create({
    data: {
      version: version.trim(),
      title: title.trim(),
      description: description?.trim() || null,
      changes: JSON.stringify(Array.isArray(changes) ? changes : []),
      deployedAt: deployedAt ? new Date(deployedAt) : new Date(),
    },
  });

  return NextResponse.json({ ...entry, changes: JSON.parse(entry.changes) });
}
