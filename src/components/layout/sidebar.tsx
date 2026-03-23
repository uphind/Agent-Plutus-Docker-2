"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Plug,
  Building2,
  Settings,
  Boxes,
  UsersRound,
  FileBarChart,
  TrendingUp,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navSections = [
  {
    label: "OVERVIEW",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "ORGANIZATION",
    items: [
      { name: "Departments", href: "/dashboard/departments", icon: Building2 },
      { name: "Teams", href: "/dashboard/teams", icon: UsersRound },
      { name: "Users", href: "/dashboard/users", icon: Users },
    ],
  },
  {
    label: "ANALYTICS",
    items: [
      { name: "Reports", href: "/dashboard/reports", icon: FileBarChart },
      { name: "Trends", href: "/dashboard/trends", icon: TrendingUp },
      { name: "Models", href: "/dashboard/models", icon: Boxes },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { name: "Suggestions", href: "/dashboard/suggestions", icon: Lightbulb },
    ],
  },
  {
    label: "CONFIGURATION",
    items: [
      { name: "Providers", href: "/dashboard/providers", icon: Plug },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-14 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-5")}>
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          {!collapsed && (
            <span className="text-base font-bold tracking-tight text-white">Tokenear</span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        {navSections.map((section) => (
          <div key={section.label} className="mb-5">
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={collapsed ? item.name : undefined}
                    className={cn(
                      "flex items-center rounded-lg text-[13px] font-medium transition-colors",
                      collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign out + collapse */}
      <div className="border-t border-sidebar-border p-2.5 space-y-1">
        <button
          onClick={() => window.location.href = "/api/auth/signout"}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex items-center rounded-lg text-[13px] font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors w-full",
            collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && "Sign out"}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}

export function useSidebarWidth() {
  return "ml-60";
}
