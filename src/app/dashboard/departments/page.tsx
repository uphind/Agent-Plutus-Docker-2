"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusDot } from "@/components/ui/status-dot";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, formatNumber } from "@/lib/utils";
import { useTerminology } from "@/lib/terminology";
import { getDepartmentIcon } from "@/lib/entity-icons";
import {
  Building2, Users, Layers, Search, LayoutGrid, List,
  ChevronUp, ChevronDown, ArrowUpDown, X, Filter,
} from "lucide-react";

interface DeptData {
  id: string;
  name: string;
  monthlyBudget: number | null;
  alertThreshold: number;
  teamCount: number;
  userCount: number;
  currentSpend: number;
  totalTokens: number;
  totalRequests: number;
  budgetUsedPct: number | null;
  status: "healthy" | "caution" | "warning" | "over_budget" | "no_budget";
}

type SortField = "name" | "currentSpend" | "totalTokens" | "userCount" | "teamCount" | "budgetUsedPct";
type SortDir = "asc" | "desc";
type ViewMode = "grid" | "table";
type StatusFilter = "" | "healthy" | "caution" | "warning" | "over_budget" | "no_budget";

export default function DepartmentsPage() {
  const { t } = useTerminology();
  const [departments, setDepartments] = useState<DeptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sortField, setSortField] = useState<SortField>("currentSpend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    api.getDepartments()
      .then((d) => setDepartments(d.departments ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return departments.filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        if (!d.name.toLowerCase().includes(q)) return false;
      }
      if (statusFilter && d.status !== statusFilter) return false;
      return true;
    });
  }, [departments, search, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "currentSpend": cmp = a.currentSpend - b.currentSpend; break;
        case "totalTokens": cmp = a.totalTokens - b.totalTokens; break;
        case "userCount": cmp = a.userCount - b.userCount; break;
        case "teamCount": cmp = a.teamCount - b.teamCount; break;
        case "budgetUsedPct": cmp = (a.budgetUsedPct ?? -1) - (b.budgetUsedPct ?? -1); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "name" ? "asc" : "desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const hasFilters = search || statusFilter;
  const clearFilters = () => { setSearch(""); setStatusFilter(""); };

  const totalSpend = filtered.reduce((s, d) => s + d.currentSpend, 0);
  const totalUsers = filtered.reduce((s, d) => s + d.userCount, 0);
  const overBudgetCount = filtered.filter((d) => d.status === "over_budget").length;

  if (error) {
    return (
      <div>
        <Header title={t("departments")} />
        <Card className="p-8 text-center"><p className="text-destructive">{error}</p></Card>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={t("departments")}
        description={`${departments.length} ${t("departments").toLowerCase()} · ${totalUsers} ${t("users").toLowerCase()}`}
      />

      {/* Toolbar */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search departments..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

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
            onChange={(e) => { setSortField(e.target.value as SortField); }}
            options={[
              { value: "currentSpend", label: "Sort by Spend" },
              { value: "totalTokens", label: "Sort by Tokens" },
              { value: "userCount", label: "Sort by Users" },
              { value: "teamCount", label: "Sort by Teams" },
              { value: "budgetUsedPct", label: "Sort by Budget %" },
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
              {filtered.length} of {departments.length} departments
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium">{formatCurrency(totalSpend)} total spend</span>
            {overBudgetCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <Badge variant="critical">{overBudgetCount} over budget</Badge>
              </>
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
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {hasFilters ? "No departments match the current filters" : "No departments yet. Sync your user directory to create departments automatically."}
          </p>
        </Card>
      ) : view === "grid" ? (
        /* ─── Grid View ─── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((dept) => {
            const di = getDepartmentIcon(dept.name);
            return (
            <Link key={dept.id} href={`/dashboard/departments/${dept.id}`}>
              <Card hoverable className="p-5 h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${di.bgClass}`}>
                      <di.icon className={`h-4.5 w-4.5 ${di.colorClass}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{dept.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusDot status={dept.status} />
                        <span className="text-[11px] text-muted-foreground">
                          {dept.status === "over_budget" ? "Over budget" : dept.status === "warning" ? "Approaching limit" : dept.status === "caution" ? "Halfway through" : dept.status === "no_budget" ? "No budget set" : "On track"}
                        </span>
                      </div>
                    </div>
                  </div>
                  {dept.status === "over_budget" && <Badge variant="critical">Over Budget</Badge>}
                  {dept.status === "warning" && <Badge variant="warning">Warning</Badge>}
                </div>

                {dept.monthlyBudget !== null && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        {formatCurrency(dept.currentSpend)} of {formatCurrency(dept.monthlyBudget)}
                      </span>
                    </div>
                    <ProgressBar value={dept.currentSpend} max={dept.monthlyBudget} alertThreshold={dept.alertThreshold} size="sm" showLabel={false} />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Layers className="h-3 w-3" />
                      <span className="text-[10px] uppercase tracking-wider">Teams</span>
                    </div>
                    <p className="text-sm font-semibold">{dept.teamCount}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Users className="h-3 w-3" />
                      <span className="text-[10px] uppercase tracking-wider">Users</span>
                    </div>
                    <p className="text-sm font-semibold">{dept.userCount}</p>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Spend</span>
                    <p className="text-sm font-semibold">{formatCurrency(dept.currentSpend)}</p>
                  </div>
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
                      ["name", "Department", "left"],
                      ["teamCount", "Teams", "right"],
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
                  {sorted.map((dept) => {
                    const maxSpend = Math.max(...sorted.map((d) => d.currentSpend), 1);
                    const barPct = (dept.currentSpend / maxSpend) * 100;
                    const di = getDepartmentIcon(dept.name);
                    return (
                      <tr key={dept.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3">
                          <Link href={`/dashboard/departments/${dept.id}`} className="flex items-center gap-3 hover:text-brand transition-colors">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${di.bgClass}`}>
                              <di.icon className={`h-4 w-4 ${di.colorClass}`} />
                            </div>
                            <span className="text-sm font-medium">{dept.name}</span>
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums">{dept.teamCount}</td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums">{dept.userCount}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden lg:block">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${barPct}%` }} />
                            </div>
                            <span className="text-sm font-medium tabular-nums">{formatCurrency(dept.currentSpend)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatTokens(dept.totalTokens)}</td>
                        <td className="px-5 py-3">
                          {dept.monthlyBudget !== null ? (
                            <div className="w-32">
                              <ProgressBar value={dept.currentSpend} max={dept.monthlyBudget} alertThreshold={dept.alertThreshold} size="sm" showLabel />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No budget</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <StatusDot status={dept.status} withLabel />
                        </td>
                      </tr>
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
