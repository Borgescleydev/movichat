import { getAuthUserFull, hasPermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import ContactsClient from "./ContactsClient";

export default async function ContactsPage() {
  const user = await getAuthUserFull();
  if (!user) redirect("/login");
  if (!hasPermission(user, "contacts")) redirect("/settings");

  return (
    <AppLayout user={{ name: user.name, role: user.role, permissions: user.permissions }}>
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Contatos</h1>
          <p style={{ color: "var(--text-muted)" }}>Gerencie todos os seus contatos</p>
        </div>
        <ContactsClient userRole={user.role} />
      </div>
    </AppLayout>
  );
}
