import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { id } = await params;
  const where = isSuperAdmin(user) ? { id } : { id, createdById: user.userId };
  const group = await prisma.contactGroup.findFirst({
    where,
    include: {
      sourceInstance: { select: { label: true, instanceName: true } },
      items: {
        include: { contact: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!group) return NextResponse.json({ error: "Grupo de contatos nao encontrado" }, { status: 404 });

  const headers = [
    "grupo_contatos",
    "origem_grupo_nome",
    "origem_grupo_jid",
    "origem_instancia",
    "contato_nome",
    "contato_telefone",
    "contato_email",
    "contato_observacoes",
    "telefone_origem",
    "nome_origem",
    "coletado_em",
  ];

  const rows = group.items.map((item) => [
    group.name,
    group.sourceGroupName || "",
    group.sourceGroupJid || "",
    group.sourceInstance?.label || group.sourceInstance?.instanceName || "",
    item.contact.name,
    item.contact.phone,
    item.contact.email || "",
    item.contact.notes || "",
    item.sourcePhone || "",
    item.sourceName || "",
    item.createdAt.toISOString(),
  ]);

  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const safeName = group.name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "grupo-contatos";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.csv"`,
    },
  });
}
