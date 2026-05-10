import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// This endpoint receives messages from the WhatsApp bridge service
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== (process.env.WEBHOOK_SECRET || "movichat-webhook")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { type, data } = body;

  if (type === "message") {
    const { phone, name, message } = data;

    // Find or create contact
    let contact = await prisma.contact.findUnique({ where: { phone } });
    if (!contact) {
      const defaultCol = await prisma.pipelineColumn.findFirst({ where: { isDefault: true }, orderBy: { order: "asc" } });
      if (defaultCol) {
        contact = await prisma.contact.create({
          data: { name: name || phone, phone, columnId: defaultCol.id },
        });
      }
    }

    if (contact) {
      await prisma.message.create({
        data: { contactId: contact.id, body: message, fromMe: false, status: "received" },
      });
      await prisma.contact.update({ where: { id: contact.id }, data: { updatedAt: new Date() } });
    }
  }

  if (type === "status") {
    const { status, qrCode, phone } = data;
    await prisma.whatsAppSession.update({
      where: { id: "default" },
      data: { status, qrCode: qrCode || null, phone: phone || null },
    });
  }

  return NextResponse.json({ ok: true });
}
