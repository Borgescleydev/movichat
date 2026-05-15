import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/providers";
import { notifySseClients } from "@/lib/sse-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Persist raw payload for debugging (last 3 payloads in SystemSettings)
    try {
      const raw = JSON.stringify(body).slice(0, 4000);
      await prisma.systemSettings.upsert({
        where: { id: "webhook_debug" },
        create: { id: "webhook_debug", themeJson: raw },
        update: { themeJson: raw },
      });
    } catch { /* non-critical */ }

    // Find which provider this webhook belongs to by trying all active providers
    const providers = await prisma.apiProvider.findMany({ where: { active: true } });

    let parsed = null;
    let matchedProvider = null;

    for (const p of providers) {
      try {
        const adapter = getProvider(p.type);
        const result = adapter.parseWebhookEvent(body);
        if (result) {
          parsed = result;
          matchedProvider = p;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!parsed || !matchedProvider) {
      // Fallback: legacy webhook format
      const { type, data } = body as { type?: string; data?: Record<string, unknown> };
      if (type === "message" && data) {
        await handleIncomingMessage(
          String(data.phone || ""),
          String(data.name || data.phone || ""),
          String(data.message || "")
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Find instance by name — first scoped to matched provider, then globally
    const instance =
      await prisma.whatsAppInstance.findFirst({
        where: { providerId: matchedProvider.id, instanceName: parsed.instanceName },
      }) ??
      await prisma.whatsAppInstance.findFirst({
        where: { instanceName: parsed.instanceName },
      });

    if (parsed.type === "message") {
      const { phone, name, message, waMessageId, mediaBase64, mediaType } = parsed.data;
      if (phone && message) {
        await handleIncomingMessage(phone, name || phone, message, instance?.id, waMessageId, mediaBase64, mediaType);
      }
    }

    if (parsed.type === "status" || parsed.type === "qrcode") {
      const { status, qrCode, phone_connected } = parsed.data;

      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (qrCode !== undefined) updateData.qrCode = qrCode || null;
      if (phone_connected) updateData.phone = phone_connected;
      if (status === "connected") updateData.qrCode = null;

      if (instance) {
        await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: updateData });
      }

      // Update legacy session
      await prisma.whatsAppSession.update({
        where: { id: "default" },
        data: {
          status: String(status || "connecting"),
          qrCode: qrCode || null,
          phone: phone_connected || null,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleIncomingMessage(phone: string, name: string, message: string, instanceId?: string, waMessageId?: string, mediaBase64?: string, mediaType?: string) {
  const cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone || !message) return;

  // Deduplicate: if we already stored this exact WhatsApp message, skip it
  if (waMessageId) {
    const existing = await prisma.message.findFirst({ where: { waMessageId } });
    if (existing) return;
  }

  let contact = await prisma.contact.findUnique({ where: { phone: cleanPhone } });

  if (!contact) {
    const defaultCol = await prisma.pipelineColumn.findFirst({
      where: { isDefault: true },
      orderBy: { order: "asc" },
    }) ?? await prisma.pipelineColumn.findFirst({ orderBy: { order: "asc" } });

    if (defaultCol) {
      contact = await prisma.contact.create({
        data: {
          name: name && name !== cleanPhone ? name : `+${cleanPhone}`,
          phone: cleanPhone,
          columnId: defaultCol.id,
          instanceId: instanceId ?? null,
        },
      });
    }
  } else {
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        ...(name && name !== cleanPhone && contact.name === `+${cleanPhone}` ? { name } : {}),
        // Always associate to the instance this message arrived from
        ...(instanceId && !contact.instanceId ? { instanceId } : {}),
        updatedAt: new Date(),
      },
    });
  }

  if (contact) {
    const msg = await prisma.message.create({
      data: {
        contactId: contact.id,
        body: message,
        fromMe: false,
        status: "received",
        ...(waMessageId ? { waMessageId } : {}),
        ...(mediaBase64 ? { mediaUrl: mediaBase64 } : {}),
        ...(mediaType   ? { mediaType } : {}),
      },
    });
    notifySseClients({ type: "message", contactId: contact.id, messageId: msg.id });
  }
}
