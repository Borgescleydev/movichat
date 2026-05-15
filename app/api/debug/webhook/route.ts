import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Returns the last raw webhook payload received — superadmin only
export async function GET() {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rec = await prisma.systemSettings.findUnique({ where: { id: "webhook_debug" } });
  if (!rec) return NextResponse.json({ payload: null, message: "Nenhum webhook recebido ainda." });

  try {
    return NextResponse.json({ payload: JSON.parse(rec.themeJson), receivedAt: rec.updatedAt });
  } catch {
    return NextResponse.json({ raw: rec.themeJson, receivedAt: rec.updatedAt });
  }
}
