"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusDot } from "@/components/ui/status-dot";
import { Avatar } from "@/components/ui/avatar";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, PROVIDER_LABELS } from "@/lib/utils";
import { getTeamIcon } from "@/lib/entity-icons";
import {
  UsersRound, Users, Search, LayoutGrid, List,
  ChevronUp, ChevronDown, ChevronRight, ArrowUpDown, X, Filter,
  Loader2,
} from "lucide-react";

interface TeamData {
  id: string;
  name: string;
  department: { id: string; name: string };
  monthlyBudget: number | null;
  alertThreshold: number;
  userCount: number;
  currentSpend: number;
  totalTokens: number;
  budgetUsedPct: number | null;
  status: "healthy" | "caution" | "warning" | "over_budget" | "no_budget";
}

type SortField = "name" | "department" | "currentSpend" | "totalTokens" | "userCount" | "budgetUsedPct";
type SortDir = "asc" | "desc";
type ViewMode = "grid" | "table";
type StatusFilter = "" | "healthy" | "caution" | "warning" | "over_budget" | "no_budget";

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sortField, setSortField] = useState<SortField>("currentSpend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<ViewMode>("grid");

  // Expand/collapse for table view
  interface TeamUserData {
    user_id: string; name: string; email: string; job_title: string | null;
    total_cost: number; total_tokens: number;
  }
  interface TeamModelData {
    model: string; provider: string; total_cost: number; total_tokens: number; total_requests: number;
  }
  interface TeamExpandData {
    users: TeamUserData[];
    byModel: TeamModelData[];
  }
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [teamDetailCache, setTeamDetailCache] = useState<Map<string, TeamExpandData>>(new Map());
  const [loadingTeamUsers, setLoadingTeamUsers] = useState<Set<string>>(new Set());

  const toggleTeamExpand = useCallback(async (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) { next.delete(teamId); return next; }
      next.add(teamId);
      return next;
    });

    if (!teamDetailCache.has(teamId)) {
      setLoadingTeamUsers((prev) => new Set(prev).add(teamId));
      try {
        const data = await api.getTeam(teamId);
        setTeamDetailCache((prev) => new Map(prev).set(teamId, {
          users: data.users ?? [],
          byModel: data.byModel ?? [],
        }));
      } catch {
        setTeamDetailCache((prev) => new Map(prev).set(teamId, { users: [], byModel: [] }));
      } finally {
        setLoadingTeamUsers((prev) => { const n = new Set(prev); n.delete(teamId); return n; });
      }
    }
  }, [teamDetailCache]);

  useEffect(() => {
    api.getTeams()
      .then((d) => setTeams(d.teams ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const departments = useMemo(() => {
    const set = new Set(teams.map((t) => t.department.name));
    return [...set].sort();
  }, [teams]);

  const filtered = useMemo(() => {
    return teams.filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.department.name.toLowerCase().includes(q)) return false;
      }
      if (deptFilter && t.department.name !== deptFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    });
  }, [teams, search, deptFilter, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "department": cmp = a.department.name.localeCompare(b.department.name); break;
        case "currentSpend": cmp = a.currentSpend - b.currentSpend; break;
        case "totalTokens": cmp = a.totalTokens - b.totalTokens; break;
        case "userCount": cmp = a.userCount - b.userCount; break;
        case "budgetUsedPct": cmp = (a.budgetUsedPct ?? -1) - (b.budgetUsedPct ?? -1); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "name" || field === "department" ? "asc" : "desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const hasFilters = search || deptFilter || statusFilter;
  const clearFilters = () => { setSearch(""); setDeptFilter(""); setStatusFilter(""); };

  const totalSpend = filtered.reduce((s, t) => s + t.currentSpend, 0);
  const totalUsers = filtered.reduce((s, t) => s + t.userCount, 0);
  const overBudgetCount = filtered.filter((t) => t.status === "over_budget").length;

  if (error) {
    return (
      <div>
        <Header title="Teams" />
        <Card className="p-8 text-center"><p className="text-destructive">{error}</p></Card>
      </div>
    );
  }

  return (
    <div>
      <Header title="Teams" description={`${teams.length} teams across ${departments.length} departments`} />

      {/* Toolbar */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]}
          />

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            options={[
              { value: "", label: "All statuses" },
              { value: "healthy", label: "On Track" },
              { value: "caution", label: "Halfway Through" },
              { value: "warning", label: "Approaching Limit" },
              { value: "over_budget", label: "Over Budget" },
              { value: "no_budget", label: "No Budget Set" },
            ]}
          />

          <Select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            options={[
              { value: "currentSpend", label: "Sort by Spend" },
              { value: "totalTokens", label: "Sort by Tokens" },
              { value: "userCount", label: "Sort by Users" },
              { value: "budgetUsedPct", label: "Sort by Budget %" },
              { value: "department", label: "Sort by Department" },
              { value: "name", label: "Sort by Name" },
            ]}
          />

          <button
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            title={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            {sortDir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          <div className="flex border border-border rounded-lg overflow-hidden ml-auto">
            <button
              onClick={() => setView("grid")}
              className={`h-9 w-9 flex items-center justify-center transition-colors ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("table")}
              className={`h-9 w-9 flex items-center justify-center transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {hasFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {filtered.length} of {teams.length} teams
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium">{formatCurrency(totalSpend)} total spend</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium">{totalUsers} users</span>
            {overBudgetCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <Badge variant="critical">{overBudgetCount} over budget</Badge>
              </>
            )}
            {deptFilter && (
              <Badge variant="info" className="gap-1">
                Dept: {deptFilter}
                <button onClick={() => setDeptFilter("")}><X className="h-3 w-3" /></button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {loading ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <SkeletonTable rows={6} />
        )
      ) : sorted.length === 0 ? (
        <Card className="p-12 text-center">
          <UsersRound className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {hasFilters ? "No teams match the current filters" : "No teams yet. Sync your user directory to create teams automatically."}
          </p>
        </Card>
      ) : view === "grid" ? (
        /* ─── Grid View ─── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((team) => {
            const ti = getTeamIcon(team.name);
            return (
            <Link key={team.id} href={`/dashboard/teams/${team.id}`}>
              <Card hoverable className="p-5 h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${ti.bgClass}`}>
                      <ti.icon className={`h-4.5 w-4.5 ${ti.colorClass}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{team.name}</h3>
                      <p className="text-[11px] text-muted-foreground">{team.department.name}</p>
                    </div>
                  </div>
                  <StatusDot status={team.status} />
                </div>

                {team.monthlyBudget !== null && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        {formatCurrency(team.currentSpend)} / {formatCurrency(team.monthlyBudget)}
                      </span>
                    </div>
                    <ProgressBar value={team.currentSpend} max={team.monthlyBudget} alertThreshold={team.alertThreshold} size="sm" showLabel={false} />
                  </div>
                )}

                <div className="flex items-center gap-4 pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{team.userCount} users</span>
                  </div>
                  <span className="text-xs font-medium">{formatCurrency(team.currentSpend)}</span>
                  <span className="text-xs text-muted-foreground">{formatTokens(team.totalTokens)} tokens</span>
                </div>
              </Card>
            </Link>
          );
          })}
        </div>
      ) : (
        /* ─── Table View ─── */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {([
                      ["name", "Team", "left"],
                      ["department", "Department", "left"],
                      ["userCount", "Users", "right"],
                      ["currentSpend", "Spend", "right"],
                      ["totalTokens", "Tokens", "right"],
                      ["budgetUsedPct", "Budget", "left"],
                    ] as [SortField, string, string][]).map(([field, label, align]) => (
                      <th
                        key={field}
                        onClick={() => toggleSort(field)}
                        className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${align === "right" ? "text-right" : "text-left"}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {label} <SortIcon field={field} />
                        </span>
                      </th>
                    ))}
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((team) => {
                    const maxSpend = Math.max(...sorted.map((t) => t.currentSpend), 1);
                    const barPct = (team.currentSpend / maxSpend) * 100;
                    const isExpanded = expandedTeams.has(team.id);
                    const isLoadingUsers = loadingTeamUsers.has(team.id);
                    const cached = teamDetailCache.get(team.id);
                    const cachedUsers = cached?.users;
                    const cachedModels = cached?.byModel;
                    const ti = getTeamIcon(team.name);
                    return (
                      <React.Fragment key={team.id}>
                        <tr
                          className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => toggleTeamExpand(team.id)}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground transition-transform duration-200" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </span>
                              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${ti.bgClass}`}>
                                <ti.icon className={`h-4 w-4 ${ti.colorClass}`} />
                              </div>
                              <Link
                                href={`/dashboard/teams/${team.id}`}
                                className="text-sm font-medium hover:text-brand transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {team.name}
                              </Link>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeptFilter(team.department.name); }}
                              className="text-xs font-medium px-2 py-0.5 rounded-full border border-border hover:bg-brand-subtle hover:border-brand/30 hover:text-brand transition-colors"
                            >
                              {team.department.name}
                            </button>
                          </td>
                          <td className="px-5 py-3 text-right text-sm tabular-nums">{team.userCount}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden lg:block">
                                <div className="h-full rounded-full bg-teal-500" style={{ width: `${barPct}%` }} />
                              </div>
                              <span className="text-sm font-medium tabular-nums">{formatCurrency(team.currentSpend)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatTokens(team.totalTokens)}</td>
                          <td className="px-5 py-3">
                            {team.monthlyBudget !== null ? (
                              <div className="w-32">
                                <ProgressBar value={team.currentSpend} max={team.monthlyBudget} alertThreshold={team.alertThreshold} size="sm" showLabel />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No budget</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <StatusDot status={team.status} withLabel />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/30">
                            <td colSpan={7} className="px-0 py-0">
                              <div className="pl-14 pr-5 py-2">
                                {isLoadingUsers ? (
                                  <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {/* Users */}
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Users</p>
                                      {!cachedUsers || cachedUsers.length === 0 ? (
                                        <p className="text-xs text-muted-foreground py-2">No users</p>
                                      ) : (
                                        <table className="w-full">
                                          <thead>
                                            <tr className="border-b border-border/50">
                                              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">User</th>
                                              <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
                                              <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {cachedUsers.map((u) => (
                                              <tr key={u.user_id} className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors">
                                                <td className="px-3 py-1.5">
                                                  <Link href={`/dashboard/users/${u.user_id}`} className="flex items-center gap-2 hover:text-brand transition-colors">
                                                    <Avatar name={u.name} size="sm" />
                                                    <div>
                                                      <p className="text-xs font-medium">{u.name}</p>
                                                      <p className="text-[10px] text-muted-foreground">{u.email}</p>
                                                    </div>
                                                  </Link>
                                                </td>
                                                <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(u.total_cost)}</td>
                                                <td className="px-3 py-1.5 text-right text-xs text-muted-foreground tabular-nums">{formatTokens(u.total_tokens)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                    {/* Models */}
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Models</p>
                                      {!cachedModels || cachedModels.length === 0 ? (
                                        <p className="text-xs text-muted-foreground py-2">No model data</p>
                                      ) : (
                                        <table className="w-full">
                                          <thead>
                                            <tr className="border-b border-border/50">
                                              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
                                              <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
                                              <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {cachedModels.slice(0, 5).map((m, mi) => (
                                              <tr key={`${m.provider}-${m.model}-${mi}`} className="border-b border-border/30 last:border-0">
                                                <td className="px-3 py-1.5">
                                                  <span className="text-xs font-medium">{m.model}</span>
                                                  <span className="text-[10px] text-muted-foreground ml-1">{PROVIDER_LABELS[m.provider] ?? m.provider}</span>
                                                </td>
                                                <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(m.total_cost)}</td>
                                                <td className="px-3 py-1.5 text-right text-xs text-muted-foreground tabular-nums">{m.total_requests}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
