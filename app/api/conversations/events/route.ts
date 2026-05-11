import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

// Simple SSE endpoint — Vercel Edge runtime compatible
// Clients subscribe; webhook notifies via shared in-memory set (works within a single serverless invocation)
// For production at scale, replace with Redis pub/sub or Pusher

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial ping
      controller.enqueue(encoder.encode("data: {\"type\":\"connected\"}\n\n"));

      // Send heartbeat every 20s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("data: {\"type\":\"ping\"}\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20000);

      // Close after 5 minutes (Vercel function timeout safety)
      const timeout = setTimeout(() => {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }, 290000);

      // Register this controller globally so webhook can notify it
      sseClients.add(controller);

      return () => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        sseClients.delete(controller);
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

// Module-level set of active SSE controllers (shared within the same serverless instance)
export const sseClients = new Set<ReadableStreamDefaultController>();

export function notifySseClients(payload: object) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  const encoder = new TextEncoder();
  for (const ctrl of sseClients) {
    try { ctrl.enqueue(encoder.encode(data)); } catch { sseClients.delete(ctrl); }
  }
}
