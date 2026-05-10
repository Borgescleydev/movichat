import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const columns = await prisma.pipelineColumn.findMany({
    orderBy: { order: "asc" },
    include: {
      contacts: {
        orderBy: { updatedAt: "desc" },
        include: { assignedTo: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json(columns);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { name, color } = await req.json();
  const last = await prisma.pipelineColumn.findFirst({ orderBy: { order: "desc" } });
  const order = (last?.order ?? -1) + 1;

  const column = await prisma.pipelineColumn.create({ data: { name, color: color || "#6366f1", order } });
  return NextResponse.json(column);
}
