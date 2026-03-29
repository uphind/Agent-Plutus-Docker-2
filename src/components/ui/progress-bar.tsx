"use client";

import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  alertThreshold?: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  alertThreshold = 80,
  showLabel = true,
  size = "md",
  className,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 150) : 0;
  const displayPct = Math.round(pct * 10) / 10;
  const fillPct = Math.min(pct, 100);

  const barHex =
    pct >= 100
      ? "#ef4444"
      : pct >= 90
        ? "#f97316"
        : pct >= alertThreshold
          ? "#f59e0b"
          : pct >= 50
            ? "#eab308"
            : "#10b981";

  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" };

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("w-full rounded-full bg-muted overflow-hidden", heights[size])}>
        <div
          className={cn("rounded-full transition-all duration-500", heights[size])}
          style={{ width: `${fillPct}%`, backgroundColor: barHex }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className={cn(
            "text-xs font-medium",
            pct >= 100 ? "text-red-600" : pct >= 90 ? "text-orange-600" : pct >= alertThreshold ? "text-amber-600" : "text-muted-foreground"
          )}>
            {displayPct}%
          </span>
        </div>
      )}
    </div>
  );
}
