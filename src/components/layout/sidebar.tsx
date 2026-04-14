"use client";

import Link from "next/link";
import Image from "next/image";
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
  ChevronLeft,
  ChevronRight,
  LogOut,
  Compass,
  ChartLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions/auth";
import { useTerminology } from "@/lib/terminology";

interface NavItem {
  name: string;
  termKey?: string;
  href: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "OVERVIEW",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "ORGANIZATION",
    items: [
      { name: "Departments", termKey: "departments", href: "/dashboard/departments", icon: Building2 },
      { name: "Teams", termKey: "teams", href: "/dashboard/teams", icon: UsersRound },
      { name: "Users", termKey: "users", href: "/dashboard/users", icon: Users },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { name: "Models", href: "/dashboard/models", icon: Boxes },
      { name: "Explorer", href: "/dashboard/explorer", icon: Compass },
      { name: "Analytics", href: "/dashboard/analytics", icon: TrendingUp },
      { name: "Forecasting", href: "/dashboard/forecasting", icon: ChartLine },
      { name: "User Analysis", termKey: "seat optimization", href: "/dashboard/seat-optimization", icon: Users },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { name: "Suggestions", href: "/dashboard/suggestions", icon: Sparkles },
      { name: "Reports", href: "/dashboard/reports", icon: FileBarChart },
    ],
  },
  {
    label: "CONFIGURATION",
    items: [
      { name: "Providers", href: "/dashboard/providers", icon: Plug },
      { name: "Provider Health", href: "/dashboard/provider-health", icon: ShieldCheck },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTerminology();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 overflow-hidden",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      {/* Decorative gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(22,22,231,0.12),transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(22,22,231,0.08),transparent_60%)] pointer-events-none" />

      {/* Logo */}
      <div className={cn("relative flex h-14 items-center", collapsed ? "justify-center px-2" : "px-5")}>
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo/symbol.svg"
            alt="Agent Plutus"
            width={28}
            height={28}
            className="brightness-0 invert shrink-0"
          />
          {!collapsed && (
            <Image
              src="/logo/text-white.svg"
              alt="Agent Plutus"
              width={120}
              height={24}
            />
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 overflow-y-auto py-3 px-2.5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const displayName = item.termKey ? t(item.termKey) : item.name;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? displayName : undefined}
                    className={cn(
                      "flex items-center rounded-lg text-[13px] font-medium transition-colors",
                      collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && displayName}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign out + collapse */}
      <div className="relative border-t border-sidebar-border p-2.5 space-y-1">
        <form action={signOutAction}>
          <button
            type="submit"
            title={collapsed ? "Sign out" : undefined}
            className={cn(
              "flex items-center rounded-lg text-[13px] font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors w-full",
              collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"
            )}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </form>
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-full rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
