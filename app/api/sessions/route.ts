import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const isAdmin = ["superadmin", "admin"].includes(auth.role);
  const userId = req.nextUrl.searchParams.get("userId");

  // Agents can only see their own sessions
  const targetUserId = isAdmin && userId ? userId : auth.userId;

  const sessions = await prisma.userSession.findMany({
    where: isAdmin && !userId
      ? {} // admins with no filter see all sessions
      : { userId: targetUserId },
    include: {
      user: { select: { id: true, name: true, username: true, role: true, avatar: true } },
    },
    orderBy: { lastActiveAt: "desc" },
  });

  // Mark current session
  const result = sessions.map((s) => ({
    ...s,
    isCurrent: s.id === auth.jti,
    isActive: !s.revokedAt,
  }));

  return NextResponse.json({ sessions: result });
}
