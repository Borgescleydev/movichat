import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const where = isSuperAdmin(user) ? {} : { createdById: user.userId };
  const contactGroups = await prisma.contactGroup.findMany({
    where,
    include: {
      sourceInstance: { select: { id: true, label: true, instanceName: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ contactGroups });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const body = await req.json();
  const { name, description, contactIds } = body as {
    name?: string;
    description?: string;
    contactIds?: string[];
  };

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatorio" }, { status: 400 });
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um contato" }, { status: 400 });
  }

  const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true } });
  if (contacts.length === 0) return NextResponse.json({ error: "Nenhum contato valido encontrado" }, { status: 400 });

  const group = await prisma.contactGroup.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      createdById: user.userId,
      items: { create: contacts.map((contact) => ({ contactId: contact.id })) },
    },
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json(group, { status: 201 });
}
