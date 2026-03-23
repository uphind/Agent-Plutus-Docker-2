"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SpendChart } from "@/components/charts/spend-chart";
import { ProviderChart } from "@/components/charts/provider-chart";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { AlertBanner } from "@/components/ui/alert-banner";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, formatNumber, PROVIDER_LABELS } from "@/lib/utils";
import { DollarSign, Zap, Users, Plug, TrendingUp, Building2 } from "lucide-react";

interface OverviewData {
  totals: {
    costUsd: number; totalTokens: number; requestsCount: number;
    inputTokens: number; outputTokens: number; cachedTokens: number;
  };
  byProvider: Array<{
    provider: string;
    _sum: { costUsd: number | null; inputTokens: number | null; outputTokens: number | null; requestsCount: number | null };
  }>;
  dailySpend: Array<{ date: string; total_cost: number; total_tokens: number }>;
  topUsers: Array<{ user_id: string; name: string; email: string; total_cost: number; total_tokens: number }>;
  activeUsers: number;
  activeProviders: number;
}

interface AlertData {
  type: string; severity: "critical" | "warning" | "info";
  title: string; description: string;
  entityType: string; entityId: string;
}

interface DeptData {
  id: string; name: string; monthlyBudget: number | null; alertThreshold: number;
  currentSpend: number; userCount: number; budgetUsedPct: number | null;
  status: "healthy" | "warning" | "over_budget" | "no_budget";
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [departments, setDepartments] = useState<DeptData[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getOverview(days),
      api.getAlerts().catch(() => ({ alerts: [] })),
      api.getDepartments().catch(() => ({ departments: [] })),
    ])
      .then(([overview, alertsData, deptsData]) => {
        setData(overview);
        setAlerts(alertsData.alerts?.slice(0, 5) ?? []);
        setDepartments(deptsData.departments ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  if (error) {
    return (
      <div>
        <Header title="Dashboard" />
        <Card className="p-8 text-center">
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-sm text-muted-foreground mt-2">Check your database connection and try refreshing the page.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Dashboard"
        description="AI usage analytics across all providers"
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

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {alerts.filter((a) => a.severity !== "info").slice(0, 3).map((alert, i) => (
            <AlertBanner
              key={i}
              severity={alert.severity}
              title={alert.title}
              description={alert.description}
            />
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          <SkeletonTable rows={5} />
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="Total Spend" value={formatCurrency(data.totals.costUsd)} subtitle={`Last ${days} days`} icon={DollarSign} />
            <StatCard
              title="Total Tokens"
              value={formatTokens(data.totals.totalTokens)}
              subtitle={`${formatTokens(data.totals.inputTokens)} in / ${formatTokens(data.totals.outputTokens)} out`}
              icon={Zap}
            />
            <StatCard title="Active Users" value={formatNumber(data.activeUsers)} subtitle="with recorded usage" icon={Users} />
            <StatCard title="Providers" value={String(data.activeProviders)} subtitle="of 5 connected" icon={Plug} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader><CardTitle>Spend Trend</CardTitle></CardHeader>
              <CardContent><SpendChart data={data.dailySpend} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Spend by Provider</CardTitle></CardHeader>
              <CardContent><ProviderChart data={data.byProvider} /></CardContent>
            </Card>
          </div>

          {/* Departments & Top Users row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department budgets */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Department Budgets</CardTitle>
                  <Link href="/dashboard/departments" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View all</Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {departments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No departments configured</p>
                ) : (
                  departments.slice(0, 5).map((dept) => (
                    <Link key={dept.id} href={`/dashboard/departments/${dept.id}`} className="block group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium group-hover:text-indigo-600 transition-colors">{dept.name}</span>
                          <span className="text-xs text-muted-foreground">{dept.userCount} users</span>
                        </div>
                        <span className="text-sm font-medium">
                          {formatCurrency(dept.currentSpend)}
                          {dept.monthlyBudget !== null && (
                            <span className="text-muted-foreground font-normal"> / {formatCurrency(dept.monthlyBudget)}</span>
                          )}
                        </span>
                      </div>
                      {dept.monthlyBudget !== null && (
                        <ProgressBar value={dept.currentSpend} max={dept.monthlyBudget} alertThreshold={dept.alertThreshold} size="sm" showLabel={false} />
                      )}
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Top users */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Top Users by Spend</CardTitle>
                  <Link href="/dashboard/users" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View all</Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <tbody>
                    {data.topUsers.map((user, i) => (
                      <tr key={user.user_id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-3">
                          <Link href={`/dashboard/users/${user.user_id}`} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                            <Avatar name={user.name} size="sm" />
                            <div>
                              <p className="text-sm font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-right text-sm font-medium">{formatCurrency(user.total_cost)}</td>
                        <td className="px-6 py-3 text-right text-xs text-muted-foreground">{formatTokens(user.total_tokens)}</td>
                      </tr>
                    ))}
                    {data.topUsers.length === 0 && (
                      <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-muted-foreground">No usage data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
