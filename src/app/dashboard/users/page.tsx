"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, formatNumber } from "@/lib/utils";
import { useTerminology } from "@/lib/terminology";
import {
  Search, AlertTriangle, ChevronUp, ChevronDown,
  X, ArrowUpDown, Filter,
} from "lucide-react";

interface UserRow {
  user_id: string; name: string; email: string;
  department: string | null; team: string | null;
  total_cost: number; total_tokens: number; total_requests: number;
}

type SortField = "name" | "email" | "department" | "team" | "total_cost" | "total_tokens" | "total_requests";
type SortDir = "asc" | "desc";

export default function UsersPage() {
  const { t } = useTerminology();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [usageFilter, setUsageFilter] = useState<"all" | "active" | "inactive" | "high" | "low">("all");
  const [sortField, setSortField] = useState<SortField>("total_cost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const perPage = 20;

  useEffect(() => {
    setLoading(true);
    api.getByUser(days)
      .then((d) => setUsers(d.users ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  // Derive filter options from data
  const departments = useMemo(() => {
    const set = new Set(users.map((u) => u.department).filter(Boolean) as string[]);
    return [...set].sort();
  }, [users]);

  const teams = useMemo(() => {
    let source = users;
    if (deptFilter) source = source.filter((u) => u.department === deptFilter);
    const set = new Set(source.map((u) => u.team).filter(Boolean) as string[]);
    return [...set].sort();
  }, [users, deptFilter]);

  // Compute stats for usage-based filtering
  const avgCost = useMemo(() => {
    const active = users.filter((u) => u.total_cost > 0);
    return active.length > 0 ? active.reduce((s, u) => s + u.total_cost, 0) / active.length : 0;
  }, [users]);

  // Apply all filters
  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        const match = u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.department ?? "").toLowerCase().includes(q) ||
          (u.team ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (deptFilter && u.department !== deptFilter) return false;
      if (teamFilter && u.team !== teamFilter) return false;
      if (usageFilter === "active" && u.total_cost <= 0) return false;
      if (usageFilter === "inactive" && u.total_cost > 0) return false;
      if (usageFilter === "high" && (avgCost <= 0 || u.total_cost <= avgCost * 2)) return false;
      if (usageFilter === "low" && (u.total_cost <= 0 || u.total_cost >= avgCost * 0.5)) return false;
      return true;
    });
  }, [users, search, deptFilter, teamFilter, usageFilter, avgCost]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "email": cmp = a.email.localeCompare(b.email); break;
        case "department": cmp = (a.department ?? "").localeCompare(b.department ?? ""); break;
        case "team": cmp = (a.team ?? "").localeCompare(b.team ?? ""); break;
        case "total_cost": cmp = a.total_cost - b.total_cost; break;
        case "total_tokens": cmp = a.total_tokens - b.total_tokens; break;
        case "total_requests": cmp = a.total_requests - b.total_requests; break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.ceil(sorted.length / perPage);
  const paginated = sorted.slice(page * perPage, (page + 1) * perPage);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "name" || field === "email" || field === "department" || field === "team" ? "asc" : "desc"); }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const hasActiveFilters = deptFilter || teamFilter || usageFilter !== "all" || search;

  const clearFilters = () => {
    setSearch("");
    setDeptFilter("");
    setTeamFilter("");
    setUsageFilter("all");
    setPage(0);
  };

  if (error) {
    return (
      <div>
        <Header title={t("users")} />
        <Card className="p-8 text-center"><p className="text-destructive">{error}</p></Card>
      </div>
    );
  }

  // Summary stats for filtered results
  const totalSpend = filtered.reduce((s, u) => s + u.total_cost, 0);
  const totalTokens = filtered.reduce((s, u) => s + u.total_tokens, 0);
  const activeCount = filtered.filter((u) => u.total_cost > 0).length;
  const anomalyCount = filtered.filter((u) => avgCost > 0 && u.total_cost > avgCost * 2).length;

  return (
    <div>
      <Header
        title={t("users")}
        description={`${users.length} total ${t("users").toLowerCase()} · ${activeCount} active`}
        action={
          <Select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            options={[
              { value: "7", label: "Last 7 days" },
              { value: "14", label: "Last 14 days" },
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
            ]}
          />
        }
      />

      {/* Filter bar */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>

          {/* Department filter */}
          <Select
            value={deptFilter}
            onChange={(e) => { setDeptFilter(e.target.value); setTeamFilter(""); setPage(0); }}
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]}
          />

          {/* Team filter */}
          <Select
            value={teamFilter}
            onChange={(e) => { setTeamFilter(e.target.value); setPage(0); }}
            options={[{ value: "", label: "All teams" }, ...teams.map((t) => ({ value: t, label: t }))]}
          />

          {/* Usage filter */}
          <Select
            value={usageFilter}
            onChange={(e) => { setUsageFilter(e.target.value as typeof usageFilter); setPage(0); }}
            options={[
              { value: "all", label: "All usage levels" },
              { value: "active", label: "Active users (has usage)" },
              { value: "inactive", label: "Inactive (no usage)" },
              { value: "high", label: "High spenders (>2x avg)" },
              { value: "low", label: "Low usage (<50% avg)" },
            ]}
          />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Active filter tags + summary */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Showing {filtered.length} of {users.length} users
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium">{formatCurrency(totalSpend)} total spend</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium">{formatTokens(totalTokens)} tokens</span>
            {anomalyCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <Badge variant="warning">{anomalyCount} high spenders</Badge>
              </>
            )}

            {deptFilter && (
              <Badge variant="info" className="gap-1">
                Dept: {deptFilter}
                <button onClick={() => { setDeptFilter(""); setTeamFilter(""); setPage(0); }}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {teamFilter && (
              <Badge variant="info" className="gap-1">
                Team: {teamFilter}
                <button onClick={() => { setTeamFilter(""); setPage(0); }}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {usageFilter !== "all" && (
              <Badge variant="info" className="gap-1">
                {usageFilter === "active" ? "Active only" : usageFilter === "inactive" ? "Inactive only" : usageFilter === "high" ? "High spenders" : "Low usage"}
                <button onClick={() => { setUsageFilter("all"); setPage(0); }}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={10} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {([
                      ["name", "User", "left"],
                      ["department", "Department", "left"],
                      ["team", "Team", "left"],
                      ["total_cost", "Spend", "right"],
                      ["total_tokens", "Tokens", "right"],
                      ["total_requests", "Requests", "right"],
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
                    <th className="px-5 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((user) => {
                    const isAnomaly = avgCost > 0 && user.total_cost > avgCost * 2;
                    const isInactive = user.total_cost <= 0 && user.total_tokens <= 0;

                    const maxCost = Math.max(...sorted.map((u) => u.total_cost), 1);
                    const barPct = maxCost > 0 ? (user.total_cost / maxCost) * 100 : 0;
                    const maxTokens = Math.max(...sorted.map((u) => u.total_tokens), 1);
                    const tokenBarPct = maxTokens > 0 ? (user.total_tokens / maxTokens) * 100 : 0;

                    return (
                      <tr
                        key={user.user_id}
                        className={`border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${isInactive ? "opacity-50" : ""}`}
                      >
                        <td className="px-5 py-3">
                          <Link href={`/dashboard/users/${user.user_id}`} className="flex items-center gap-3 hover:text-brand transition-colors">
                            <Avatar name={user.name} size="sm" />
                            <div>
                              <p className="text-sm font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          {user.department ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeptFilter(user.department!); setPage(0); }}
                              className="text-xs font-medium px-2 py-0.5 rounded-full border border-border hover:bg-brand-subtle hover:border-brand/30 hover:text-brand transition-colors"
                            >
                              {user.department}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {user.team ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); if (user.department) setDeptFilter(user.department); setTeamFilter(user.team!); setPage(0); }}
                              className="text-xs text-muted-foreground hover:text-brand transition-colors"
                            >
                              {user.team}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden lg:block">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${barPct}%` }} />
                            </div>
                            <span className="text-sm font-medium tabular-nums">{formatCurrency(user.total_cost)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden lg:block">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${tokenBarPct}%` }} />
                            </div>
                            <span className="text-sm text-muted-foreground tabular-nums">{formatTokens(user.total_tokens)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">
                          {formatNumber(user.total_requests)}
                        </td>
                        <td className="px-5 py-3">
                          {isAnomaly && (
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span className="text-[11px] text-amber-600 font-medium whitespace-nowrap">
                                {(user.total_cost / avgCost).toFixed(1)}x avg
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {paginated.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      {hasActiveFilters ? "No users match the current filters" : "No users found"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {page * perPage + 1}–{Math.min((page + 1) * perPage, sorted.length)} of {sorted.length}
                {filtered.length < users.length && ` (filtered from ${users.length})`}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="h-7 px-2 rounded text-xs font-medium transition-colors hover:bg-muted text-muted-foreground disabled:opacity-30"
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i;
                  } else if (page < 3) {
                    pageNum = i;
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 7 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`h-7 w-7 rounded text-xs font-medium transition-colors ${page === pageNum ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="h-7 px-2 rounded text-xs font-medium transition-colors hover:bg-muted text-muted-foreground disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
