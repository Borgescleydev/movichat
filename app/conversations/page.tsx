import { getAuthUserFull, hasPermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import ConversationsClient from "./ConversationsClient";

export default async function ConversationsPage() {
  const user = await getAuthUserFull();
  if (!user) redirect("/login");
  if (!hasPermission(user, "conversations")) redirect("/settings");

  return (
    <AppLayout user={{ name: user.name, role: user.role, permissions: user.permissions }}>
      <ConversationsClient />
    </AppLayout>
  );
}
