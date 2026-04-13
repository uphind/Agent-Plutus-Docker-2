"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  text: string;
  className?: string;
  iconSize?: number;
}

export function InfoTooltip({ text, className, iconSize = 14 }: InfoTooltipProps) {
  return (
    <span className={cn("relative inline-flex items-center group", className)}>
      <HelpCircle
        className="text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors"
        style={{ width: iconSize, height: iconSize }}
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100 z-50"
      >
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-border" />
      </span>
    </span>
  );
}
