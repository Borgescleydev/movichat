import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const templates = await prisma.messageTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { name, body, mediaType, mediaUrl, mediaCaption } = await req.json();
  if (!name?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Nome e corpo são obrigatórios" }, { status: 400 });
  }

  const variables = extractVariables(body);
  const template = await prisma.messageTemplate.create({
    data: {
      name: name.trim(),
      body: body.trim(),
      variables: JSON.stringify(variables),
      mediaType: mediaType || null,
      mediaUrl: mediaUrl?.trim() || null,
      mediaCaption: mediaCaption?.trim() || null,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
