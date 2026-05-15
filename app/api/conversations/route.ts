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

  if (contacts.length === 0) return NextResponse.json([]);

  // Fetch all unread messages for these contacts in a single query,
  // then count in memory respecting each contact's lastReadAt — avoids N+1.
  const unreadMessages = await prisma.message.findMany({
    where: { contactId: { in: contacts.map((c) => c.id) }, fromMe: false },
    select: { contactId: true, timestamp: true },
  });

  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const unreadMap = new Map<string, number>();
  for (const msg of unreadMessages) {
    const c = contactMap.get(msg.contactId);
    if (!c) continue;
    if (!c.lastReadAt || msg.timestamp > c.lastReadAt) {
      unreadMap.set(msg.contactId, (unreadMap.get(msg.contactId) ?? 0) + 1);
    }
  }

  const withUnread = contacts.map((c) => ({ ...c, unreadCount: unreadMap.get(c.id) ?? 0 }));

  // Apply read/unread filter after computing counts
  const filtered =
    filter === "unread" ? withUnread.filter((c) => c.unreadCount > 0) :
    filter === "read"   ? withUnread.filter((c) => c.unreadCount === 0) :
    withUnread;

  return NextResponse.json(filtered);
}
