import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { DEFAULT_THEME } from "@/lib/theme";

export async function GET() {
  let settings = await prisma.systemSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.systemSettings.create({ data: { id: "default", themeJson: "{}" } });
  }
  const theme = settings.themeJson ? JSON.parse(settings.themeJson) : {};
  return NextResponse.json({ theme: { ...DEFAULT_THEME, ...theme } });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { theme } = await req.json();

  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: { themeJson: JSON.stringify(theme) },
    create: { id: "default", themeJson: JSON.stringify(theme) },
  });

  return NextResponse.json({ ok: true });
}
