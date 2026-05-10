import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const column = await prisma.pipelineColumn.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.order !== undefined && { order: body.order }),
    },
  });

  return NextResponse.json(column);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const column = await prisma.pipelineColumn.findUnique({ where: { id } });
  if (column?.isDefault) {
    return NextResponse.json({ error: "Coluna padrão não pode ser excluída" }, { status: 400 });
  }

  // Move contacts to default column
  const defaultCol = await prisma.pipelineColumn.findFirst({ where: { isDefault: true } });
  if (defaultCol) {
    await prisma.contact.updateMany({ where: { columnId: id }, data: { columnId: defaultCol.id } });
  }

  await prisma.pipelineColumn.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
