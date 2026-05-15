"use client";

import { useState } from "react";
import ContactCampaignsTab from "./ContactCampaignsTab";
import ContactTemplatesTab from "./ContactTemplatesTab";

type Tab = "campanhas" | "templates";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "campanhas",
    label: "Campanhas",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
];

export default function IndividualClient() {
  const [tab, setTab] = useState<Tab>("campanhas");

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--page-bg)" }}>
      {/* Page header */}
      <div className="px-8 pt-8 pb-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Disparo Individual</h1>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          Disparos para contatos individuais via WhatsApp — com variações de mensagem e cadência personalizada
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
                      color: "var(--primary)",
                      borderTop: "2px solid var(--primary)",
                      borderLeft: "1px solid var(--border)",
                      borderRight: "1px solid var(--border)",
                    }
                  : { color: "var(--text-secondary)" }
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
        {tab === "campanhas" && <ContactCampaignsTab />}
        {tab === "templates" && <ContactTemplatesTab />}
      </div>
    </div>
  );
}
