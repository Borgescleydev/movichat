import { getAuthUserFull, hasPermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import IndividualClient from "@/components/individual/IndividualClient";

export default async function IndividualPage() {
  const user = await getAuthUserFull();
  if (!user) redirect("/login");
  if (!hasPermission(user, "individual")) redirect("/settings");

  return (
    <AppLayout user={{ name: user.name, role: user.role, permissions: user.permissions }}>
      <IndividualClient />
    </AppLayout>
  );
}
