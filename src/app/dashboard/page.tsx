"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SpendChart } from "@/components/charts/spend-chart";
import { ProviderChart } from "@/components/charts/provider-chart";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, formatNumber, PROVIDER_LABELS } from "@/lib/utils";
import { TOOLTIPS } from "@/lib/tooltip-content";
import Image from "next/image";
import { DollarSign, Zap, Users, Plug, Check, Boxes, PieChart as PieChartIcon, BarChart3 } from "lucide-react";
import { DistributionPie } from "@/components/charts/distribution-pie";
import { getDepartmentIcon } from "@/lib/entity-icons";
import { SETUP_SKIPPED_KEY, SETUP_SKIPPED_EVENT } from "@/lib/setup-constants";

interface ComparisonMetric {
  current: number;
  previous: number;
  changePercent: number;
}

interface OverviewData {
  totals: {
    costUsd: number; totalTokens: number; requestsCount: number;
    inputTokens: number; outputTokens: number; cachedTokens: number;
  };
  comparison?: {
    cost: ComparisonMetric;
    tokens: ComparisonMetric;
    requests: ComparisonMetric;
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

function ComparisonBadge({ value }: { value: number | undefined }) {
  if (value == null || !isFinite(value)) return null;
  const isDown = value < 0;
  return (
    <span className={`text-[10px] font-medium ml-1.5 ${isDown ? "text-green-600" : value > 0 ? "text-red-500" : "text-muted-foreground"}`}>
      {isDown ? "↓" : value > 0 ? "↑" : "→"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

interface DeptData {
  id: string; name: string; monthlyBudget: number | null; alertThreshold: number;
  currentSpend: number; userCount: number; budgetUsedPct: number | null;
  status: "healthy" | "caution" | "warning" | "over_budget" | "no_budget";
}

interface ModelData {
  model: string; provider: string; totalCost: number; totalTokens: number; requestsCount: number;
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [departments, setDepartments] = useState<DeptData[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerChartMode, setProviderChartMode] = useState<"bar" | "pie">("bar");
  const [setupSkipped, setSetupSkipped] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setSetupSkipped(localStorage.getItem(SETUP_SKIPPED_KEY) === "true");
  }, []);

  // Auto-redirect first-time users to the onboarding wizard. Only fires when
  // the user (a) has never marked onboarding complete server-side AND (b)
  // hasn't dismissed the dashboard onboarding banner client-side AND (c) has
  // no providers configured. The check happens once after the dashboard data
  // loads so we have an accurate provider count.
  useEffect(() => {
    if (!data) return;
    if (setupSkipped) return;
    if (data.activeProviders > 0) return;
    let cancelled = false;
    api
      .getOnboardingState()
      .then((s: { completed: boolean }) => {
        if (cancelled || s.completed) return;
        router.push("/dashboard/onboarding");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data, setupSkipped, router]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getOverview(days),
      api.getDepartments().catch(() => ({ departments: [] })),
      api.getByModel(days).catch(() => ({ models: [] })),
    ])
      .then(([overview, deptsData, modelData]) => {
        setData(overview);
        setDepartments(deptsData.departments ?? []);
        setModels(modelData.models ?? []);
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

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          <SkeletonTable rows={5} />
        </div>
      ) : data && !setupSkipped && data.activeProviders === 0 && data.topUsers.length === 0 && data.totals.costUsd === 0 ? (
        /* Onboarding empty state — only shown when there's truly no data and not skipped */
        <Card className="p-10 text-center max-w-lg mx-auto">
          <div className="flex justify-center mb-5">
            <Image src="/logo/symbol.svg" alt="Agent Plutus" width={48} height={48} />
          </div>
          <h2 className="text-xl font-bold mb-2">Welcome to Agent Plutus</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Get started by completing the setup steps below. Once configured, your AI usage data will appear here automatically.
          </p>
          <div className="mb-6">
            <Link
              href="/dashboard/onboarding"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-light transition-colors"
            >
              Run guided onboarding
            </Link>
          </div>
          <div className="space-y-4 text-left">
            {[
              { label: "Connect an AI provider", href: "/dashboard/settings", done: false },
              { label: "Push your employee directory", href: "/dashboard/settings", done: false },
              { label: "Set department budgets", href: "/dashboard/departments", done: departments.length > 0 },
            ].map((step) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${step.done ? "bg-emerald-100 text-emerald-600" : "bg-brand-subtle text-brand"}`}>
                  {step.done ? <Check className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </div>
                <span className="text-sm flex-1">{step.label}</span>
                {!step.done && (
                  <Link href={step.href} className="text-xs text-brand hover:text-brand-light font-medium">
                    Set up &rarr;
                  </Link>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              localStorage.setItem(SETUP_SKIPPED_KEY, "true");
              setSetupSkipped(true);
              window.dispatchEvent(new Event(SETUP_SKIPPED_EVENT));
            }}
            className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </Card>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Total Spend"
              value={<>{formatCurrency(data.totals.costUsd)}<ComparisonBadge value={data.comparison?.cost.changePercent} /></>}
              subtitle={`Last ${days} days`}
              icon={DollarSign}
              tooltip={TOOLTIPS.totalSpend}
            />
            <StatCard
              title="Total Tokens"
              value={<>{formatTokens(data.totals.totalTokens)}<ComparisonBadge value={data.comparison?.tokens.changePercent} /></>}
              subtitle={`${formatTokens(data.totals.inputTokens)} in / ${formatTokens(data.totals.outputTokens)} out`}
              icon={Zap}
            />
            <StatCard title="Active Users" value={formatNumber(data.activeUsers)} subtitle="with recorded usage" icon={Users} tooltip={TOOLTIPS.activeUsers} />
            <StatCard
              title="Requests"
              value={<>{formatNumber(data.totals.requestsCount)}<ComparisonBadge value={data.comparison?.requests.changePercent} /></>}
              subtitle="total API calls"
              icon={Plug}
              tooltip={TOOLTIPS.totalRequests}
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader><CardTitle>Spend Trend</CardTitle></CardHeader>
              <CardContent><SpendChart data={data.dailySpend} /></CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Spend by Provider</CardTitle>
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                    <button
                      onClick={() => setProviderChartMode("bar")}
                      className={`p-1.5 rounded-md transition-colors ${providerChartMode === "bar" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setProviderChartMode("pie")}
                      className={`p-1.5 rounded-md transition-colors ${providerChartMode === "pie" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <PieChartIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {providerChartMode === "bar" ? (
                  <ProviderChart data={data.byProvider} />
                ) : (
                  <DistributionPie
                    data={data.byProvider.map((p) => ({
                      name: PROVIDER_LABELS[p.provider] ?? p.provider,
                      value: Number(p._sum.costUsd ?? 0),
                      color: ({ anthropic: "#D4A574", anthropic_compliance: "#A67E47", anthropic_analytics: "#C68A4F", openai: "#10A37F", gemini: "#8E75B2", cursor: "#6366F1", vertex: "#4285F4" } as Record<string, string>)[p.provider],
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Spend by Model */}
          {models.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Spend by Model</CardTitle>
                  <Link href="/dashboard/analytics" className="text-xs text-brand hover:text-brand-light font-medium">View analytics</Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-8">#</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Spend</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.slice(0, 8).map((m, i) => {
                      const maxCost = Math.max(...models.map((x) => x.totalCost), 1);
                      const barPct = (m.totalCost / maxCost) * 100;
                      return (
                        <tr key={`${m.provider}-${m.model}`} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-3 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <Boxes className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium">{m.model}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">
                              {PROVIDER_LABELS[m.provider] ?? m.provider}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden lg:block">
                                <div className="h-full rounded-full bg-brand" style={{ width: `${barPct}%` }} />
                              </div>
                              <span className="text-sm font-medium tabular-nums">{formatCurrency(m.totalCost)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatTokens(m.totalTokens)}</td>
                          <td className="px-6 py-3 text-right text-sm text-muted-foreground tabular-nums">{formatNumber(m.requestsCount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Departments & Top Users row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department budgets */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Department Budgets</CardTitle>
                  <Link href="/dashboard/departments" className="text-xs text-brand hover:text-brand-light font-medium">View all</Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {departments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No departments configured</p>
                ) : (
                  departments.slice(0, 5).map((dept) => {
                    const di = getDepartmentIcon(dept.name);
                    return (
                    <Link key={dept.id} href={`/dashboard/departments/${dept.id}`} className="block group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <di.icon className={`h-3.5 w-3.5 ${di.colorClass}`} />
                          <span className="text-sm font-medium group-hover:text-brand transition-colors">{dept.name}</span>
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
                  );
                  })
                )}
              </CardContent>
            </Card>

            {/* Top users */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Top Users by Spend</CardTitle>
                  <Link href="/dashboard/users" className="text-xs text-brand hover:text-brand-light font-medium">View all</Link>
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
