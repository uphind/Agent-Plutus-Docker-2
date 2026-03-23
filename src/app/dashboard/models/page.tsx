"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, formatNumber, formatModelName, isOverageModel, PROVIDER_LABELS, PROVIDER_COLORS } from "@/lib/utils";

interface ModelRow {
  model: string; provider: string;
  totalCost: number; totalTokens: number; inputTokens: number; outputTokens: number;
  requestsCount: number; recordCount: number;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getByModel(days)
      .then((data) => setModels(data.models ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  if (error) {
    return (
      <div>
        <Header title="Models" />
        <Card className="p-8 text-center"><p className="text-destructive">{error}</p></Card>
      </div>
    );
  }

  const maxCost = Math.max(...models.map((m) => m.totalCost), 1);

  return (
    <div>
      <Header
        title="Models"
        description="Usage breakdown by AI model"
        action={
          <Select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            options={[
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
            ]}
          />
        }
      />

      {loading ? (
        <SkeletonTable rows={8} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-40">Relative Cost</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Input</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Output</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">$/Req</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium">{formatModelName(m.model || "unknown")}</span>
                        {isOverageModel(m.model) && (
                          <Badge variant="warning" className="text-[10px] px-1.5 py-0">overage</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: PROVIDER_COLORS[m.provider] ?? "#6b7280" }} />
                        <span className="text-sm">{PROVIDER_LABELS[m.provider] ?? m.provider}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(m.totalCost / maxCost) * 100}%`,
                            backgroundColor: PROVIDER_COLORS[m.provider] ?? "#6b7280",
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-medium">{formatCurrency(m.totalCost)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatTokens(m.inputTokens)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatTokens(m.outputTokens)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatNumber(m.requestsCount)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">
                      {m.requestsCount > 0 ? `$${(m.totalCost / m.requestsCount).toFixed(4)}` : "—"}
                    </td>
                  </tr>
                ))}
                {models.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-sm text-muted-foreground">No model usage data yet</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
