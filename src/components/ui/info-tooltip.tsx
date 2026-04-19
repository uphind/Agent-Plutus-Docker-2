"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  text: React.ReactNode;
  className?: string;
  iconSize?: number;
  widthClass?: string;
  align?: "center" | "left" | "right";
}

export function InfoTooltip({
  text,
  className,
  iconSize = 14,
  widthClass = "w-56",
  align = "center",
}: InfoTooltipProps) {
  const positionClass =
    align === "left"
      ? "left-0"
      : align === "right"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";
  const arrowClass =
    align === "left"
      ? "left-3"
      : align === "right"
      ? "right-3"
      : "left-1/2 -translate-x-1/2";
  return (
    <span className={cn("relative inline-flex items-center group", className)}>
      <HelpCircle
        className="text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors"
        style={{ width: iconSize, height: iconSize }}
      />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full mb-2 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100 z-50 whitespace-normal text-left",
          positionClass,
          widthClass
        )}
      >
        {text}
        <span className={cn("absolute top-full -mt-px border-4 border-transparent border-t-border", arrowClass)} />
      </span>
    </span>
  );
}
