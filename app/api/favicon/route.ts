import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: "default" } });

  if (!settings?.faviconBase64) {
    return new NextResponse(null, { status: 204 });
  }

  const dataUrl = settings.faviconBase64;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return new NextResponse(null, { status: 204 });
  }

  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
