"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatTokens, formatNumber, formatModelName, isOverageModel, PROVIDER_LABELS, PROVIDER_COLORS } from "@/lib/utils";
import { TrendingUp, TrendingDown, Zap, DollarSign, Hash, Clock } from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

// Deterministic color palette for models
const MODEL_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#e11d48", "#7c3aed", "#0ea5e9", "#d946ef", "#22c55e",
];

interface TimeSeriesRow {
  period: string; model: string; provider: string;
  total_cost: number; total_tokens: number; input_tokens: number;
  output_tokens: number; total_requests: number;
}

interface ModelTotal {
  model: string; provider: string;
  total_cost: number; total_tokens: number; total_requests: number;
  first_seen: string; last_seen: string; active_days: number;
}

interface PeriodTotal {
  period: string; total_cost: number; total_requests: number;
}

interface EfficiencyRow {
  period: string; model: string; provider: string;
  avg_cost_per_request: number; avg_tokens_per_request: number;
}

interface TrendsData {
  granularity: string; days: number;
  timeSeries: TimeSeriesRow[];
  modelTotals: ModelTotal[];
  periodTotals: PeriodTotal[];
  efficiencyTrends: EfficiencyRow[];
}

function formatPeriod(period: string, granularity: string): string {
  const d = new Date(period);
  if (isNaN(d.getTime())) return period;
  switch (granularity) {
    case "yearly": return d.getFullYear().toString();
    case "monthly": return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    case "weekly": return `W${getWeekNumber(d)} ${d.toLocaleDateString("en-US", { month: "short" })}`;
    default: return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

function getWeekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
}

export default function TrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [granularity, setGranularity] = useState("daily");
  const [provider, setProvider] = useState("");
  const [tab, setTab] = useState("usage");
  const [metric, setMetric] = useState<"cost" | "tokens" | "requests">("cost");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    api.getTrends(days, granularity, provider || undefined)
      .then((d) => {
        setData(d);
        setSelectedModels(new Set(d.modelTotals.slice(0, 8).map((m: ModelTotal) => `${m.provider}|${m.model}`)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days, granularity, provider]);

  const modelColorMap = useMemo(() => {
    if (!data) return new Map<string, string>();
    const map = new Map<string, string>();
    data.modelTotals.forEach((m, i) => {
      map.set(`${m.provider}|${m.model}`, MODEL_COLORS[i % MODEL_COLORS.length]);
    });
    return map;
  }, [data]);

  // Build chart data: pivot time series into { period, model1: val, model2: val, ... }
  const chartData = useMemo(() => {
    if (!data) return [];
    const periods = [...new Set(data.timeSeries.map((r) => r.period))].sort();
    return periods.map((period) => {
      const row: Record<string, string | number> = { period: formatPeriod(period, granularity) };
      const entries = data.timeSeries.filter((r) => r.period === period);
      for (const e of entries) {
        const key = `${e.provider}|${e.model}`;
        if (!selectedModels.has(key)) continue;
        const label = modelLabel(e.provider, e.model);
        if (metric === "cost") row[label] = Math.round(e.total_cost * 100) / 100;
        else if (metric === "tokens") row[label] = e.total_tokens;
        else row[label] = e.total_requests;
      }
      return row;
    });
  }, [data, granularity, metric, selectedModels]);

  // Efficiency chart data
  const efficiencyData = useMemo(() => {
    if (!data) return [];
    const periods = [...new Set(data.efficiencyTrends.map((r) => r.period))].sort();
    return periods.map((period) => {
      const row: Record<string, string | number> = { period: formatPeriod(period, granularity) };
      const entries = data.efficiencyTrends.filter((r) => r.period === period);
      for (const e of entries) {
        const key = `${e.provider}|${e.model}`;
        if (!selectedModels.has(key)) continue;
        row[modelLabel(e.provider, e.model)] = Math.round(e.avg_cost_per_request * 10000) / 10000;
      }
      return row;
    });
  }, [data, granularity, selectedModels]);

  // Market share data
  const shareData = useMemo(() => {
    if (!data) return [];
    const periods = [...new Set(data.timeSeries.map((r) => r.period))].sort();
    return periods.map((period) => {
      const entries = data.timeSeries.filter((r) => r.period === period);
      const total = entries.reduce((s, e) => s + e.total_cost, 0);
      const row: Record<string, string | number> = { period: formatPeriod(period, granularity) };
      for (const e of entries) {
        const key = `${e.provider}|${e.model}`;
        if (!selectedModels.has(key)) continue;
        row[modelLabel(e.provider, e.model)] = total > 0 ? Math.round((e.total_cost / total) * 1000) / 10 : 0;
      }
      return row;
    });
  }, [data, granularity, selectedModels]);

  const activeModelLabels = useMemo(() => {
    if (!data) return [];
    return data.modelTotals
      .filter((m) => selectedModels.has(`${m.provider}|${m.model}`))
      .map((m) => modelLabel(m.provider, m.model));
  }, [data, selectedModels]);

  function modelLabel(provider: string, model: string): string {
    const pLabel = PROVIDER_LABELS[provider] ?? provider;
    return `${formatModelName(model)} (${pLabel})`;
  }

  function toggleModel(key: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (error) {
    return (
      <div>
        <Header title="Trends" />
        <Card className="p-8 text-center"><p className="text-destructive">{error}</p></Card>
      </div>
    );
  }

  const tooltipStyle = {
    contentStyle: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)" },
  };

  const metricLabel = metric === "cost" ? "Cost ($)" : metric === "tokens" ? "Tokens" : "Requests";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metricFormatter: any = metric === "cost"
    ? (v: number | string) => `$${Number(v).toFixed(2)}`
    : metric === "tokens"
      ? (v: number | string) => formatTokens(Number(v))
      : (v: number | string) => formatNumber(Number(v));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pctFormatter: any = (v: number | string) => `${Number(v).toFixed(1)}%`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const costReqFormatter: any = (v: number | string) => `$${Number(v).toFixed(4)}`;

  return (
    <div>
      <Header
        title="Trends"
        description="Model usage trends and comparisons over time"
        action={
          <div className="flex items-center gap-2">
            <Select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              options={[
                { value: "", label: "All providers" },
                { value: "anthropic", label: "Anthropic" },
                { value: "openai", label: "OpenAI" },
                { value: "gemini", label: "Gemini" },
                { value: "cursor", label: "Cursor" },
                { value: "vertex", label: "Vertex AI" },
              ]}
            />
            <Select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
            <Select
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
              options={[
                { value: "7", label: "7 days" },
                { value: "14", label: "14 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
                { value: "180", label: "180 days" },
                { value: "365", label: "1 year" },
              ]}
            />
          </div>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          <SkeletonTable rows={6} />
        </div>
      ) : data ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="Models Used" value={String(data.modelTotals.length)} subtitle={`across ${new Set(data.modelTotals.map((m) => m.provider)).size} providers`} icon={Zap} />
            <StatCard title="Total Spend" value={formatCurrency(data.modelTotals.reduce((s, m) => s + m.total_cost, 0))} subtitle={`Last ${days} days`} icon={DollarSign} />
            <StatCard title="Total Requests" value={formatNumber(data.modelTotals.reduce((s, m) => s + m.total_requests, 0))} icon={Hash} />
            <StatCard title="Data Points" value={formatNumber(data.periodTotals.length)} subtitle={`${granularity} intervals`} icon={Clock} />
          </div>

          {/* Model selector */}
          <Card className="mb-6">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground mr-1">Models:</span>
                {data.modelTotals.map((m) => {
                  const key = `${m.provider}|${m.model}`;
                  const active = selectedModels.has(key);
                  const color = modelColorMap.get(key) ?? "#6b7280";
                  return (
                    <button
                      key={key}
                      onClick={() => toggleModel(key)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        active
                          ? "border-transparent text-white shadow-sm"
                          : "border-border text-muted-foreground bg-card hover:bg-muted"
                      }`}
                      style={active ? { backgroundColor: color } : {}}
                    >
                      {!active && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
                      {formatModelName(m.model)}{isOverageModel(m.model) ? " ⚠" : ""}
                      <span className="opacity-70">({PROVIDER_LABELS[m.provider] ?? m.provider})</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs
            tabs={[
              { id: "usage", label: "Usage Over Time" },
              { id: "share", label: "Model Share" },
              { id: "efficiency", label: "Cost Efficiency" },
              { id: "ranking", label: "Model Ranking" },
              { id: "adoption", label: "Adoption Timeline" },
            ]}
            active={tab}
            onChange={setTab}
            className="mb-6"
          />

          {/* ═══════════════ Usage Over Time ═══════════════ */}
          {tab === "usage" && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">Metric:</span>
                {(["cost", "tokens", "requests"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${metric === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                  >
                    {m === "cost" ? "Cost ($)" : m === "tokens" ? "Tokens" : "Requests"}
                  </button>
                ))}
              </div>

              <Card>
                <CardHeader><CardTitle>{metricLabel} by Model Over Time</CardTitle></CardHeader>
                <CardContent>
                  {chartData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">No data for this period</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => metricFormatter(v)} />
                        <Tooltip {...tooltipStyle} formatter={metricFormatter} />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        {activeModelLabels.map((label) => {
                          const entry = data.modelTotals.find((m) => modelLabel(m.provider, m.model) === label);
                          const color = entry ? modelColorMap.get(`${entry.provider}|${entry.model}`) : "#6b7280";
                          return (
                            <Line key={label} type="monotone" dataKey={label} stroke={color} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Stacked area variant */}
              {chartData.length > 0 && (
                <Card className="mt-6">
                  <CardHeader><CardTitle>Cumulative {metricLabel} (Stacked)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => metricFormatter(v)} />
                        <Tooltip {...tooltipStyle} formatter={metricFormatter} />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        {activeModelLabels.map((label) => {
                          const entry = data.modelTotals.find((m) => modelLabel(m.provider, m.model) === label);
                          const color = entry ? modelColorMap.get(`${entry.provider}|${entry.model}`) : "#6b7280";
                          return (
                            <Area key={label} type="monotone" dataKey={label} stackId="1" stroke={color} fill={color} fillOpacity={0.3} />
                          );
                        })}
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ═══════════════ Model Share ═══════════════ */}
          {tab === "share" && (
            <Card>
              <CardHeader><CardTitle>Model Cost Share Over Time (%)</CardTitle></CardHeader>
              <CardContent>
                {shareData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">No data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={shareData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip {...tooltipStyle} formatter={pctFormatter} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      {activeModelLabels.map((label) => {
                        const entry = data.modelTotals.find((m) => modelLabel(m.provider, m.model) === label);
                        const color = entry ? modelColorMap.get(`${entry.provider}|${entry.model}`) : "#6b7280";
                        return (
                          <Area key={label} type="monotone" dataKey={label} stackId="1" stroke={color} fill={color} fillOpacity={0.6} />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══════════════ Cost Efficiency ═══════════════ */}
          {tab === "efficiency" && (
            <Card>
              <CardHeader><CardTitle>Average Cost per Request Over Time</CardTitle></CardHeader>
              <CardContent>
                {efficiencyData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">No data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={efficiencyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => `$${v.toFixed(4)}`} />
                      <Tooltip {...tooltipStyle} formatter={costReqFormatter} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      {activeModelLabels.map((label) => {
                        const entry = data.modelTotals.find((m) => modelLabel(m.provider, m.model) === label);
                        const color = entry ? modelColorMap.get(`${entry.provider}|${entry.model}`) : "#6b7280";
                        return (
                          <Line key={label} type="monotone" dataKey={label} stroke={color} strokeWidth={2} dot={{ r: 2 }} />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══════════════ Model Ranking ═══════════════ */}
          {tab === "ranking" && (
            <Card>
              <CardHeader><CardTitle>Model Ranking</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-10">#</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                      <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-40">Share</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tokens</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">$/Req</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.modelTotals.map((m, i) => {
                      const totalCostAll = data.modelTotals.reduce((s, x) => s + x.total_cost, 0);
                      const share = totalCostAll > 0 ? (m.total_cost / totalCostAll) * 100 : 0;
                      const color = modelColorMap.get(`${m.provider}|${m.model}`) ?? "#6b7280";
                      const costPerReq = m.total_requests > 0 ? m.total_cost / m.total_requests : 0;
                      return (
                        <tr key={`${m.provider}|${m.model}`} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-3 text-sm text-muted-foreground">{i + 1}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-sm font-mono font-medium">{formatModelName(m.model)}</span>
                              {isOverageModel(m.model) && (
                                <Badge variant="warning" className="text-[10px] px-1.5 py-0">overage</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm">{PROVIDER_LABELS[m.provider] ?? m.provider}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                              </div>
                              <span className="text-xs font-medium w-10 text-right">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right text-sm font-medium">{formatCurrency(m.total_cost)}</td>
                          <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatTokens(m.total_tokens)}</td>
                          <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatNumber(m.total_requests)}</td>
                          <td className="px-6 py-3 text-right text-sm text-muted-foreground">{costPerReq > 0 ? `$${costPerReq.toFixed(4)}` : "—"}</td>
                          <td className="px-6 py-3 text-right text-sm text-muted-foreground">{m.active_days}</td>
                        </tr>
                      );
                    })}
                    {data.modelTotals.length === 0 && (
                      <tr><td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">No model data</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════ Adoption Timeline ═══════════════ */}
          {tab === "adoption" && (
            <Card>
              <CardHeader>
                <CardTitle>Model Adoption Timeline</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">When each model was first and last used, and how many days it was active</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.modelTotals.map((m) => {
                    const color = modelColorMap.get(`${m.provider}|${m.model}`) ?? "#6b7280";
                    const startDate = new Date(m.first_seen);
                    const endDate = new Date(m.last_seen);
                    const rangeStart = new Date();
                    rangeStart.setDate(rangeStart.getDate() - days);
                    const rangeEnd = new Date();
                    const totalRange = rangeEnd.getTime() - rangeStart.getTime();
                    const leftPct = totalRange > 0 ? Math.max(0, ((startDate.getTime() - rangeStart.getTime()) / totalRange) * 100) : 0;
                    const widthPct = totalRange > 0 ? Math.max(2, ((endDate.getTime() - startDate.getTime()) / totalRange) * 100) : 2;
                    const isRecent = (rangeEnd.getTime() - endDate.getTime()) < 2 * 86400000;

                    return (
                      <div key={`${m.provider}|${m.model}`} className="flex items-center gap-3">
                        <div className="w-44 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-xs font-mono font-medium truncate">{formatModelName(m.model)}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground ml-3.5">{PROVIDER_LABELS[m.provider] ?? m.provider}</span>
                        </div>
                        <div className="flex-1 relative h-6 bg-muted rounded-md">
                          <div
                            className="absolute top-1 bottom-1 rounded"
                            style={{ left: `${leftPct}%`, width: `${Math.min(widthPct, 100 - leftPct)}%`, backgroundColor: color, opacity: 0.7 }}
                          />
                        </div>
                        <div className="w-32 shrink-0 text-right">
                          <span className="text-xs font-medium">{m.active_days}d active</span>
                          {isRecent && <Badge variant="success" className="ml-1.5">Active</Badge>}
                        </div>
                      </div>
                    );
                  })}
                  {data.modelTotals.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No model data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
