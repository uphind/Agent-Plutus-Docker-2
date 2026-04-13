"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatNumber, PROVIDER_LABELS } from "@/lib/utils";
import {
  ChartLine, TrendingUp, TrendingDown, AlertTriangle,
  Calendar, DollarSign, Calculator, SlidersHorizontal,
} from "lucide-react";
import { TOOLTIPS } from "@/lib/tooltip-content";
import { useTerminology } from "@/lib/terminology";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Line,
} from "recharts";

interface DeptForecast {
  departmentId: string;
  department: string;
  projected30d: number;
  currentSpend: number;
  growthRate: number;
}

interface ForecastData {
  period: { historyDays: number; forecastDays: number };
  regression: { slope: number; intercept: number; r2: number };
  seasonality: { avgWeekday: number; avgWeekend: number; weekendRatio: number };
  history: Array<{ date: string; spend: number; tokens: number; requests: number }>;
  forecast: Array<{ date: string; projected: number; low: number; high: number }>;
  projectedTotal30d: number;
  weeklyGrowthRate: number | null;
  providerGrowth: Array<{
    provider: string;
    recentWeekSpend: number;
    priorWeekSpend: number;
    growthRate: number;
  }>;
  budgetExhaustion: Array<{
    departmentId: string;
    department: string;
    budget: number;
    currentSpend: number;
    dailyRate: number;
    projectedMonthEnd: number;
    projectedOverage: number;
    daysUntilExhausted: number;
    exhaustionDate: string | null;
    willExceed: boolean;
  }>;
  departmentForecasts: DeptForecast[];
  currentMonth: { dayOfMonth: number; daysInMonth: number; daysRemaining: number };
}

export default function ForecastingPage() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [historyDays, setHistoryDays] = useState(90);
  const [forecastDays, setForecastDays] = useState(30);
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [whatIfUsers, setWhatIfUsers] = useState(0);
  const { t } = useTerminology();

  useEffect(() => {
    api.getDepartments()
      .then((d) => setDepartments(d.departments ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getForecast(historyDays, forecastDays, departmentId || undefined)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [historyDays, forecastDays, departmentId]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const hist = data.history.map((h) => ({
      date: h.date,
      actual: h.spend,
      projected: null as number | null,
      low: null as number | null,
      high: null as number | null,
    }));
    const fc = data.forecast.map((f) => ({
      date: f.date,
      actual: null as number | null,
      projected: f.projected,
      low: f.low,
      high: f.high,
    }));
    return [...hist, ...fc];
  }, [data]);

  const whatIfCost = useMemo(() => {
    if (!data || !data.history.length) return 0;
    const totalCost = data.history.reduce((s, h) => s + h.spend, 0);
    const uniqueDays = data.history.length;
    const perUserPerDay = uniqueDays > 0 && data.regression.intercept > 0
      ? totalCost / (uniqueDays * Math.max(1, data.regression.intercept / (totalCost / uniqueDays)))
      : 0;
    return whatIfUsers * perUserPerDay * 30;
  }, [data, whatIfUsers]);

  if (loading) {
    return (
      <div>
        <Header title="Forecasting" description="Predictive spend analysis and budget projections" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Forecasting" description="Predictive spend analysis and budget projections" />
        <Card className="p-8 text-center">
          <p className="text-destructive">{error}</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const hasHistory = data.history.length > 0;

  return (
    <div>
      <Header
        title="Forecasting"
        description="Predictive spend analysis and budget projections"
        action={
          <div className="flex items-center gap-3">
            {departments.length > 0 && (
              <Select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                options={[
                  { value: "", label: `All ${t("departments")}` },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            )}
            <Select
              value={String(historyDays)}
              onChange={(e) => setHistoryDays(Number(e.target.value))}
              options={[
                { value: "30", label: "30d history" },
                { value: "60", label: "60d history" },
                { value: "90", label: "90d history" },
              ]}
            />
            <Select
              value={String(forecastDays)}
              onChange={(e) => setForecastDays(Number(e.target.value))}
              options={[
                { value: "30", label: "30d forecast" },
                { value: "60", label: "60d forecast" },
                { value: "90", label: "90d forecast" },
              ]}
            />
          </div>
        }
      />

      {!hasHistory ? (
        <Card className="p-10 text-center max-w-lg mx-auto">
          <div className="flex justify-center mb-4">
            <ChartLine className="h-12 w-12 text-muted-foreground/40" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No spend data yet</h2>
          <p className="text-sm text-muted-foreground">
            Forecasting requires historical usage data. Once your connected providers start reporting spend, projections will appear here automatically.
          </p>
        </Card>
      ) : (
      <>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          title="Projected 30-Day Spend"
          value={formatCurrency(data.projectedTotal30d)}
          subtitle="Based on trend regression"
          icon={DollarSign}
          tooltip={TOOLTIPS.projectedSpend}
        />
        <StatCard
          title="Daily Trend"
          value={`${data.regression.slope >= 0 ? "+" : ""}$${data.regression.slope.toFixed(2)}/day`}
          subtitle={`R² = ${data.regression.r2.toFixed(3)}`}
          icon={data.regression.slope >= 0 ? TrendingUp : TrendingDown}
          tooltip={TOOLTIPS.dailyTrend}
        />
        <StatCard
          title="Week-over-Week"
          value={data.weeklyGrowthRate !== null ? `${data.weeklyGrowthRate >= 0 ? "+" : ""}${data.weeklyGrowthRate.toFixed(1)}%` : "N/A"}
          subtitle="Spend growth rate"
          icon={ChartLine}
          tooltip={TOOLTIPS.weekOverWeek}
        />
        <StatCard
          title="Weekend Ratio"
          value={`${(data.seasonality.weekendRatio * 100).toFixed(0)}%`}
          subtitle={`Weekday avg: ${formatCurrency(data.seasonality.avgWeekday)}`}
          icon={Calendar}
          tooltip={TOOLTIPS.weekendRatio}
        />
      </div>

      {/* Forecast Chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartLine className="h-4 w-4 text-primary" />
            Spend Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.08} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }}
                formatter={(value, name) => {
                  if (value == null) return [null, name];
                  return [formatCurrency(Number(value)), name === "actual" ? "Actual" : name === "projected" ? "Projected" : String(name)];
                }}
              />
              <ReferenceLine
                x={data.history[data.history.length - 1]?.date}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: "Today", position: "top", fontSize: 10, fill: "#94a3b8" }}
              />
              <Area type="monotone" dataKey="high" stroke="transparent" fill="url(#bandGrad)" name="High" />
              <Area type="monotone" dataKey="low" stroke="transparent" fill="transparent" name="Low" />
              <Area type="monotone" dataKey="actual" stroke="#6366f1" fill="url(#actualGrad)" strokeWidth={2} name="Actual" connectNulls={false} />
              <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Projected" connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {/* Budget Exhaustion */}
        {data.budgetExhaustion.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Budget Exhaustion Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.budgetExhaustion.map((be) => (
                <div
                  key={be.departmentId}
                  className={`rounded-lg border p-3 ${
                    be.willExceed ? "border-red-200 bg-red-50/50" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{be.department}</span>
                    {be.willExceed && (
                      <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                        Will Exceed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Budget: {formatCurrency(be.budget)} · Spent: {formatCurrency(be.currentSpend)}</p>
                    <p>Daily rate: {formatCurrency(be.dailyRate)} · Projected: {formatCurrency(be.projectedMonthEnd)}</p>
                    {be.exhaustionDate && (
                      <p className="text-red-600 font-medium">
                        Exhausts on {new Date(be.exhaustionDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" "}({be.daysUntilExhausted} days)
                      </p>
                    )}
                    {be.projectedOverage > 0 && (
                      <p className="text-red-600">Projected overage: {formatCurrency(be.projectedOverage)}</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Provider Growth */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Provider Growth Rates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.providerGrowth.map((pg) => (
              <div key={pg.provider} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className="font-medium text-sm">{PROVIDER_LABELS[pg.provider] ?? pg.provider}</span>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(pg.recentWeekSpend)}/wk vs {formatCurrency(pg.priorWeekSpend)}/wk
                  </p>
                </div>
                <span className={`text-sm font-semibold ${
                  pg.growthRate > 10 ? "text-red-500" : pg.growthRate > 0 ? "text-amber-600" : "text-emerald-600"
                }`}>
                  {pg.growthRate >= 0 ? "+" : ""}{pg.growthRate.toFixed(1)}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* What-If Simulator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            What-If Simulator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  Add Users
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={whatIfUsers}
                    onChange={(e) => setWhatIfUsers(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-12 text-right">+{whatIfUsers}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Estimated monthly impact: +{formatCurrency(whatIfCost)}
                </p>
              </div>
              {data.budgetExhaustion.filter((be) => be.willExceed).length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                    <Calculator className="h-3.5 w-3.5" />
                    Removing {data.budgetExhaustion.filter((be) => be.willExceed).length} department(s) idle seats could save an estimated $
                    {data.budgetExhaustion.filter((be) => be.willExceed).reduce((s, be) => s + be.projectedOverage, 0).toFixed(0)}/mo in overages.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model Confidence</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Trend direction</span><span className="font-medium">{data.regression.slope >= 0 ? "Increasing" : "Decreasing"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">R² fit</span><span className="font-medium">{data.regression.r2.toFixed(3)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Data points</span><span className="font-medium">{data.history.length} days</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Weekend effect</span><span className="font-medium">{(data.seasonality.weekendRatio * 100).toFixed(0)}% of weekday</span></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Department Forecast Comparison */}
      {data.departmentForecasts && data.departmentForecasts.length > 0 && !departmentId && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              {t("Department")} Forecast Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, data.departmentForecasts.length * 40 + 40)}>
              <BarChart
                data={data.departmentForecasts}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="department" tick={{ fontSize: 11, fill: "#6b7280" }} width={120} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [formatCurrency(Number(value)), "Projected 30d"]}
                />
                <Bar dataKey="projected30d" fill="#6366f1" radius={[0, 4, 4, 0]} name="Projected 30d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  );
}
