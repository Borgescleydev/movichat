import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId obrigatório" }, { status: 400 });

  const messages = await prisma.message.findMany({
    where: { contactId },
    orderBy: { timestamp: "asc" },
  });

  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { contactId, body } = await req.json();

  const message = await prisma.message.create({
    data: { contactId, body, fromMe: true, status: "sent" },
  });

  // Update contact timestamp
  await prisma.contact.update({ where: { id: contactId }, data: { updatedAt: new Date() } });

  return NextResponse.json(message);
}
