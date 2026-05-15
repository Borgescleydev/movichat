import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Support ?since=<ISO timestamp> so reconnects don't miss messages
  const sinceParam = req.nextUrl.searchParams.get("since");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      // If a since param is provided, start polling from that timestamp;
      // otherwise start from now (don't replay old messages on first connect).
      let lastTimestamp = sinceParam ? new Date(sinceParam) : new Date();

      function enqueue(data: object) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      }

      enqueue({ type: "connected" });

      // DB polling — works on any serverless topology
      const poll = setInterval(async () => {
        if (closed) { clearInterval(poll); return; }
        try {
          const newMessages = await prisma.message.findMany({
            where: { timestamp: { gt: lastTimestamp } },
            select: { id: true, contactId: true, timestamp: true, fromMe: true },
            orderBy: { timestamp: "asc" },
            take: 20,
          });
          if (newMessages.length > 0) {
            lastTimestamp = newMessages[newMessages.length - 1].timestamp;
            for (const msg of newMessages) {
              // Include `since` in each event so the client can track the last
              // timestamp seen and pass it on the next reconnect.
              enqueue({
                type: "message",
                contactId: msg.contactId,
                messageId: msg.id,
                fromMe: msg.fromMe,
                since: lastTimestamp.toISOString(),
              });
            }
          }
        } catch { /* DB error — retry next tick */ }
      }, 2000);

      // Heartbeat — keeps the connection alive through proxies
      const heartbeat = setInterval(() => { enqueue({ type: "ping" }); }, 20000);

      // Auto-close after ~4.5 minutes (Vercel function limit)
      const timeout = setTimeout(() => {
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }, 270000);

      return () => {
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        clearTimeout(timeout);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
