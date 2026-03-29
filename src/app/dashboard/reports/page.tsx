"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, formatNumber, PROVIDER_LABELS, PROVIDER_COLORS } from "@/lib/utils";
import Link from "next/link";
import {
  Download, TrendingUp, TrendingDown, DollarSign, Calendar, Target,
  ChevronDown, ChevronRight, AlertCircle, UserX,
} from "lucide-react";

interface CostSummary {
  period: { month: number; year: number; dayOfMonth: number; daysInMonth: number };
  byDepartment: Array<{
    departmentId: string; department: string; currentSpend: number; previousSpend: number;
    change: number | null; budget: number | null; totalTokens: number; totalRequests: number;
  }>;
  byProvider: Array<{
    provider: string; currentSpend: number; previousSpend: number; change: number | null;
    totalTokens: number; totalRequests: number; costPerRequest: number;
  }>;
  forecast: { currentSpend: number; dailyRate: number; projectedMonthEnd: number; daysRemaining: number };
}

interface AlertData {
  type: string; severity: "critical" | "warning" | "info";
  title: string; description: string; entityType: string; entityId: string; entityName: string;
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const [costData, setCostData] = useState<CostSummary | null>(null);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(searchParams.get("tab") ?? "cost");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && ["cost", "providers", "alerts"].includes(urlTab)) {
      setTab(urlTab);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getCostSummary(),
      api.getAlerts().catch(() => ({ alerts: [], summary: {} })),
    ])
      .then(([cost, alertsData]) => {
        setCostData(cost);
        setAlerts(alertsData.alerts ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async (days: number) => {
    setExporting(true);
    try {
      await api.exportCsv(days);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (error && !costData) {
    return (
      <div>
        <Header title="Reports" />
        <Card className="p-8 text-center"><p className="text-destructive">{error}</p></Card>
      </div>
    );
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div>
      <Header
        title="Reports"
        description="Cost analysis, budget variance, and usage insights"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleExport(30)} disabled={exporting}>
              <Download className="h-3.5 w-3.5" />
              Export 30d CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport(90)} disabled={exporting}>
              <Download className="h-3.5 w-3.5" />
              Export 90d CSV
            </Button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "cost", label: "Cost Summary" },
          { id: "providers", label: "Provider Comparison" },
          { id: "alerts", label: "Attention Items", count: alerts.length || undefined, countColor: alerts.some((a) => a.severity === "critical") ? "red" : alerts.some((a) => a.severity === "warning") ? "amber" : alerts.length > 0 ? "green" : undefined },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          <SkeletonTable />
        </div>
      ) : costData && tab === "cost" ? (
        <>
          {/* Forecast KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Current Month Spend"
              value={formatCurrency(costData.forecast.currentSpend)}
              subtitle={`${monthNames[costData.period.month - 1]} ${costData.period.year}`}
              icon={DollarSign}
            />
            <StatCard
              title="Daily Burn Rate"
              value={formatCurrency(costData.forecast.dailyRate)}
              subtitle="per day average"
              icon={TrendingUp}
            />
            <StatCard
              title="Projected Month-End"
              value={formatCurrency(costData.forecast.projectedMonthEnd)}
              subtitle={`${costData.forecast.daysRemaining} days remaining`}
              icon={Target}
            />
            <StatCard
              title="Day of Month"
              value={`${costData.period.dayOfMonth} / ${costData.period.daysInMonth}`}
              subtitle={`${Math.round((costData.period.dayOfMonth / costData.period.daysInMonth) * 100)}% through`}
              icon={Calendar}
            />
          </div>

          {/* Cost by department */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Cost by Department (This Month)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Department</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Current</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Previous</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Change</th>
                    <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-48">Budget</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {costData.byDepartment.map((d) => {
                    const budgetPct = d.budget && d.budget > 0 ? (d.currentSpend / d.budget) * 100 : null;
                    return (
                      <tr key={d.department} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-3 text-sm font-medium">{d.department}</td>
                        <td className="px-6 py-3 text-right text-sm font-medium">{formatCurrency(d.currentSpend)}</td>
                        <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatCurrency(d.previousSpend)}</td>
                        <td className="px-6 py-3 text-right">
                          {d.change !== null ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${d.change > 0 ? "text-red-600" : d.change < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                              {d.change > 0 ? <TrendingUp className="h-3 w-3" /> : d.change < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                              {d.change > 0 ? "+" : ""}{d.change.toFixed(0)}%
                            </span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-6 py-3">
                          {d.budget !== null ? (
                            <ProgressBar value={d.currentSpend} max={d.budget} size="sm" showLabel />
                          ) : (
                            <span className="text-xs text-muted-foreground">No budget</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatTokens(d.totalTokens)}</td>
                      </tr>
                    );
                  })}
                  {costData.byDepartment.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">No department data</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}

      {costData && tab === "providers" && (
        <Card>
          <CardHeader><CardTitle>Provider Comparison (This Month vs Previous)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Current</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Previous</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Change</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">$/Request</th>
                </tr>
              </thead>
              <tbody>
                {costData.byProvider.map((p) => (
                  <tr key={p.provider} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PROVIDER_COLORS[p.provider] ?? "#6b7280" }} />
                        <span className="text-sm font-medium">{PROVIDER_LABELS[p.provider] ?? p.provider}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-medium">{formatCurrency(p.currentSpend)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatCurrency(p.previousSpend)}</td>
                    <td className="px-6 py-3 text-right">
                      {p.change !== null ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.change > 0 ? "text-red-600" : p.change < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {p.change > 0 ? "+" : ""}{p.change.toFixed(0)}%
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatTokens(p.totalTokens)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatNumber(p.totalRequests)}</td>
                    <td className="px-6 py-3 text-right text-sm text-muted-foreground">{p.costPerRequest > 0 ? `$${p.costPerRequest.toFixed(4)}` : "—"}</td>
                  </tr>
                ))}
                {costData.byProvider.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-sm text-muted-foreground">No provider data</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "alerts" && (
        <AlertsPanel alerts={alerts} />
      )}
    </div>
  );
}

/* ═══════════════ Alerts Panel ═══════════════ */

const ALERT_CATEGORIES: Record<string, {
  label: string;
  description: string;
  icon: typeof AlertCircle;
  dotColor: string;
  bgColor: string;
}> = {
  over_budget: {
    label: "Over Budget",
    description: "Entities that have exceeded their allocated budget",
    icon: DollarSign,
    dotColor: "bg-orange-500",
    bgColor: "bg-orange-500/8",
  },
  budget_warning: {
    label: "Approaching Budget",
    description: "Getting close to the budget limit",
    icon: TrendingUp,
    dotColor: "bg-amber-400",
    bgColor: "bg-amber-500/8",
  },
  anomaly: {
    label: "Unusual Spend",
    description: "Users spending significantly above their department average",
    icon: TrendingDown,
    dotColor: "bg-blue-400",
    bgColor: "bg-blue-500/8",
  },
  inactive_user: {
    label: "Inactive Seats",
    description: "Users with no AI usage in the last 30 days",
    icon: UserX,
    dotColor: "bg-gray-400",
    bgColor: "bg-gray-500/8",
  },
};

const SEVERITY_LABEL: Record<string, { text: string; variant: "warning" | "error" | "info" | "outline" }> = {
  critical: { text: "Needs attention", variant: "error" },
  warning: { text: "Heads up", variant: "warning" },
  info: { text: "FYI", variant: "info" },
};

function entityLink(a: AlertData): string | undefined {
  if (!a.entityType || !a.entityId) return undefined;
  switch (a.entityType) {
    case "department": return `/dashboard/departments/${a.entityId}`;
    case "team": return `/dashboard/teams/${a.entityId}`;
    case "user": return `/dashboard/users/${a.entityId}`;
    default: return undefined;
  }
}

function AlertsPanel({ alerts }: { alerts: AlertData[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const grouped = alerts.reduce<Record<string, AlertData[]>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});

  const categories = Object.keys(ALERT_CATEGORIES).filter((k) => grouped[k]?.length);

  const toggle = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  if (alerts.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="h-5 w-5 text-emerald-500" />
        </div>
        <p className="text-sm font-medium">All clear</p>
        <p className="text-xs text-muted-foreground mt-1">No alerts at the moment. Everything is within normal parameters.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="flex items-center gap-3 flex-wrap">
        {Object.entries(grouped).map(([type, items]) => {
          const cat = ALERT_CATEGORIES[type];
          if (!cat) return null;
          return (
            <div key={type} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cat.bgColor}`}>
              <span className={`h-2 w-2 rounded-full ${cat.dotColor}`} />
              <span className="text-xs font-medium">{items.length} {cat.label.toLowerCase()}</span>
            </div>
          );
        })}
        <span className="text-xs text-muted-foreground ml-auto">{alerts.length} total</span>
      </div>

      {/* Grouped sections */}
      {categories.map((type) => {
        const cat = ALERT_CATEGORIES[type];
        const items = grouped[type];
        const isOpen = !collapsed.has(type);
        const Icon = cat.icon;

        return (
          <Card key={type} className="overflow-hidden">
            {/* Group header */}
            <button
              onClick={() => toggle(type)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
            >
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${cat.bgColor}`}>
                <Icon className="h-4 w-4" style={{ color: cat.dotColor.replace("bg-", "").includes("orange") ? "#f97316" : cat.dotColor.replace("bg-", "").includes("amber") ? "#f59e0b" : cat.dotColor.replace("bg-", "").includes("blue") ? "#60a5fa" : "#9ca3af" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{cat.label}</p>
                <p className="text-[11px] text-muted-foreground">{cat.description}</p>
              </div>
              <Badge variant="outline" className="shrink-0">{items.length}</Badge>
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>

            {/* Table */}
            {isOpen && (
              <div className="border-t border-border">
                <table className="w-full" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "25%" }} />
                    <col />
                    <col style={{ width: "150px" }} />
                    <col style={{ width: "40px" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entity</th>
                      <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Details</th>
                      <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Priority</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a, i) => {
                      const sev = SEVERITY_LABEL[a.severity] ?? { text: a.severity, variant: "outline" as const };
                      const link = entityLink(a);
                      const entityBadge = a.entityType === "department" ? "Dept" : a.entityType === "team" ? "Team" : "User";

                      return (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors group">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cat.dotColor}`} />
                              <span className="text-sm font-medium">{a.entityName}</span>
                              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{entityBadge}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <p className="text-xs text-muted-foreground">{a.description}</p>
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant={sev.variant}>{sev.text}</Badge>
                          </td>
                          <td className="px-5 py-3">
                            {link && (
                              <Link
                                href={link}
                                className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-brand transition-all"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
