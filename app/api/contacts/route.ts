import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  const contacts = await prisma.contact.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      column: { select: { id: true, name: true, color: true } },
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { timestamp: "desc" }, take: 1 },
    },
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { name, phone, email, notes, columnId, assignedToId } = await req.json();

  let targetColumnId = columnId;
  if (!targetColumnId) {
    const defaultCol = await prisma.pipelineColumn.findFirst({ where: { isDefault: true } });
    targetColumnId = defaultCol?.id;
  }

  if (!targetColumnId) return NextResponse.json({ error: "Nenhuma coluna disponível" }, { status: 400 });

  const contact = await prisma.contact.create({
    data: { name, phone, email, notes, columnId: targetColumnId, assignedToId },
    include: { column: true },
  });

  return NextResponse.json(contact);
}
