"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatCurrency, formatTokens, PROVIDER_LABELS } from "@/lib/utils";
import { Boxes } from "lucide-react";

interface ModelRow {
  model: string;
  provider: string;
  total_cost: number;
  total_tokens: number;
  total_requests: number;
}

interface TopModelsTableProps {
  data: ModelRow[];
  limit?: number;
  title?: string;
  compact?: boolean;
}

export function TopModelsTable({ data, limit = 10, title = "Top Models", compact = false }: TopModelsTableProps) {
  const rows = data.slice(0, limit);

  if (rows.length === 0) {
    return compact ? null : (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-muted-foreground">
            <Boxes className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No model usage data yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxCost = Math.max(...rows.map((r) => r.total_cost), 1);

  if (compact) {
    return (
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/50">
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.provider}-${r.model}-${i}`} className="border-b border-border/30 last:border-0">
              <td className="px-3 py-1.5">
                <span className="text-xs font-medium">{r.model}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5">{PROVIDER_LABELS[r.provider] ?? r.provider}</span>
              </td>
              <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(r.total_cost)}</td>
              <td className="px-3 py-1.5 text-right text-xs text-muted-foreground tabular-nums">{r.total_requests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-8">#</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const barPct = (r.total_cost / maxCost) * 100;
                return (
                  <tr key={`${r.provider}-${r.model}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium">{r.model}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">
                        {PROVIDER_LABELS[r.provider] ?? r.provider}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden lg:block">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${barPct}%` }} />
                        </div>
                        <span className="text-sm font-medium tabular-nums">{formatCurrency(r.total_cost)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatTokens(r.total_tokens)}</td>
                    <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{r.total_requests}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
