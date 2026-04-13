"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, PROVIDER_LABELS } from "@/lib/utils";
import {
  Armchair, Users, AlertTriangle, TrendingDown,
  CheckCircle, XCircle, ChevronDown, ChevronUp,
  DollarSign, Layers,
} from "lucide-react";
import { TOOLTIPS } from "@/lib/tooltip-content";
import { useTerminology } from "@/lib/terminology";

interface SeatData {
  period: { days: number };
  summary: {
    totalUsers: number;
    idleCount: number;
    lowUsageCount: number;
    moderateCount: number;
    highCount: number;
    multiProviderCount: number;
    avgUtilization: number;
    totalEstimatedSavings: number;
  };
  users: Array<{
    userId: string;
    name: string;
    email: string;
    department: string;
    team: string;
    providers: string[];
    totalCost: number;
    totalRequests: number;
    activeDays: number;
    lastActivity: string | null;
    linesAccepted: number;
    utilizationScore: number;
    acceptRate: number | null;
    isIdle: boolean;
    isLowUsage: boolean;
    engagementTier: "idle" | "low" | "moderate" | "high";
  }>;
  recommendations: Array<{
    type: string;
    severity: string;
    title: string;
    description: string;
    estimatedSavings: number;
    affectedUsers: number;
  }>;
  providerOverlap: Array<{
    userId: string;
    name: string;
    email: string;
    providers: string[];
    totalCost: number;
  }>;
}

const TIER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  idle: { bg: "bg-red-50", text: "text-red-600", label: "Idle" },
  low: { bg: "bg-amber-50", text: "text-amber-600", label: "Low" },
  moderate: { bg: "bg-blue-50", text: "text-blue-600", label: "Moderate" },
  high: { bg: "bg-emerald-50", text: "text-emerald-600", label: "Active" },
};

export default function SeatOptimizationPage() {
  const [data, setData] = useState<SeatData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const { t } = useTerminology();

  useEffect(() => {
    setLoading(true);
    api.getSeatOptimization(days)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div>
        <Header title={t("seat optimization")} description="Cross-provider utilization analysis and savings opportunities" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={8} />
      </div>
    );
  }

  if (!data) return null;
  const s = data.summary;

  const filteredUsers = filter === "all"
    ? data.users
    : data.users.filter((u) => u.engagementTier === filter);

  return (
    <div>
      <Header
        title={t("seat optimization")}
        description="Cross-provider utilization analysis and savings opportunities"
        action={
          <Select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            options={[
              { value: "7", label: "7 days" },
              { value: "14", label: "14 days" },
              { value: "30", label: "30 days" },
              { value: "60", label: "60 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          title={`Total ${t("seats")}`}
          value={s.totalUsers}
          subtitle={`${s.highCount} active · ${s.idleCount} idle`}
          icon={Users}
          tooltip={TOOLTIPS.totalSeats}
        />
        <StatCard
          title="Avg Utilization"
          value={`${(s.avgUtilization * 100).toFixed(0)}%`}
          subtitle="Across all users"
          icon={Armchair}
          tooltip={TOOLTIPS.avgUtilization}
        />
        <StatCard
          title="Potential Savings"
          value={formatCurrency(s.totalEstimatedSavings)}
          subtitle={`${data.recommendations.length} recommendations`}
          icon={DollarSign}
          tooltip={TOOLTIPS.potentialSavings}
        />
        <StatCard
          title="Multi-Provider Users"
          value={s.multiProviderCount}
          subtitle="Using 2+ providers"
          icon={Layers}
          tooltip={TOOLTIPS.multiProviderUsers}
        />
      </div>

      {/* Engagement Distribution */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle tooltip={TOOLTIPS.engagementDistribution}>Engagement Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {(["high", "moderate", "low", "idle"] as const).map((tier) => {
              const count = tier === "high" ? s.highCount : tier === "moderate" ? s.moderateCount : tier === "low" ? s.lowUsageCount : s.idleCount;
              const pct = s.totalUsers > 0 ? (count / s.totalUsers) * 100 : 0;
              const tc = TIER_COLORS[tier];
              return (
                <button
                  key={tier}
                  onClick={() => setFilter(filter === tier ? "all" : tier)}
                  className={`rounded-lg border p-3 text-center transition-all ${
                    filter === tier ? `${tc.bg} border-current ring-1 ring-current ${tc.text}` : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <p className={`text-2xl font-bold ${filter === tier ? tc.text : ""}`}>{count}</p>
                  <p className="text-xs font-medium mt-0.5">{tc.label}</p>
                  <p className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recommendations.map((rec) => (
              <div
                key={rec.type}
                className={`rounded-lg border p-4 cursor-pointer transition-all ${
                  rec.severity === "critical" ? "border-red-200 bg-red-50/50" : rec.severity === "warning" ? "border-amber-200 bg-amber-50/50" : "border-border"
                }`}
                onClick={() => setExpandedRec(expandedRec === rec.type ? null : rec.type)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {rec.severity === "critical" ? <XCircle className="h-4 w-4 text-red-500" /> :
                     rec.severity === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
                     <CheckCircle className="h-4 w-4 text-blue-500" />}
                    <span className="font-medium text-sm">{rec.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-emerald-600">
                      Save ~{formatCurrency(rec.estimatedSavings)}/mo
                    </span>
                    {expandedRec === rec.type ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
                {expandedRec === rec.type && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    <p>{rec.description}</p>
                    <p className="mt-1 text-xs">Affects {rec.affectedUsers} user{rec.affectedUsers !== 1 ? "s" : ""}</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* User Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            {filter === "all" ? `All ${t("users")}` : `${TIER_COLORS[filter]?.label} ${t("users")}`}
            <span className="text-muted-foreground font-normal ml-2">({filteredUsers.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Providers</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Cost</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Active Days</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Utilization</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Tier</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.slice(0, 50).map((u) => {
                  const tc = TIER_COLORS[u.engagementTier];
                  return (
                    <tr key={u.userId} className={`border-b border-border last:border-0 hover:bg-muted/30 ${u.isIdle ? "opacity-60" : ""}`}>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={u.name} size="sm" />
                          <div>
                            <p className="font-medium">{u.name}</p>
                            <p className="text-[11px] text-muted-foreground">{u.department}{u.team ? ` · ${u.team}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {u.providers.map((p) => (
                            <span key={p} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                              {PROVIDER_LABELS[p] ?? p}
                            </span>
                          ))}
                          {u.providers.length === 0 && <span className="text-[10px] text-muted-foreground">None</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(u.totalCost)}</td>
                      <td className="px-4 py-3 text-right">{u.activeDays}</td>
                      <td className="px-4 py-3 w-28">
                        <ProgressBar value={u.utilizationScore * 100} showLabel={false} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                          {tc.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Provider Users */}
      {data.providerOverlap.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Multi-Provider Users ({data.providerOverlap.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 font-medium text-muted-foreground">User</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Providers</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Combined Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providerOverlap.map((po) => (
                    <tr key={po.userId} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={po.name} size="sm" />
                          <div>
                            <p className="font-medium">{po.name}</p>
                            <p className="text-[11px] text-muted-foreground">{po.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {po.providers.map((p) => (
                            <span key={p} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              {PROVIDER_LABELS[p] ?? p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(po.totalCost)}</td>
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
