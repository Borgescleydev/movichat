import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const [totalContacts, totalMessages, columns, session] = await Promise.all([
    prisma.contact.count(),
    prisma.message.count(),
    prisma.pipelineColumn.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { contacts: true } } } }),
    prisma.whatsAppSession.findUnique({ where: { id: "default" } }),
  ]);

  return (
    <AppLayout user={{ name: user.name, role: user.role }}>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-500 mb-8">Visão geral do seu CRM</p>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total de Contatos" value={totalContacts} color="bg-blue-500" icon="👥" />
          <StatCard title="Mensagens" value={totalMessages} color="bg-green-500" icon="💬" />
          <StatCard title="Colunas do Pipeline" value={columns.length} color="bg-purple-500" icon="📊" />
          <div className={`bg-white rounded-xl p-6 shadow-sm border border-gray-100`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">WhatsApp</span>
              <span className="text-xl">📱</span>
            </div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              session?.status === "connected"
                ? "bg-green-100 text-green-700"
                : session?.status === "connecting"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-700"
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                session?.status === "connected" ? "bg-green-500" : session?.status === "connecting" ? "bg-yellow-500" : "bg-red-500"
              }`} />
              {session?.status === "connected" ? "Conectado" : session?.status === "connecting" ? "Conectando..." : "Desconectado"}
            </div>
            {session?.phone && <p className="text-xs text-gray-400 mt-1">{session.phone}</p>}
          </div>
        </div>

        {/* Pipeline overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline</h2>
          <div className="space-y-3">
            {columns.map((col) => (
              <div key={col.id} className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="text-sm text-gray-700 flex-1">{col.name}</span>
                <span className="text-sm font-semibold text-gray-900">{col._count.contacts} contatos</span>
                <div className="w-32 bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      backgroundColor: col.color,
                      width: totalContacts > 0 ? `${(col._count.contacts / totalContacts) * 100}%` : "0%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, color, icon }: { title: string; value: number; color: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-sm font-medium">{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
