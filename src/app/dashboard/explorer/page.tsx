"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import Link from "next/link";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, formatNumber, PROVIDER_LABELS, PROVIDER_COLORS } from "@/lib/utils";
import {
  Search, ArrowUpDown, ChevronRight, ChevronDown, ChevronUp,
  DollarSign, Layers, Hash, Zap, X, SlidersHorizontal,
  Building2, UsersRound, User, Boxes, Plug,
  ArrowDownRight, ArrowUpRight, Minus,
} from "lucide-react";

interface ExplorerRow {
  dimensions: Record<string, string | null>;
  metrics: { cost: number; tokens: number; requests: number; inputTokens: number; outputTokens: number; cachedTokens: number };
}

interface ExplorerData {
  rows: ExplorerRow[];
  comparison?: Array<{ dimensions: Record<string, string | null>; metrics: { cost: number; tokens: number; requests: number } }>;
  dimensions: string[];
}

const DIMENSION_OPTIONS = [
  { id: "provider", label: "Provider", icon: Plug, description: "Group by AI provider" },
  { id: "model", label: "Model", icon: Boxes, description: "Group by model name" },
  { id: "department", label: "Department", icon: Building2, description: "Group by department" },
  { id: "team", label: "Team", icon: UsersRound, description: "Group by team" },
  { id: "user", label: "User", icon: User, description: "Group by individual user" },
];

const PERIOD_PRESETS = [
  { label: "7 days", short: "7d", days: 7 },
  { label: "14 days", short: "14d", days: 14 },
  { label: "30 days", short: "30d", days: 30 },
  { label: "90 days", short: "90d", days: 90 },
];

export default function ExplorerPage() {
  const [dimensions, setDimensions] = useState<string[]>(["provider"]);
  const [periodDays, setPeriodDays] = useState(30);
  const [compare, setCompare] = useState(false);
  const [data, setData] = useState<ExplorerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"cost" | "tokens" | "requests">("cost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const params: Record<string, string> = {
      groupBy: dimensions.join(","),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    if (compare) {
      const compEnd = new Date(startDate);
      const compStart = new Date(startDate);
      compStart.setDate(compStart.getDate() - periodDays);
      params.compareStartDate = compStart.toISOString();
      params.compareEndDate = compEnd.toISOString();
    }

    try {
      const result = await api.getExplorer(params);
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [dimensions, periodDays, compare]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleDimension = (dim: string) => {
    setDimensions((prev) =>
      prev.includes(dim) ? (prev.length > 1 ? prev.filter((d) => d !== dim) : prev) : [...prev, dim]
    );
  };

  const handleSort = (col: "cost" | "tokens" | "requests") => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  };

  const SortIndicator = ({ field }: { field: "cost" | "tokens" | "requests" }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const compMap = useMemo(() => {
    const m = new Map<string, number>();
    if (data?.comparison) {
      for (const c of data.comparison) {
        m.set(Object.values(c.dimensions).join("|"), c.metrics.cost);
      }
    }
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    let rows = [...(data?.rows ?? [])];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row.dimensions).some((v) => v?.toLowerCase().includes(q))
      );
    }

    rows.sort((a, b) => {
      const mul = sortDir === "desc" ? -1 : 1;
      return (a.metrics[sortBy] - b.metrics[sortBy]) * mul;
    });

    return rows;
  }, [data, searchQuery, sortBy, sortDir]);

  const totalCost = filtered.reduce((s, r) => s + r.metrics.cost, 0);
  const totalTokens = filtered.reduce((s, r) => s + r.metrics.tokens, 0);
  const totalRequests = filtered.reduce((s, r) => s + r.metrics.requests, 0);
  const topItems = filtered.slice(0, 8);
  const maxCost = topItems.length > 0 ? Math.max(...topItems.map((r) => r.metrics.cost), 1) : 1;
  const tableMaxCost = filtered.length > 0 ? Math.max(...filtered.map((r) => r.metrics.cost), 1) : 1;

  const activeDimLabels = dimensions.map(
    (d) => DIMENSION_OPTIONS.find((o) => o.id === d)?.label ?? d
  );

  return (
    <div className="space-y-5">
      <Header
        title="Cost Explorer"
        description="Analyze AI spend across any dimension"
      />

      {/* ══════════ Toolbar ══════════ */}
      <div className="flex flex-col gap-3">
        {/* Top row: search + period + actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search across ${activeDimLabels.join(", ").toLowerCase()}...`}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Period pills */}
          <div className="flex items-center bg-muted/60 rounded-xl p-0.5">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => setPeriodDays(p.days)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all ${
                  periodDays === p.days
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.short}
              </button>
            ))}
          </div>

          {/* Compare toggle */}
          <button
            onClick={() => setCompare(!compare)}
            className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 ${
              compare
                ? "bg-brand/10 border-brand/30 text-brand"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <ArrowUpDown className="h-3 w-3" />
            Compare
          </button>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 ${
              showFilters
                ? "bg-brand/10 border-brand/30 text-brand"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Dimensions
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-0.5">{dimensions.length}</Badge>
          </button>
        </div>

        {/* Active dimension chips (always visible) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grouped by</span>
          {dimensions.map((dim) => {
            const opt = DIMENSION_OPTIONS.find((o) => o.id === dim);
            const Icon = opt?.icon ?? Layers;
            return (
              <span
                key={dim}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-brand/8 border border-brand/15 text-xs font-medium text-brand"
              >
                <Icon className="h-3 w-3" />
                {opt?.label ?? dim}
                {dimensions.length > 1 && (
                  <button
                    onClick={() => toggleDimension(dim)}
                    className="ml-0.5 p-0.5 rounded hover:bg-brand/10"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>

        {/* Expanded dimension picker */}
        {showFilters && (
          <Card className="border-brand/20">
            <CardContent className="p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {DIMENSION_OPTIONS.map((opt) => {
                  const active = dimensions.includes(opt.id);
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleDimension(opt.id)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                        active
                          ? "bg-brand/8 border-brand/25 shadow-sm"
                          : "border-border hover:border-brand/15 hover:bg-muted/50"
                      }`}
                    >
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        active ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${active ? "text-brand" : "text-foreground"}`}>{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{opt.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ══════════ KPI Summary ══════════ */}
      {!loading && data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Spend" value={formatCurrency(totalCost)} subtitle={`Last ${periodDays} days`} icon={DollarSign} />
          <StatCard title="Groups" value={String(filtered.length)} subtitle={`of ${data.rows.length} total`} icon={Layers} />
          <StatCard title="Tokens" value={formatTokens(totalTokens)} icon={Zap} />
          <StatCard title="Requests" value={formatNumber(totalRequests)} icon={Hash} />
        </div>
      )}

      {/* ══════════ Visual breakdown (horizontal bar chart) ══════════ */}
      {!loading && topItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Top by Spend</CardTitle>
              <span className="text-xs text-muted-foreground">
                Top {topItems.length} of {filtered.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 pb-5">
            {topItems.map((row, i) => {
              const label = Object.values(row.dimensions).filter(Boolean).join(" → ") || "Unknown";
              const pct = maxCost > 0 ? (row.metrics.cost / maxCost) * 100 : 0;
              const shareOfTotal = totalCost > 0 ? (row.metrics.cost / totalCost) * 100 : 0;

              const dimKey = Object.values(row.dimensions).join("|");
              const prevCost = compMap.get(dimKey);
              const changePct = prevCost && prevCost > 0
                ? ((row.metrics.cost - prevCost) / prevCost) * 100
                : undefined;

              return (
                <div key={i} className="group">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium truncate">{label}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{shareOfTotal.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {compare && changePct != null && (
                            <span className={`text-[10px] font-medium flex items-center gap-0.5 ${
                              changePct > 0 ? "text-red-500" : changePct < 0 ? "text-green-600" : "text-muted-foreground"
                            }`}>
                              {changePct > 0 ? <ArrowUpRight className="h-3 w-3" /> : changePct < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                              {Math.abs(changePct).toFixed(1)}%
                            </span>
                          )}
                          <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.metrics.cost)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: dimensions[0] === "provider"
                              ? (PROVIDER_COLORS[row.dimensions.provider ?? ""] ?? "var(--brand)")
                              : "var(--brand)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ══════════ Data table ══════════ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Detailed Breakdown</CardTitle>
            <div className="flex items-center gap-2">
              {searchQuery && (
                <Badge variant="outline" className="text-[10px]">
                  Filtered: {filtered.length} of {data?.rows.length ?? 0}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{filtered.length} rows</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <div className="h-8 w-8 mx-auto mb-3 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
              <p className="text-sm text-muted-foreground">Crunching the numbers...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-8">#</th>
                    {dimensions.map((dim) => (
                      <th key={dim} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {DIMENSION_OPTIONS.find((o) => o.id === dim)?.label ?? dim}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-24">Share</th>
                    <th
                      className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("cost")}
                    >
                      <span className="inline-flex items-center gap-1">Cost <SortIndicator field="cost" /></span>
                    </th>
                    {compare && (
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Change</th>
                    )}
                    <th
                      className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("tokens")}
                    >
                      <span className="inline-flex items-center gap-1">Tokens <SortIndicator field="tokens" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("requests")}
                    >
                      <span className="inline-flex items-center gap-1">Requests <SortIndicator field="requests" /></span>
                    </th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const dimKey = Object.values(row.dimensions).join("|");
                    const prevCost = compMap.get(dimKey);
                    const changePct = prevCost && prevCost > 0
                      ? ((row.metrics.cost - prevCost) / prevCost) * 100
                      : undefined;
                    const sharePct = totalCost > 0 ? (row.metrics.cost / totalCost) * 100 : 0;
                    const barPct = tableMaxCost > 0 ? (row.metrics.cost / tableMaxCost) * 100 : 0;

                    const userId = (row.dimensions as Record<string, string>).userId;
                    const drillLink = row.dimensions.user && userId
                      ? `/dashboard/users/${userId}`
                      : row.dimensions.department
                        ? "/dashboard/departments"
                        : row.dimensions.team
                          ? "/dashboard/teams"
                          : undefined;

                    return (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors group">
                        <td className="px-4 py-3 text-[10px] text-muted-foreground tabular-nums">{i + 1}</td>
                        {dimensions.map((dim) => {
                          const val = String(row.dimensions[dim] ?? "—");
                          return (
                            <td key={dim} className="px-4 py-3 text-sm">
                              {dim === "provider" ? (
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: PROVIDER_COLORS[val] ?? "#6b7280" }}
                                  />
                                  <span className="font-medium">{PROVIDER_LABELS[val] ?? val}</span>
                                </div>
                              ) : dim === "model" ? (
                                <span className="font-mono text-xs">{val}</span>
                              ) : (
                                <span className="font-medium">{val}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[60px]">
                              <div
                                className="h-full rounded-full bg-brand/60 transition-all"
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums w-9 text-right">{sharePct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                          {formatCurrency(row.metrics.cost)}
                        </td>
                        {compare && (
                          <td className="px-4 py-3 text-right text-sm">
                            {changePct != null ? (
                              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                                changePct > 0 ? "text-red-500" : changePct < 0 ? "text-green-600" : "text-muted-foreground"
                              }`}>
                                {changePct > 0 ? <ArrowUpRight className="h-3 w-3" /> : changePct < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                                {changePct > 0 ? "+" : ""}{changePct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">new</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatTokens(row.metrics.tokens)}</td>
                        <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatNumber(row.metrics.requests)}</td>
                        <td className="px-4 py-3">
                          {drillLink && (
                            <Link
                              href={drillLink}
                              className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-brand transition-all"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={dimensions.length + (compare ? 7 : 6)} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                            <Search className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium text-foreground">No results found</p>
                          <p className="text-xs text-muted-foreground max-w-xs">
                            {searchQuery
                              ? `No matches for "${searchQuery}". Try adjusting your search or changing the dimensions.`
                              : "No data available for this period and grouping."}
                          </p>
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery("")}
                              className="mt-1 text-xs text-brand hover:underline"
                            >
                              Clear search
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
