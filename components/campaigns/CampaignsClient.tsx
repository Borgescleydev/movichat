"use client";

import { useState } from "react";
import GroupsTab from "./GroupsTab";
import TemplatesTab from "./TemplatesTab";
import CampaignsTab from "./CampaignsTab";
import ManualDispatch from "./ManualDispatch";
import DispatchGroupsTab from "./DispatchGroupsTab";

type Tab = "disparo" | "campanhas" | "templates" | "grupos" | "grupos-disparo";

const TABS: { id: Tab; label: string; icon: React.ReactNode; highlight?: boolean }[] = [
  {
    id: "disparo",
    label: "Disparo Manual",
    highlight: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
  },
  {
    id: "campanhas",
    label: "Campanhas",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    id: "templates",
    label: "Templates",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "grupos",
    label: "Grupos",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: "grupos-disparo",
    label: "Grupos de Disparo",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
];

export default function CampaignsClient() {
  const [tab, setTab] = useState<Tab>("disparo");

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--page-bg)" }}>
      {/* Page header */}
      <div className="px-8 pt-8 pb-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Campanhas</h1>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          Disparos em massa para grupos do WhatsApp — manual ou agendado
        </p>
        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors"
              style={
                tab === t.id
                  ? {
                      backgroundColor: "var(--card-bg)",
                      color: t.highlight ? "var(--primary)" : "var(--primary)",
                      borderTop: `2px solid var(--primary)`,
                      borderLeft: "1px solid var(--border)",
                      borderRight: "1px solid var(--border)",
                    }
                  : {
                      color: t.highlight ? "var(--primary)" : "var(--text-secondary)",
                      fontWeight: t.highlight ? 600 : undefined,
                    }
              }
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-8">
        {tab === "disparo" && <ManualDispatch />}
        {tab === "campanhas" && <CampaignsTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "grupos" && <GroupsTab />}
        {tab === "grupos-disparo" && <DispatchGroupsTab />}
      </div>
    </div>
  );
}
