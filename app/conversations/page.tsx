import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import ConversationsClient from "./ConversationsClient";

export default async function ConversationsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <AppLayout user={{ name: user.name, role: user.role }}>
      <ConversationsClient />
    </AppLayout>
  );
}
