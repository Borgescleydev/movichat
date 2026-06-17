import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const dispatch = await prisma.quickDispatch.findUnique({
    where: { id },
    include: {
      instance: { select: { id: true, label: true, instanceName: true, status: true } },
      recipients: {
        select: {
          id: true,
          phone: true,
          status: true,
          resolvedText: true,
          errorMessage: true,
          sentAt: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!dispatch) return NextResponse.json({ error: "Disparo não encontrado" }, { status: 404 });
  if (!isSuperAdmin(user) && dispatch.createdById !== user.userId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  return NextResponse.json(dispatch);
}
