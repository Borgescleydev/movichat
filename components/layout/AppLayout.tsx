"use client";

import Sidebar from "./Sidebar";
import type { UserPerms } from "@/lib/auth";

interface AppLayoutProps {
  children: React.ReactNode;
  user: { name: string; role: string; permissions?: UserPerms };
}

export default function AppLayout({ children, user }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      <main className="flex-1 ml-64 overflow-auto">
        {children}
      </main>
    </div>
  );
}
