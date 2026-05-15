import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await getAuthUser();

  // Revoke session if it has a jti
  if (user?.jti) {
    await prisma.userSession.update({
      where: { id: user.jti },
      data: { revokedAt: new Date() },
    }).catch(() => {});
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth-token", "", { maxAge: 0, path: "/" });
  return response;
}
