"use client";

import { PieChart as PieChartIcon, LineChart as LineChartIcon, AreaChart as AreaChartIcon, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChartType = "pie" | "line" | "area" | "bar";

const CHART_OPTIONS: Array<{ id: ChartType; icon: typeof PieChartIcon; label: string }> = [
  { id: "pie", icon: PieChartIcon, label: "Pie chart" },
  { id: "line", icon: LineChartIcon, label: "Line chart" },
  { id: "area", icon: AreaChartIcon, label: "Area chart" },
  { id: "bar", icon: BarChart3, label: "Bar chart" },
];

interface ChartTypeToggleProps {
  value: ChartType;
  onChange: (type: ChartType) => void;
  types?: ChartType[];
  className?: string;
}

export function ChartTypeToggle({
  value,
  onChange,
  types = ["pie", "line", "area", "bar"],
  className,
}: ChartTypeToggleProps) {
  const visible = CHART_OPTIONS.filter((opt) => types.includes(opt.id));
  return (
    <div className={cn("flex items-center gap-0.5 bg-muted rounded-lg p-0.5", className)}>
      {visible.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
