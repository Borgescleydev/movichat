import { getAuthUserFull, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";

export default async function DashboardPage() {
  const user = await getAuthUserFull();
  if (!user) redirect("/login");
  if (!hasPermission(user, "reports")) redirect("/settings");

  const [totalContacts, totalCampaigns, session] = await Promise.all([
    prisma.contact.count(),
    prisma.campaign.count(),
    prisma.whatsAppSession.findUnique({ where: { id: "default" } }),
  ]);

  return (
    <AppLayout user={{ name: user.name, role: user.role, permissions: user.permissions }}>
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Dashboard</h1>
        <p className="mb-8" style={{ color: "var(--text-muted)" }}>Visão geral do seu CRM</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Total de Contatos" value={totalContacts} icon="👥" />
          <StatCard title="Campanhas" value={totalCampaigns} icon="📢" />
          <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>WhatsApp</span>
              <span className="text-xl">📱</span>
            </div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium`}
              style={{
                backgroundColor: session?.status === "connected" ? "color-mix(in srgb, var(--success) 12%, transparent)" : session?.status === "connecting" ? "color-mix(in srgb, #f59e0b 12%, transparent)" : "color-mix(in srgb, var(--danger) 10%, transparent)",
                color: session?.status === "connected" ? "var(--success)" : session?.status === "connecting" ? "#b45309" : "var(--danger)",
              }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: session?.status === "connected" ? "var(--success)" : session?.status === "connecting" ? "#f59e0b" : "var(--danger)" }} />
              {session?.status === "connected" ? "Conectado" : session?.status === "connecting" ? "Conectando..." : "Desconectado"}
            </div>
            {session?.phone && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{session.phone}</p>}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: string }) {
  return (
    <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}
