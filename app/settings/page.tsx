import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <AppLayout user={{ name: user.name, role: user.role }}>
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-gray-500">Gerencie pipeline, usuários e WhatsApp</p>
        </div>
        <SettingsClient userRole={user.role} />
      </div>
    </AppLayout>
  );
}
