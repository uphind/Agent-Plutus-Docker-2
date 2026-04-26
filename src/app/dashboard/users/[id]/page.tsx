"use client";

import { useEffect, useState, use, useCallback, useMemo } from "react";
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
import { DollarSign, Zap, Hash, Settings2, Sparkles, ArrowRight, ChevronDown, ChevronRight, FolderTree, Search } from "lucide-react";

interface UserDetail {
  user: {
    id: string; name: string; email: string;
    department: string | null; team: string | null;
    jobTitle: string | null; employeeId: string | null; status: string;
    monthlyBudget?: number | null;
    alertThreshold?: number;
    /**
     * Full Graph user object (or HR-system payload) captured at sync time.
     * Powers the "Directory" tab so admins can see every attribute without
     * us hardcoding columns. Null when the user was created before the
     * raw_attributes column existed and hasn't re-synced since.
     */
    rawAttributes?: Record<string, unknown> | null;
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

  interface RecRow {
    model: string;
    provider: string;
    category: string;
    total_cost_usd: number;
    recommendation_global: string;
    is_cheaper_global: boolean;
    est_savings_global_usd: number | null;
    recommendation_same_vendor: string;
    is_cheaper_same_vendor: boolean;
    est_savings_same_vendor_usd: number | null;
    why_cheaper_plain_english: string;
  }
  const [recs, setRecs] = useState<RecRow[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);

  const loadData = useCallback(() => {
    api.getByUser(30, { userId })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    api.getRecommendations({ userId })
      .then((d: { rows: RecRow[] }) => {
        setRecs(d.rows?.filter((r: RecRow) => r.is_cheaper_global || r.is_cheaper_same_vendor) ?? []);
      })
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false));
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

      {/* Cost Optimization Recommendations */}
      {!recsLoading && recs.length > 0 && (
        <Card className="mb-6 overflow-hidden border-emerald-200/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <CardTitle className="text-sm">Cost Optimization</CardTitle>
              <Badge variant="success" className="ml-auto">
                {formatCurrency(recs.reduce((s, r) => s + (r.est_savings_global_usd ?? 0), 0))} potential savings
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-y border-border bg-muted/30">
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                  <th className="px-5 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Best (any vendor)</th>
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Best (same vendor)</th>
                  <th className="px-5 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => {
                  const key = `${r.provider}-${r.model}`;
                  const isOpen = expandedRec === key;
                  return (
                    <UserRecRow key={key} row={r} isOpen={isOpen} onToggle={() => setExpandedRec(isOpen ? null : key)} />
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "providers", label: "By Provider", count: byProvider.size },
          { id: "models", label: "By Model", count: usage.length },
          {
            id: "directory",
            label: "Directory",
            count: countDirectoryFields(user.rawAttributes),
          },
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

      {tab === "directory" && (
        <DirectoryTab rawAttributes={user.rawAttributes ?? null} user={user} />
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

/**
 * Walks the raw attributes object and counts every leaf field path so the
 * "Directory" tab can show a count badge in the tab strip — e.g.
 * "Directory (47)". We count leaves rather than top-level keys so users
 * see the full attribute density (manager.displayName, extensionAttribute7,
 * etc.) instead of just "5 top-level objects".
 */
function countDirectoryFields(raw: Record<string, unknown> | null | undefined): number {
  if (!raw) return 0;
  let count = 0;
  const walk = (value: unknown, depth: number) => {
    if (depth > 4) {
      count++;
      return;
    }
    if (value === null || value === undefined) {
      count++;
      return;
    }
    if (Array.isArray(value)) {
      count++;
      return;
    }
    if (typeof value === "object") {
      const keys = Object.keys(value as Record<string, unknown>).filter((k) => !k.startsWith("@odata"));
      if (keys.length === 0) {
        count++;
        return;
      }
      for (const k of keys) walk((value as Record<string, unknown>)[k], depth + 1);
      return;
    }
    count++;
  };
  walk(raw, 0);
  return count;
}

/**
 * Flattens the raw attributes object into a sorted list of dot-path entries
 * so the table can render every leaf — including null/empty ones — for the
 * admin to see. Empty strings, `null`, and `undefined` are surfaced as
 * "(empty)" so the user can verify a field exists in the directory but
 * happens to be blank for this person (and isn't just dropped silently
 * the way the old code did).
 */
function flattenAttributes(raw: Record<string, unknown>): Array<{ path: string; value: unknown }> {
  const out: Array<{ path: string; value: unknown }> = [];
  const walk = (value: unknown, prefix: string, depth: number) => {
    if (depth > 4) {
      out.push({ path: prefix, value });
      return;
    }
    if (value === null || value === undefined) {
      out.push({ path: prefix, value });
      return;
    }
    if (Array.isArray(value)) {
      out.push({ path: prefix, value });
      return;
    }
    if (typeof value === "object") {
      const keys = Object.keys(value as Record<string, unknown>).filter((k) => !k.startsWith("@odata"));
      if (keys.length === 0) {
        out.push({ path: prefix, value: {} });
        return;
      }
      for (const k of keys) {
        const child = (value as Record<string, unknown>)[k];
        const path = prefix ? `${prefix}.${k}` : k;
        walk(child, path, depth + 1);
      }
      return;
    }
    out.push({ path: prefix, value });
  };
  walk(raw, "", 0);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function formatAttributeValue(value: unknown): { display: string; isEmpty: boolean } {
  if (value === null || value === undefined) return { display: "(empty)", isEmpty: true };
  if (value === "") return { display: "(empty string)", isEmpty: true };
  if (Array.isArray(value)) {
    if (value.length === 0) return { display: "(empty array)", isEmpty: true };
    return { display: value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", "), isEmpty: false };
  }
  if (typeof value === "boolean") return { display: value ? "true" : "false", isEmpty: false };
  if (typeof value === "object") return { display: JSON.stringify(value), isEmpty: false };
  return { display: String(value), isEmpty: false };
}

function DirectoryTab({
  rawAttributes,
  user,
}: {
  rawAttributes: Record<string, unknown> | null;
  user: UserDetail["user"];
}) {
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(true);

  // Always merge in the relational columns so the tab is useful even when
  // the user was synced before raw_attributes existed (no Graph re-sync
  // yet → rawAttributes is null, but we can still show the basics).
  const merged = useMemo<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = {
      id: user.id,
      email: user.email,
      displayName: user.name,
      jobTitle: user.jobTitle,
      department: user.department,
      team: user.team,
      employeeId: user.employeeId,
      status: user.status,
    };
    if (rawAttributes && typeof rawAttributes === "object") {
      // rawAttributes wins where both exist — Graph is the source of truth.
      return { ...base, ...rawAttributes };
    }
    return base;
  }, [rawAttributes, user]);

  const flat = useMemo(() => flattenAttributes(merged), [merged]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flat.filter((entry) => {
      const formatted = formatAttributeValue(entry.value);
      if (!showEmpty && formatted.isEmpty) return false;
      if (!q) return true;
      return (
        entry.path.toLowerCase().includes(q) ||
        formatted.display.toLowerCase().includes(q)
      );
    });
  }, [flat, search, showEmpty]);

  const hasGraphData = !!rawAttributes;
  const populatedCount = flat.filter((e) => !formatAttributeValue(e.value).isEmpty).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-muted-foreground" />
              Directory attributes
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Every field captured for this user from the directory source.{" "}
              <span className="font-medium">{populatedCount}</span> populated of{" "}
              <span className="font-medium">{flat.length}</span> total.
              {!hasGraphData && (
                <span className="ml-1 text-amber-600">
                  Run a directory sync to populate Graph fields like manager and extension attributes.
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showEmpty}
                onChange={(e) => setShowEmpty(e.target.checked)}
                className="rounded border-border"
              />
              Show empty fields
            </label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter fields..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background w-48"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            {search ? "No fields match your filter." : "No directory data available."}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-[40%]">
                  Field
                </th>
                <th className="px-6 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const formatted = formatAttributeValue(entry.value);
                return (
                  <tr key={entry.path} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-2 text-xs font-mono text-foreground align-top">
                      {entry.path}
                    </td>
                    <td className={`px-6 py-2 text-xs align-top break-all ${formatted.isEmpty ? "text-muted-foreground italic" : "text-foreground"}`}>
                      {formatted.display}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

const REC_CATEGORY_COLORS: Record<string, string> = {
  "\u{1F9D1}\u200D\u{1F4BB} Power / Technical": "bg-indigo-500/10 text-indigo-700",
  "\u270D\uFE0F Content Generator": "bg-amber-500/10 text-amber-700",
  "\u{1F4AC} Conversational": "bg-sky-500/10 text-sky-700",
  "\u{1F50D} Lookup / Q&A": "bg-emerald-500/10 text-emerald-700",
  "\u{1F9EA} Explorer": "bg-violet-500/10 text-violet-700",
};

function UserRecRow({ row, isOpen, onToggle }: {
  row: {
    model: string; provider: string; category: string; total_cost_usd: number;
    recommendation_global: string; is_cheaper_global: boolean; est_savings_global_usd: number | null;
    recommendation_same_vendor: string; is_cheaper_same_vendor: boolean; est_savings_same_vendor_usd: number | null;
    why_cheaper_plain_english: string;
  };
  isOpen: boolean;
  onToggle: () => void;
}) {
  const catClass = REC_CATEGORY_COLORS[row.category] ?? "bg-gray-500/10 text-gray-700";
  return (
    <>
      <tr onClick={onToggle} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer">
        <td className="px-5 py-2.5">
          <p className="text-xs font-medium">{row.model}</p>
          <p className="text-[10px] text-muted-foreground">{row.provider}</p>
        </td>
        <td className="px-5 py-2.5">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${catClass}`}>{row.category}</span>
        </td>
        <td className="px-5 py-2.5 text-right text-xs font-medium tabular-nums">{formatCurrency(row.total_cost_usd)}</td>
        <td className="px-5 py-2.5">
          {row.is_cheaper_global ? (
            <div className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3 text-emerald-600 shrink-0" />
              <span className="text-xs truncate max-w-[140px]">{row.recommendation_global}</span>
              <span className="text-xs font-semibold text-emerald-600 tabular-nums">{formatCurrency(row.est_savings_global_usd ?? 0)}</span>
            </div>
          ) : <span className="text-xs text-muted-foreground">&mdash;</span>}
        </td>
        <td className="px-5 py-2.5">
          {row.is_cheaper_same_vendor ? (
            <div className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3 text-sky-600 shrink-0" />
              <span className="text-xs truncate max-w-[140px]">{row.recommendation_same_vendor}</span>
              <span className="text-xs font-semibold text-sky-600 tabular-nums">{formatCurrency(row.est_savings_same_vendor_usd ?? 0)}</span>
            </div>
          ) : <span className="text-xs text-muted-foreground">&mdash;</span>}
        </td>
        <td className="px-5 py-2.5">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-6 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">{row.why_cheaper_plain_english}</p>
          </td>
        </tr>
      )}
    </>
  );
}
