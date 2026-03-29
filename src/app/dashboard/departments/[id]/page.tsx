"use client";

import React, { useEffect, useState, useMemo, use } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusDot } from "@/components/ui/status-dot";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { BudgetDonut } from "@/components/charts/budget-donut";
import { SpendChart } from "@/components/charts/spend-chart";
import { UsageHeatmap } from "@/components/charts/usage-heatmap";
import { SkeletonCard } from "@/components/ui/skeleton";
import { TopModelsTable } from "@/components/tables/top-models-table";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens } from "@/lib/utils";
import {
  Settings2, Users, Layers, Search,
  ChevronUp, ChevronDown, ChevronRight, ArrowUpDown,
  Download,
} from "lucide-react";

interface TeamData {
  id: string; name: string; monthlyBudget: number | null; alertThreshold: number;
  userCount: number; currentSpend: number; totalTokens: number; totalRequests: number;
  budgetUsedPct: number | null; status: string;
}

interface UserData {
  user_id: string; name: string; email: string; team: string | null; team_id: string | null; total_cost: number; total_tokens: number;
}

interface ModelData {
  model: string; provider: string; total_cost: number; total_tokens: number; total_requests: number;
}

interface DeptDetail {
  department: {
    id: string; name: string; monthlyBudget: number | null; alertThreshold: number;
    currentSpend: number; budgetUsedPct: number | null; status: string;
  };
  teams: TeamData[];
  users: UserData[];
  dailySpend: Array<{ date: string; total_cost: number }>;
  byModel: ModelData[];
}

type TeamSortField = "name" | "userCount" | "currentSpend" | "totalTokens" | "budgetUsedPct";
type UserSortField = "name" | "team" | "total_cost" | "total_tokens";
type SortDir = "asc" | "desc";

export default function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DeptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("80");
  const [saving, setSaving] = useState(false);

  // Team expand/collapse
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const toggleTeamExpand = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId); else next.add(teamId);
      return next;
    });
  };

  // Team sort
  const [teamSort, setTeamSort] = useState<TeamSortField>("currentSpend");
  const [teamSortDir, setTeamSortDir] = useState<SortDir>("desc");

  // User sort + search + team filter
  const [userSort, setUserSort] = useState<UserSortField>("total_cost");
  const [userSortDir, setUserSortDir] = useState<SortDir>("desc");
  const [userSearch, setUserSearch] = useState("");
  const [userTeamFilter, setUserTeamFilter] = useState("");

  const load = () => {
    setLoading(true);
    api.getDepartment(id)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleSaveBudget = async () => {
    setSaving(true);
    try {
      const budget = budgetInput.trim() ? parseFloat(budgetInput) : null;
      const threshold = parseInt(thresholdInput) || 80;
      await api.updateDepartmentBudget(id, budget, threshold);
      setBudgetModal(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Sorted teams
  const sortedTeams = useMemo(() => {
    if (!data) return [];
    return [...data.teams].sort((a, b) => {
      let cmp = 0;
      switch (teamSort) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "userCount": cmp = a.userCount - b.userCount; break;
        case "currentSpend": cmp = a.currentSpend - b.currentSpend; break;
        case "totalTokens": cmp = a.totalTokens - b.totalTokens; break;
        case "budgetUsedPct": cmp = (a.budgetUsedPct ?? -1) - (b.budgetUsedPct ?? -1); break;
      }
      return teamSortDir === "desc" ? -cmp : cmp;
    });
  }, [data, teamSort, teamSortDir]);

  // Users grouped by team_id for expandable rows
  const usersByTeam = useMemo(() => {
    if (!data) return new Map<string, UserData[]>();
    const map = new Map<string, UserData[]>();
    for (const u of data.users) {
      if (!u.team_id) continue;
      const list = map.get(u.team_id) ?? [];
      list.push(u);
      map.set(u.team_id, list);
    }
    return map;
  }, [data]);

  // Filtered + sorted users
  const userTeams = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.users.map((u) => u.team).filter(Boolean) as string[]);
    return [...set].sort();
  }, [data]);

  const sortedUsers = useMemo(() => {
    if (!data) return [];
    let list = data.users;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    if (userTeamFilter) list = list.filter((u) => u.team === userTeamFilter);

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (userSort) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "team": cmp = (a.team ?? "").localeCompare(b.team ?? ""); break;
        case "total_cost": cmp = a.total_cost - b.total_cost; break;
        case "total_tokens": cmp = a.total_tokens - b.total_tokens; break;
      }
      return userSortDir === "desc" ? -cmp : cmp;
    });
  }, [data, userSort, userSortDir, userSearch, userTeamFilter]);

  const toggleTeamSort = (field: TeamSortField) => {
    if (teamSort === field) setTeamSortDir(teamSortDir === "asc" ? "desc" : "asc");
    else { setTeamSort(field); setTeamSortDir(field === "name" ? "asc" : "desc"); }
  };

  const toggleUserSort = (field: UserSortField) => {
    if (userSort === field) setUserSortDir(userSortDir === "asc" ? "desc" : "asc");
    else { setUserSort(field); setUserSortDir(field === "name" || field === "team" ? "asc" : "desc"); }
  };

  const TeamSortIcon = ({ field }: { field: TeamSortField }) => {
    if (teamSort !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return teamSortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const UserSortIcon = ({ field }: { field: UserSortField }) => {
    if (userSort !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return userSortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  if (error && !data) {
    return (
      <div>
        <Breadcrumb items={[{ label: "Departments", href: "/dashboard/departments" }, { label: "Error" }]} />
        <Card className="p-8 text-center"><p className="text-destructive">{error}</p></Card>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div>
        <Breadcrumb items={[{ label: "Departments", href: "/dashboard/departments" }, { label: "Loading..." }]} />
        <div className="grid grid-cols-3 gap-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      </div>
    );
  }

  const dept = data.department;

  return (
    <div>
      <Breadcrumb items={[{ label: "Departments", href: "/dashboard/departments" }, { label: dept.name }]} />

      <Header
        title={dept.name}
        description={`${data.teams.length} teams · ${data.users.length} users`}
        action={
          <div className="flex items-center gap-2">
            <div className="relative group">
              <Button variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px] hidden group-hover:block z-10">
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                  onClick={() => {
                    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
                    api.exportDepartmentReport(dept.id, month, "csv");
                  }}
                >
                  CSV Report
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                  onClick={() => {
                    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
                    api.exportDepartmentReport(dept.id, month, "pdf");
                  }}
                >
                  PDF Report
                </button>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => {
              setBudgetInput(dept.monthlyBudget?.toString() ?? "");
              setThresholdInput(dept.alertThreshold?.toString() ?? "80");
              setBudgetModal(true);
            }}>
              <Settings2 className="h-3.5 w-3.5" />
              Configure Budget
            </Button>
          </div>
        }
      />

      {/* Budget overview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {dept.monthlyBudget !== null && (
          <Card className="p-5 flex items-center justify-center">
            <BudgetDonut spent={dept.currentSpend} budget={dept.monthlyBudget} size={140} label="Monthly Budget" />
          </Card>
        )}
        <Card className="p-5 col-span-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Current Spend</p>
          <p className="text-2xl font-bold">{formatCurrency(dept.currentSpend)}</p>
          {dept.monthlyBudget !== null && (
            <p className="text-xs text-muted-foreground mt-1">of {formatCurrency(dept.monthlyBudget)} budget</p>
          )}
          {dept.monthlyBudget !== null && (
            <ProgressBar value={dept.currentSpend} max={dept.monthlyBudget} alertThreshold={dept.alertThreshold} size="sm" className="mt-3" />
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Teams</p>
          <p className="text-2xl font-bold">{data.teams.length}</p>
          <div className="flex items-center gap-1 mt-1">
            <Layers className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{data.teams.filter((t) => t.status === "over_budget").length} over budget</span>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Active Users</p>
          <p className="text-2xl font-bold">{data.users.length}</p>
          <div className="flex items-center gap-1 mt-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">in this department</span>
          </div>
        </Card>
      </div>

      {/* Spend trend */}
      {data.dailySpend.length > 0 && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>Spend Trend (This Month)</CardTitle></CardHeader>
            <CardContent>
              <SpendChart data={data.dailySpend.map((d) => ({ ...d, total_tokens: 0 }))} />
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader><CardTitle>Usage Heatmap</CardTitle></CardHeader>
            <CardContent>
              <UsageHeatmap
                data={data.dailySpend.map((d) => ({ date: d.date.split("T")[0], value: d.total_cost }))}
                weeks={13}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Top Models */}
      {data.byModel && data.byModel.length > 0 && (
        <div className="mb-6">
          <TopModelsTable data={data.byModel} title="Top Models (This Month)" />
        </div>
      )}

      {/* Teams — sortable table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Teams ({sortedTeams.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {([
                    ["name", "Team", "left"],
                    ["userCount", "Users", "right"],
                    ["currentSpend", "Spend", "right"],
                    ["totalTokens", "Tokens", "right"],
                    ["budgetUsedPct", "Budget", "left"],
                  ] as [TeamSortField, string, string][]).map(([field, label, align]) => (
                    <th
                      key={field}
                      onClick={() => toggleTeamSort(field)}
                      className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${align === "right" ? "text-right" : "text-left"}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label} <TeamSortIcon field={field} />
                      </span>
                    </th>
                  ))}
                  <th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((t) => {
                  const isExpanded = expandedTeams.has(t.id);
                  const teamUsers = usersByTeam.get(t.id) ?? [];
                  return (
                    <React.Fragment key={t.id}>
                      <tr
                        className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => toggleTeamExpand(t.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground transition-transform duration-200" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                            <Link
                              href={`/dashboard/teams/${t.id}`}
                              className="text-sm font-medium hover:text-brand transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t.name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{t.userCount}</td>
                        <td className="px-5 py-3 text-right text-sm font-medium tabular-nums">{formatCurrency(t.currentSpend)}</td>
                        <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatTokens(t.totalTokens)}</td>
                        <td className="px-5 py-3">
                          {t.monthlyBudget !== null ? (
                            <div className="w-32">
                              <ProgressBar value={t.currentSpend} max={t.monthlyBudget} alertThreshold={t.alertThreshold} size="sm" showLabel />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No budget</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <StatusDot status={t.status as "healthy" | "warning" | "over_budget" | "no_budget"} withLabel />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/30">
                          <td colSpan={6} className="px-0 py-0">
                            <div className="pl-10 pr-5 py-2">
                              {teamUsers.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-3">No users in this team</p>
                              ) : (
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b border-border/50">
                                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">User</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {teamUsers.map((u) => (
                                      <tr key={u.user_id} className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors">
                                        <td className="px-3 py-2">
                                          <Link href={`/dashboard/users/${u.user_id}`} className="flex items-center gap-2 hover:text-brand transition-colors">
                                            <Avatar name={u.name} size="sm" />
                                            <div>
                                              <p className="text-xs font-medium">{u.name}</p>
                                              <p className="text-[10px] text-muted-foreground">{u.email}</p>
                                            </div>
                                          </Link>
                                        </td>
                                        <td className="px-3 py-2 text-right text-xs font-medium tabular-nums">{formatCurrency(u.total_cost)}</td>
                                        <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">{formatTokens(u.total_tokens)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {sortedTeams.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">No teams in this department</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Users — sortable, searchable, filterable */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Users ({sortedUsers.length})</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  className="pl-8 h-8 text-xs w-48"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              {userTeams.length > 1 && (
                <Select
                  value={userTeamFilter}
                  onChange={(e) => setUserTeamFilter(e.target.value)}
                  className="h-8 text-xs"
                  options={[{ value: "", label: "All teams" }, ...userTeams.map((t) => ({ value: t, label: t }))]}
                />
              )}
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
                    ["team", "Team", "left"],
                    ["total_cost", "Spend", "right"],
                    ["total_tokens", "Tokens", "right"],
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
                {sortedUsers.map((u) => (
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
                    <td className="px-5 py-3">
                      {u.team ? (
                        <button
                          onClick={() => setUserTeamFilter(u.team!)}
                          className="text-xs font-medium px-2 py-0.5 rounded-full border border-border hover:bg-brand-subtle hover:border-brand/30 hover:text-brand transition-colors"
                        >
                          {u.team}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-medium tabular-nums">{formatCurrency(u.total_cost)}</td>
                    <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatTokens(u.total_tokens)}</td>
                  </tr>
                ))}
                {sortedUsers.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {userSearch || userTeamFilter ? "No users match filters" : "No users in this department"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Budget Modal */}
      <Modal open={budgetModal} onClose={() => setBudgetModal(false)} title="Configure Department Budget">
        <div className="space-y-4">
          <Input
            label="Monthly Budget ($)"
            type="number"
            min={0}
            step={100}
            placeholder="e.g. 5000"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
          />
          <Input
            label="Alert Threshold (%)"
            type="number"
            min={1}
            max={200}
            placeholder="80"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            You&apos;ll see a warning when spend reaches this percentage of the budget.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setBudgetModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveBudget} disabled={saving}>{saving ? "Saving..." : "Save Budget"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
