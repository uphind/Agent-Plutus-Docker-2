"use client";

import { cn } from "@/lib/utils";

const COUNT_COLORS: Record<string, { bg: string; text: string }> = {
  red: { bg: "#ef4444", text: "#fff" },
  orange: { bg: "#f97316", text: "#fff" },
  amber: { bg: "#f59e0b", text: "#fff" },
  yellow: { bg: "#eab308", text: "#fff" },
  green: { bg: "#10b981", text: "#fff" },
};

interface TabsProps {
  tabs: Array<{ id: string; label: string; count?: number; countColor?: string }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex gap-1 border-b border-border", className)}>
      {tabs.map((tab) => {
        const cc = tab.countColor ? COUNT_COLORS[tab.countColor] : null;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative",
              active === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    !cc && (active === tab.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
                  )}
                  style={cc ? { backgroundColor: cc.bg, color: cc.text } : undefined}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {active === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
