import { getAuthUserFull, hasPermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import CampaignsClient from "@/components/campaigns/CampaignsClient";

export default async function CampaignsPage() {
  const user = await getAuthUserFull();
  if (!user) redirect("/login");
  if (!hasPermission(user, "campaigns")) redirect("/settings");

  return (
    <AppLayout user={{ name: user.name, role: user.role, permissions: user.permissions }}>
      <CampaignsClient />
    </AppLayout>
  );
}
