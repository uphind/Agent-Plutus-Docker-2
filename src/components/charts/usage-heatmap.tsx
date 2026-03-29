"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";

interface HeatmapProps {
  data: Array<{ date: string; value: number }>;
  weeks?: number;
}

const DAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getColorClass(value: number, max: number): string {
  if (value === 0 || max === 0) return "bg-gray-100";
  const ratio = value / max;
  if (ratio < 0.15) return "bg-brand/10";
  if (ratio < 0.3) return "bg-brand/20";
  if (ratio < 0.5) return "bg-brand/35";
  if (ratio < 0.75) return "bg-brand/55";
  return "bg-brand/80";
}

export function UsageHeatmap({ data, weeks = 26 }: HeatmapProps) {
  const [tooltip, setTooltip] = useState<{ date: string; value: number; x: number; y: number } | null>(null);

  const { grid, monthLabels, maxValue } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    for (const d of data) {
      map.set(d.date, d.value);
      if (d.value > max) max = d.value;
    }

    const today = new Date();
    const totalDays = weeks * 7;
    const start = new Date(today);
    start.setDate(start.getDate() - totalDays + 1);
    // Align to Monday
    const dayOfWeek = start.getDay();
    start.setDate(start.getDate() - ((dayOfWeek + 6) % 7));

    const cols: Array<Array<{ date: string; value: number }>> = [];
    const labels: Array<{ month: string; col: number }> = [];
    let lastMonth = -1;

    const d = new Date(start);
    while (d <= today || cols.length < weeks) {
      const week: Array<{ date: string; value: number }> = [];
      for (let day = 0; day < 7; day++) {
        const dateStr = d.toISOString().split("T")[0];
        const isFuture = d > today;
        week.push({
          date: dateStr,
          value: isFuture ? -1 : (map.get(dateStr) ?? 0),
        });

        if (day === 0 && d.getMonth() !== lastMonth) {
          labels.push({ month: MONTHS[d.getMonth()], col: cols.length });
          lastMonth = d.getMonth();
        }

        d.setDate(d.getDate() + 1);
      }
      cols.push(week);
      if (cols.length >= weeks + 2) break;
    }

    return { grid: cols, monthLabels: labels, maxValue: max };
  }, [data, weeks]);

  return (
    <div className="relative">
      {/* Month labels */}
      <div className="flex ml-8 mb-1" style={{ gap: "0px" }}>
        {monthLabels.map((m, i) => (
          <span
            key={i}
            className="text-[10px] text-muted-foreground absolute"
            style={{ left: `${m.col * 14 + 32}px` }}
          >
            {m.month}
          </span>
        ))}
      </div>

      <div className="flex gap-0 mt-5">
        {/* Day labels */}
        <div className="flex flex-col gap-[2px] mr-1 pt-0">
          {DAYS.map((label, i) => (
            <div key={i} className="h-[12px] flex items-center">
              <span className="text-[9px] text-muted-foreground w-6 text-right">{label}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-[2px]">
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[2px]">
              {week.map((day, di) => (
                <div
                  key={di}
                  className={`w-[12px] h-[12px] rounded-[2px] transition-colors ${
                    day.value < 0 ? "bg-transparent" : getColorClass(day.value, maxValue)
                  }`}
                  onMouseEnter={(e) => {
                    if (day.value >= 0) {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setTooltip({ date: day.date, value: day.value, x: rect.left, y: rect.top - 40 });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 ml-8">
        <span className="text-[9px] text-muted-foreground mr-1">Less</span>
        <div className="w-[10px] h-[10px] rounded-[2px] bg-gray-100" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-brand/10" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-brand/20" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-brand/35" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-brand/55" />
        <div className="w-[10px] h-[10px] rounded-[2px] bg-brand/80" />
        <span className="text-[9px] text-muted-foreground ml-1">More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 rounded-md bg-foreground text-background text-[11px] pointer-events-none shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <strong>{formatCurrency(tooltip.value)}</strong> on {tooltip.date}
        </div>
      )}
    </div>
  );
}
