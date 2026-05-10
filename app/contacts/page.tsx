import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import ContactsClient from "./ContactsClient";

export default async function ContactsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <AppLayout user={{ name: user.name, role: user.role }}>
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Contatos</h1>
          <p className="text-gray-500">Gerencie todos os seus contatos</p>
        </div>
        <ContactsClient userRole={user.role} />
      </div>
    </AppLayout>
  );
}
