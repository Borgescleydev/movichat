import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// SSE real-time disabled — client falls back to interval polling.
export async function GET() {
  return NextResponse.json({ error: "SSE desativado" }, { status: 404 });
}
