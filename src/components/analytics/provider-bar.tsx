"use client";

import { PROVIDER_LABELS, PROVIDER_COLORS, formatCurrency } from "@/lib/utils";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderBarProps {
  providers: Array<{ provider: string; totalCost: number }>;
  activeProvider: string;
  onSelect: (provider: string) => void;
}

export function ProviderBar({ providers, activeProvider, onSelect }: ProviderBarProps) {
  const sorted = [...providers].sort((a, b) => b.totalCost - a.totalCost);
  const isFiltered = activeProvider !== "";

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onSelect("")}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all",
            !isFiltered
              ? "border-brand bg-brand/5 text-brand ring-1 ring-brand/20"
              : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
          )}
        >
          All Providers
        </button>

        {sorted.map((p) => {
          const isActive = activeProvider === p.provider;
          const color = PROVIDER_COLORS[p.provider] ?? "#6b7280";
          return (
            <button
              key={p.provider}
              onClick={() => onSelect(isActive ? "" : p.provider)}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all",
                isActive
                  ? "text-white shadow-sm border-transparent"
                  : isFiltered
                  ? "border-border text-muted-foreground/50 hover:text-muted-foreground hover:border-muted-foreground/30"
                  : "border-border text-foreground hover:border-muted-foreground/40"
              )}
              style={isActive ? { backgroundColor: color } : {}}
            >
              {!isActive && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}
              <span>{PROVIDER_LABELS[p.provider] ?? p.provider}</span>
              <span className={cn("text-xs", isActive ? "opacity-80" : "text-muted-foreground")}>
                {formatCurrency(p.totalCost)}
              </span>
              {isActive && <X className="h-3.5 w-3.5 opacity-70" />}
            </button>
          );
        })}
      </div>

      {isFiltered && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Showing: <span className="font-medium text-foreground">{PROVIDER_LABELS[activeProvider] ?? activeProvider}</span>
          </span>
          <button
            onClick={() => onSelect("")}
            className="text-brand hover:text-brand-light font-medium"
          >
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
}
