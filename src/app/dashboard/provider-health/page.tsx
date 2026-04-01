"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { PROVIDER_LABELS } from "@/lib/utils";
import {
  ShieldCheck, AlertTriangle, CheckCircle, XCircle,
  Clock, Activity, Wifi, WifiOff,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

interface ProviderHealthData {
  overallHealth: number;
  providers: Array<{
    provider: string;
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    successRate: number;
    avgDurationMs: number;
    lastSync: string | null;
    lastStatus: string;
    healthScore: number;
    healthStatus: string;
  }>;
  alerts: Array<{
    provider: string;
    type: string;
    message: string;
    severity: string;
  }>;
  recentFailures: Array<{
    id: string;
    provider: string;
    message: string | null;
    startedAt: string;
  }>;
  dailySyncStats: Array<{
    date: string;
    provider: string;
    success_count: number;
    fail_count: number;
  }>;
}

const HEALTH_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  excellent: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200" },
  good: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-200" },
  fair: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-200" },
  degraded: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-200" },
  poor: { bg: "bg-red-50", text: "text-red-600", ring: "ring-red-200" },
};

export default function ProviderHealthPage() {
  const [data, setData] = useState<ProviderHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getProviderHealth()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <Header title="Provider Health" description="Sync reliability and provider status monitoring" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    );
  }

  if (!data) return null;

  const totalSyncs = data.providers.reduce((s, p) => s + p.totalSyncs, 0);
  const totalFailures = data.providers.reduce((s, p) => s + p.failedSyncs, 0);

  const dailyChartData = (() => {
    const byDate = new Map<string, { date: string; success: number; failed: number }>();
    for (const d of data.dailySyncStats) {
      const existing = byDate.get(d.date) ?? { date: d.date, success: 0, failed: 0 };
      existing.success += d.success_count;
      existing.failed += d.fail_count;
      byDate.set(d.date, existing);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  })();

  return (
    <div>
      <Header
        title="Provider Health"
        description="Sync reliability and provider status monitoring"
      />

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          title="Overall Health"
          value={`${data.overallHealth}%`}
          subtitle={data.overallHealth >= 95 ? "Excellent" : data.overallHealth >= 80 ? "Good" : "Needs attention"}
          icon={ShieldCheck}
        />
        <StatCard
          title="Total Syncs (30d)"
          value={totalSyncs}
          subtitle={`${data.providers.length} providers`}
          icon={Activity}
        />
        <StatCard
          title="Failures (30d)"
          value={totalFailures}
          subtitle={totalSyncs > 0 ? `${((totalFailures / totalSyncs) * 100).toFixed(1)}% failure rate` : "No syncs"}
          icon={totalFailures > 0 ? AlertTriangle : CheckCircle}
        />
        <StatCard
          title="Active Alerts"
          value={data.alerts.length}
          subtitle={data.alerts.filter((a) => a.severity === "critical").length > 0 ? "Critical alerts present" : "All clear"}
          icon={data.alerts.length > 0 ? AlertTriangle : CheckCircle}
        />
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.alerts.map((alert, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 flex items-start gap-3 ${
                  alert.severity === "critical" ? "border-red-200 bg-red-50/50" :
                  alert.severity === "warning" ? "border-amber-200 bg-amber-50/50" :
                  "border-border"
                }`}
              >
                {alert.severity === "critical" ? <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> :
                 alert.severity === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /> :
                 <Clock className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />}
                <div>
                  <p className="text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {PROVIDER_LABELS[alert.provider] ?? alert.provider}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Provider Cards */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {data.providers.map((p) => {
          const hc = HEALTH_COLORS[p.healthStatus] ?? HEALTH_COLORS.fair;
          return (
            <Card key={p.provider} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {p.lastStatus === "success" ? (
                    <Wifi className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <p className="font-semibold">{PROVIDER_LABELS[p.provider] ?? p.provider}</p>
                    <p className="text-xs text-muted-foreground">
                      Last sync: {p.lastSync
                        ? new Date(p.lastSync).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "Never"}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${hc.bg} ${hc.text} ${hc.ring}`}>
                  {p.healthStatus}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center mb-4">
                <div>
                  <p className="text-lg font-bold">{(p.successRate * 100).toFixed(1)}%</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Success Rate</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{p.totalSyncs}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Total Syncs</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{(p.avgDurationMs / 1000).toFixed(1)}s</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Avg Duration</p>
                </div>
              </div>

              <ProgressBar value={p.healthScore} size="sm" showLabel={false} />
            </Card>
          );
        })}
      </div>

      {/* Sync History Chart */}
      {dailyChartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Daily Sync History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  }
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="success" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Success" />
                <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Failures */}
      {data.recentFailures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Recent Failures
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 font-medium text-muted-foreground">Provider</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Error</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentFailures.slice(0, 10).map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium">{PROVIDER_LABELS[f.provider] ?? f.provider}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-md truncate">{f.message ?? "Unknown error"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(f.startedAt).toLocaleString("en-US", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
