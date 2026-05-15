import { redirect } from "next/navigation";
import { getAuthUserFull } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppLayout from "@/components/layout/AppLayout";
import ChangelogClient from "./ChangelogClient";

export default async function ChangelogPage() {
  const user = await getAuthUserFull();
  if (!user) redirect("/login");
  if (user.role !== "superadmin") redirect("/dashboard");

  const rawEntries = await prisma.systemChangelog.findMany({
    orderBy: { deployedAt: "desc" },
  });

  const entries = rawEntries.map(e => ({
    ...e,
    changes: JSON.parse(e.changes) as { type: "feature" | "fix" | "improvement" | "breaking"; text: string }[],
    deployedAt: e.deployedAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }));

  return (
    <AppLayout user={{ name: user.name, role: user.role, permissions: user.permissions }}>
      <ChangelogClient initialEntries={entries} />
    </AppLayout>
  );
}
