import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import CampaignsClient from "@/components/campaigns/CampaignsClient";

export default async function CampaignsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <AppLayout user={{ name: user.name, role: user.role }}>
      <CampaignsClient />
    </AppLayout>
  );
}
