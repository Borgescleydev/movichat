import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import KanbanBoard from "@/components/kanban/KanbanBoard";

export default async function PipelinePage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <AppLayout user={{ name: user.name, role: user.role }}>
      <div className="p-8 h-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
            <p className="text-gray-500">Gerencie seus contatos no funil de vendas</p>
          </div>
        </div>
        <KanbanBoard userRole={user.role} />
      </div>
    </AppLayout>
  );
}
