"use client";

import { useEffect, useState, use, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SpendChart } from "@/components/charts/spend-chart";
import { UsageHeatmap } from "@/components/charts/usage-heatmap";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, PROVIDER_LABELS, PROVIDER_COLORS } from "@/lib/utils";
import { DollarSign, Zap, Hash, Settings2 } from "lucide-react";

interface UserDetail {
  user: {
    id: string; name: string; email: string;
    department: string | null; team: string | null;
    jobTitle: string | null; employeeId: string | null; status: string;
    monthlyBudget?: number | null;
    alertThreshold?: number;
  };
  usage: Array<{
    provider: string; model: string | null;
    _sum: { inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null; requestsCount: number | null; costUsd: number | null };
  }>;
  dailyUsage: Array<{ date: string; provider: string; total_cost: number; total_tokens: number }>;
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = use(params);
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetValue, setBudgetValue] = useState("");
  const [thresholdValue, setThresholdValue] = useState("80");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    api.getByUser(30, { userId })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleBudgetSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const budget = budgetValue === "" ? null : parseFloat(budgetValue);
      const threshold = parseInt(thresholdValue) || 80;
      await api.updateUserBudget(userId, budget, threshold);
      setBudgetModal(false);
      loadData();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save budget");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Breadcrumb items={[{ label: "Users", href: "/dashboard/users" }, { label: "Loading..." }]} />
        <div className="grid grid-cols-3 gap-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Breadcrumb items={[{ label: "Users", href: "/dashboard/users" }, { label: "Error" }]} />
        <Card className="p-8 text-center"><p className="text-destructive">{error ?? "User not found"}</p></Card>
      </div>
    );
  }

  const { user, usage, dailyUsage } = data;
  const totalCost = usage.reduce((s, u) => s + Number(u._sum.costUsd ?? 0), 0);
  const totalTokens = usage.reduce((s, u) => s + (u._sum.inputTokens ?? 0) + (u._sum.outputTokens ?? 0), 0);
  const totalRequests = usage.reduce((s, u) => s + (u._sum.requestsCount ?? 0), 0);
  const budget = user.monthlyBudget ? Number(user.monthlyBudget) : null;
  const budgetPct = budget && budget > 0 ? (totalCost / budget) * 100 : null;

  const dailyAgg = dailyUsage.reduce((acc, d) => {
    const existing = acc.find((a) => a.date === d.date);
    if (existing) { existing.total_cost += d.total_cost; existing.total_tokens += d.total_tokens; }
    else acc.push({ ...d });
    return acc;
  }, [] as Array<{ date: string; total_cost: number; total_tokens: number }>);

  const byProvider = new Map<string, { cost: number; tokens: number; requests: number }>();
  for (const u of usage) {
    const key = u.provider;
    const entry = byProvider.get(key) ?? { cost: 0, tokens: 0, requests: 0 };
    entry.cost += Number(u._sum.costUsd ?? 0);
    entry.tokens += (u._sum.inputTokens ?? 0) + (u._sum.outputTokens ?? 0);
    entry.requests += u._sum.requestsCount ?? 0;
    byProvider.set(key, entry);
  }

  return (
    <div>
      <Breadcrumb items={[{ label: "Users", href: "/dashboard/users" }, { label: user.name }]} />

      <div className="flex items-start gap-4 mb-6">
        <Avatar name={user.name} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{user.name}</h1>
            <Badge variant={user.status === "active" ? "success" : "warning"}>{user.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {user.jobTitle && <span className="text-xs text-muted-foreground">{user.jobTitle}</span>}
            {user.department && <Badge variant="outline">{user.department}</Badge>}
            {user.team && <Badge variant="outline">{user.team}</Badge>}
          </div>
        </div>
        <button
          onClick={() => {
            setBudgetValue(budget?.toString() ?? "");
            setThresholdValue(String(user.alertThreshold ?? 80));
            setBudgetModal(true);
          }}
          className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1.5"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {budget ? "Edit Budget" : "Set Budget"}
        </button>
      </div>

      {/* Budget card (when set) */}
      {budget != null && budgetPct != null && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Monthly Budget</span>
              <span className="text-sm">
                {formatCurrency(totalCost)} / {formatCurrency(budget)}
                <span className="text-muted-foreground ml-1">({budgetPct.toFixed(0)}%)</span>
              </span>
            </div>
            <ProgressBar
              value={totalCost}
              max={budget}
              alertThreshold={user.alertThreshold ?? 80}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Spend" value={formatCurrency(totalCost)} subtitle="Last 30 days" icon={DollarSign} />
        <StatCard title="Total Tokens" value={formatTokens(totalTokens)} icon={Zap} />
        <StatCard title="Requests" value={totalRequests.toLocaleString()} icon={Hash} />
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "providers", label: "By Provider", count: byProvider.size },
          { id: "models", label: "By Model", count: usage.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === "overview" && (
        <>
          <Card>
            <CardHeader><CardTitle>Spend Over Time</CardTitle></CardHeader>
            <CardContent><SpendChart data={dailyAgg} /></CardContent>
          </Card>

          {dailyAgg.length > 0 && (
            <Card className="mt-6">
              <CardHeader><CardTitle>Usage Heatmap</CardTitle></CardHeader>
              <CardContent>
                <UsageHeatmap
                  data={dailyAgg.map((d) => ({ date: d.date.split("T")[0], value: d.total_cost }))}
                  weeks={13}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab === "providers" && (
        <Card>
          <CardHeader><CardTitle>Usage by Provider</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...byProvider.entries()].sort(([, a], [, b]) => b.cost - a.cost).map(([provider, stats]) => {
                const maxCost = Math.max(...[...byProvider.values()].map((v) => v.cost));
                const pct = maxCost > 0 ? (stats.cost / maxCost) * 100 : 0;
                return (
                  <div key={provider}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">{PROVIDER_LABELS[provider] ?? provider}</span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="font-medium">{formatCurrency(stats.cost)}</span>
                        <span className="text-muted-foreground">{formatTokens(stats.tokens)} tokens</span>
                        <span className="text-muted-foreground">{stats.requests.toLocaleString()} reqs</span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: PROVIDER_COLORS[provider] ?? "#6b7280" }}
                      />
                    </div>
                  </div>
                );
              })}
              {byProvider.size === 0 && <p className="text-sm text-muted-foreground text-center py-4">No provider data</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "models" && (
        <Card>
          <CardHeader><CardTitle>Usage by Model</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Input</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Output</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-3 text-sm">{PROVIDER_LABELS[u.provider] ?? u.provider}</td>
                    <td className="px-6 py-3 text-sm font-mono text-muted-foreground">{u.model ?? "—"}</td>
                    <td className="px-6 py-3 text-right text-sm font-medium">{formatCurrency(Number(u._sum.costUsd ?? 0))}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatTokens(u._sum.inputTokens ?? 0)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatTokens(u._sum.outputTokens ?? 0)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{(u._sum.requestsCount ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
                {usage.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">No usage data</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Budget Modal */}
      <Modal open={budgetModal} title="User Budget" onClose={() => setBudgetModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Monthly Budget ($)</label>
              <input
                type="number" min="0" step="10" value={budgetValue}
                onChange={(e) => setBudgetValue(e.target.value)}
                placeholder="Leave empty for no budget"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">Optional. Leave empty to remove the budget cap.</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Alert Threshold (%)</label>
              <input
                type="number" min="1" max="200" value={thresholdValue}
                onChange={(e) => setThresholdValue(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              {budget != null && (
                <button
                  onClick={() => { setBudgetValue(""); }}
                  className="px-3 py-1.5 text-sm text-destructive hover:underline"
                >
                  Remove Budget
                </button>
              )}
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
              <button
                onClick={() => setBudgetModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleBudgetSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </Modal>
    </div>
  );
}
