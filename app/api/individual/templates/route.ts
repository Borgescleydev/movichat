import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const ownerFilter = isSuperAdmin(user) ? {} : { createdById: user.userId };
  const templates = await prisma.contactTemplate.findMany({
    where: ownerFilter,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      variations: true,
      mediaType: true,
      mediaCaption: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const { name, variations, mediaType, mediaUrl, mediaCaption } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!variations?.length) return NextResponse.json({ error: "Adicione ao menos uma variação de mensagem" }, { status: 400 });

  try {
    const template = await prisma.contactTemplate.create({
      data: {
        name: name.trim(),
        variations: JSON.stringify(Array.isArray(variations) ? variations : []),
        mediaType: mediaType || null,
        mediaUrl: mediaUrl || null,
        mediaCaption: mediaCaption || null,
        createdById: user.userId,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
