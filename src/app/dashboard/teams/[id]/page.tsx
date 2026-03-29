"use client";

import { useEffect, useState, useMemo, use } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { BudgetDonut } from "@/components/charts/budget-donut";
import { SpendChart } from "@/components/charts/spend-chart";
import { UsageHeatmap } from "@/components/charts/usage-heatmap";
import { SkeletonCard } from "@/components/ui/skeleton";
import { TopModelsTable } from "@/components/tables/top-models-table";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, PROVIDER_LABELS, PROVIDER_COLORS } from "@/lib/utils";
import {
  Settings2, Search, ChevronUp, ChevronDown, ArrowUpDown,
} from "lucide-react";

interface UserData {
  user_id: string; name: string; email: string; job_title: string | null;
  total_cost: number; total_tokens: number; total_requests: number; pctOfBudget: number | null;
}

interface TeamDetail {
  team: {
    id: string; name: string;
    department: { id: string; name: string };
    monthlyBudget: number | null; alertThreshold: number;
    currentSpend: number; budgetUsedPct: number | null; status: string;
  };
  users: UserData[];
  dailySpend: Array<{ date: string; total_cost: number }>;
  byProvider: Array<{ provider: string; total_cost: number; total_tokens: number }>;
  byModel: Array<{ model: string; provider: string; total_cost: number; total_tokens: number; total_requests: number }>;
}

type UserSortField = "name" | "job_title" | "total_cost" | "total_tokens" | "total_requests" | "pctOfBudget";
type SortDir = "asc" | "desc";

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("80");
  const [saving, setSaving] = useState(false);

  // User sort + search
  const [userSort, setUserSort] = useState<UserSortField>("total_cost");
  const [userSortDir, setUserSortDir] = useState<SortDir>("desc");
  const [userSearch, setUserSearch] = useState("");

  const load = () => {
    setLoading(true);
    api.getTeam(id).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleSaveBudget = async () => {
    setSaving(true);
    try {
      const budget = budgetInput.trim() ? parseFloat(budgetInput) : null;
      await api.updateTeamBudget(id, budget, parseInt(thresholdInput) || 80);
      setBudgetModal(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const sortedUsers = useMemo(() => {
    if (!data) return [];
    let list = data.users;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.job_title ?? "").toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (userSort) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "job_title": cmp = (a.job_title ?? "").localeCompare(b.job_title ?? ""); break;
        case "total_cost": cmp = a.total_cost - b.total_cost; break;
        case "total_tokens": cmp = a.total_tokens - b.total_tokens; break;
        case "total_requests": cmp = a.total_requests - b.total_requests; break;
        case "pctOfBudget": cmp = (a.pctOfBudget ?? -1) - (b.pctOfBudget ?? -1); break;
      }
      return userSortDir === "desc" ? -cmp : cmp;
    });
  }, [data, userSort, userSortDir, userSearch]);

  const toggleUserSort = (field: UserSortField) => {
    if (userSort === field) setUserSortDir(userSortDir === "asc" ? "desc" : "asc");
    else { setUserSort(field); setUserSortDir(field === "name" || field === "job_title" ? "asc" : "desc"); }
  };

  const UserSortIcon = ({ field }: { field: UserSortField }) => {
    if (userSort !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return userSortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  if (error && !data) {
    return (
      <div>
        <Breadcrumb items={[{ label: "Teams", href: "/dashboard/teams" }, { label: "Error" }]} />
        <Card className="p-8 text-center"><p className="text-destructive">{error}</p></Card>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div>
        <Breadcrumb items={[{ label: "Teams", href: "/dashboard/teams" }, { label: "Loading..." }]} />
        <div className="grid grid-cols-3 gap-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      </div>
    );
  }

  const team = data.team;
  const hasBudget = team.monthlyBudget !== null;
  const maxUserCost = Math.max(...data.users.map((u) => u.total_cost), 1);

  return (
    <div>
      <Breadcrumb items={[
        { label: "Departments", href: "/dashboard/departments" },
        { label: team.department.name, href: `/dashboard/departments/${team.department.id}` },
        { label: team.name },
      ]} />

      <Header
        title={team.name}
        description={`${team.department.name} · ${data.users.length} members`}
        action={
          <Button variant="secondary" size="sm" onClick={() => {
            setBudgetInput(team.monthlyBudget?.toString() ?? "");
            setThresholdInput(team.alertThreshold?.toString() ?? "80");
            setBudgetModal(true);
          }}>
            <Settings2 className="h-3.5 w-3.5" />
            Configure Budget
          </Button>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {hasBudget && (
          <Card className="p-5 flex items-center justify-center">
            <BudgetDonut spent={team.currentSpend} budget={team.monthlyBudget!} size={130} label="Team Budget" />
          </Card>
        )}
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Spend</p>
          <p className="text-2xl font-bold">{formatCurrency(team.currentSpend)}</p>
          {hasBudget && (
            <ProgressBar value={team.currentSpend} max={team.monthlyBudget!} alertThreshold={team.alertThreshold} size="sm" className="mt-3" />
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Members</p>
          <p className="text-2xl font-bold">{data.users.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Cost / User</p>
          <p className="text-2xl font-bold">
            {data.users.length > 0 ? formatCurrency(team.currentSpend / data.users.length) : "$0"}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {data.dailySpend.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Spend Trend</CardTitle></CardHeader>
            <CardContent>
              <SpendChart data={data.dailySpend.map((d) => ({ ...d, total_tokens: 0 }))} />
            </CardContent>
          </Card>
        )}

        {data.dailySpend.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Usage Heatmap</CardTitle></CardHeader>
            <CardContent>
              <UsageHeatmap
                data={data.dailySpend.map((d: { date: string; total_cost: number }) => ({ date: d.date.split("T")[0], value: d.total_cost }))}
                weeks={13}
              />
            </CardContent>
          </Card>
        )}
        {data.byProvider.length > 0 && (
          <Card>
            <CardHeader><CardTitle>By Provider</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.byProvider.map((p) => {
                  const maxCost = Math.max(...data.byProvider.map((x) => x.total_cost));
                  const pct = maxCost > 0 ? (p.total_cost / maxCost) * 100 : 0;
                  return (
                    <div key={p.provider} className="flex items-center gap-3">
                      <span className="text-xs w-20 text-right font-medium">{PROVIDER_LABELS[p.provider] ?? p.provider}</span>
                      <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                        <div
                          className="h-full rounded-md transition-all"
                          style={{ width: `${pct}%`, backgroundColor: PROVIDER_COLORS[p.provider] ?? "#6b7280" }}
                        />
                      </div>
                      <span className="text-xs font-medium w-20">{formatCurrency(p.total_cost)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Models */}
      {data.byModel && data.byModel.length > 0 && (
        <div className="mb-6">
          <TopModelsTable data={data.byModel} title="Top Models (This Month)" />
        </div>
      )}

      {/* Users — sortable, searchable */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Team Members ({sortedUsers.length})</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                className="pl-8 h-8 text-xs w-56"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {([
                    ["name", "User", "left"],
                    ["job_title", "Role", "left"],
                    ["total_cost", "Spend", "right"],
                    ["total_tokens", "Tokens", "right"],
                    ["total_requests", "Requests", "right"],
                    ...(hasBudget ? [["pctOfBudget", "% Budget", "right"] as [UserSortField, string, string]] : []),
                  ] as [UserSortField, string, string][]).map(([field, label, align]) => (
                    <th
                      key={field}
                      onClick={() => toggleUserSort(field)}
                      className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${align === "right" ? "text-right" : "text-left"}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label} <UserSortIcon field={field} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => {
                  const barPct = maxUserCost > 0 ? (u.total_cost / maxUserCost) * 100 : 0;
                  return (
                    <tr key={u.user_id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/users/${u.user_id}`} className="flex items-center gap-3 hover:text-brand transition-colors">
                          <Avatar name={u.name} size="sm" />
                          <div>
                            <p className="text-sm font-medium">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{u.job_title ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden hidden lg:block">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${barPct}%` }} />
                          </div>
                          <span className="text-sm font-medium tabular-nums">{formatCurrency(u.total_cost)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatTokens(u.total_tokens)}</td>
                      <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{u.total_requests}</td>
                      {hasBudget && (
                        <td className="px-5 py-3 text-right">
                          <Badge variant={u.pctOfBudget && u.pctOfBudget > 30 ? "warning" : "outline"}>
                            {u.pctOfBudget !== null ? `${u.pctOfBudget}%` : "—"}
                          </Badge>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {sortedUsers.length === 0 && (
                  <tr><td colSpan={hasBudget ? 6 : 5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {userSearch ? "No members match search" : "No members in this team"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Budget Modal */}
      <Modal open={budgetModal} onClose={() => setBudgetModal(false)} title="Configure Team Budget">
        <div className="space-y-4">
          <Input label="Monthly Budget ($)" type="number" min={0} step={100} placeholder="e.g. 2000" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} />
          <Input label="Alert Threshold (%)" type="number" min={1} max={200} placeholder="80" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setBudgetModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveBudget} disabled={saving}>{saving ? "Saving..." : "Save Budget"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
