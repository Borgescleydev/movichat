import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const instanceId = searchParams.get("instanceId") || undefined;
  const search = searchParams.get("search") || undefined;
  const sort = searchParams.get("sort") || "recent"; // recent | oldest | az | za
  const filter = searchParams.get("filter") || "all"; // all | unread | read
  const columnId = searchParams.get("columnId") || undefined;

  const where: Record<string, unknown> = {};

  if (instanceId === "none") where.instanceId = null;
  else if (instanceId) where.instanceId = instanceId;

  if (columnId) where.columnId = columnId;

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { phone: { contains: search } },
    ];
  }

  const orderBy =
    sort === "az"     ? { name: "asc"  as const } :
    sort === "za"     ? { name: "desc" as const } :
    sort === "oldest" ? { updatedAt: "asc"  as const } :
                        { updatedAt: "desc" as const };

  const contacts = await prisma.contact.findMany({
    where,
    include: {
      messages: { orderBy: { timestamp: "desc" }, take: 1 },
      column: { select: { id: true, name: true, color: true } },
      instance: { select: { id: true, label: true, instanceName: true } },
    },
    orderBy,
  });

  // Compute unread count for each contact
  const withUnread = await Promise.all(
    contacts.map(async (c) => {
      const unreadCount = await prisma.message.count({
        where: {
          contactId: c.id,
          fromMe: false,
          ...(c.lastReadAt ? { timestamp: { gt: c.lastReadAt } } : {}),
        },
      });
      return { ...c, unreadCount };
    })
  );

  // Apply read/unread filter after computing counts
  const filtered =
    filter === "unread" ? withUnread.filter((c) => c.unreadCount > 0) :
    filter === "read"   ? withUnread.filter((c) => c.unreadCount === 0) :
    withUnread;

  return NextResponse.json(filtered);
}
