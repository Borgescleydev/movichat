import { getAuthUserFull, hasPermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import KanbanBoard from "@/components/kanban/KanbanBoard";

export default async function PipelinePage() {
  const user = await getAuthUserFull();
  if (!user) redirect("/login");
  if (!hasPermission(user, "pipeline")) redirect("/settings");

  return (
    <AppLayout user={{ name: user.name, role: user.role, permissions: user.permissions }}>
      <div className="p-8 h-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Pipeline</h1>
            <p style={{ color: "var(--text-muted)" }}>Gerencie seus contatos no funil de vendas</p>
          </div>
        </div>
        <KanbanBoard userRole={user.role} />
      </div>
    </AppLayout>
  );
}
