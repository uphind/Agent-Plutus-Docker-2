"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { cn } from "@/lib/utils";
import { AiChatbot } from "@/components/ai-chatbot";

interface DashboardShellProps {
  user: { name: string | null; email: string | null } | null;
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-sidebar overflow-hidden">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />

      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-200",
          collapsed ? "ml-[68px]" : "ml-60"
        )}
      >
        <TopBar user={user} />

        <div className="flex-1 min-h-0 pr-3.5 pb-3.5">
          <main className="h-full bg-background rounded-tl-2xl rounded-tr-xl rounded-bl-xl rounded-br-xl overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>

      <AiChatbot />
    </div>
  );
}
