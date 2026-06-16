import { getAuthUserFull } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getAuthUserFull();
  if (!user) redirect("/login");

  return (
    <AppLayout user={{ name: user.name, role: user.role, permissions: user.permissions }}>
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Configurações</h1>
          <p style={{ color: "var(--text-muted)" }}>Gerencie perfil, usuários e integrações</p>
        </div>
        <Suspense fallback={<div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} /></div>}>
          <SettingsClient userRole={user.role} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
