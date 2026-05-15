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
  return NextResponse.json({
    theme: { ...DEFAULT_THEME, ...theme },
    faviconBase64: settings.faviconBase64 ?? null,
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const updateData: { themeJson?: string; faviconBase64?: string | null } = {};

  if (body.theme !== undefined) {
    updateData.themeJson = JSON.stringify(body.theme);
  }
  if ("faviconBase64" in body) {
    updateData.faviconBase64 = body.faviconBase64 ?? null;
  }

  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: updateData,
    create: { id: "default", themeJson: "{}", ...updateData },
  });

  return NextResponse.json({ ok: true });
}
