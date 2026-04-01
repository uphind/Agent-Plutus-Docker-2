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
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  Trophy, DollarSign, Code2, Clock, Users, TrendingUp,
  AlertTriangle, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";

interface RoiData {
  period: { days: number };
  company: {
    totalCost: number;
    totalRequests: number;
    linesAccepted: number;
    linesSuggested: number;
    acceptRate: number;
    costPerLine: number;
    estimatedHoursSaved: number;
    estimatedValueSaved: number;
    roiRatio: number;
    seatUtilization: number;
    totalSeats: number;
    activeSeats: number;
    idleSeats: number;
  };
  byDepartment: Array<{
    departmentId: string;
    department: string;
    totalCost: number;
    totalRequests: number;
    linesAccepted: number;
    linesSuggested: number;
    acceptRate: number;
    userCount: number;
    activeUsers: number;
    idleSeats: number;
    seatUtilization: number;
  }>;
  byUser: Array<{
    userId: string;
    name: string;
    email: string;
    department: string;
    team: string;
    totalCost: number;
    totalRequests: number;
    linesAccepted: number;
    linesSuggested: number;
    acceptRate: number;
    activeDays: number;
    seatUtilization: number;
    providersUsed: number;
    isIdle: boolean;
  }>;
  acceptRateTrend: Array<{
    date: string;
    acceptRate: number;
    linesAccepted: number;
    linesSuggested: number;
  }>;
}

type ViewLevel = "company" | "department" | "user";

export default function RoiPage() {
  const [data, setData] = useState<RoiData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewLevel>("company");

  useEffect(() => {
    setLoading(true);
    api.getRoi(days)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div>
        <Header title="ROI Dashboard" description="Return on AI investment across your organization" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={8} />
      </div>
    );
  }

  if (!data) return null;
  const c = data.company;

  return (
    <div>
      <Header
        title="ROI Dashboard"
        description="Return on AI investment across your organization"
        action={
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(["company", "department", "user"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 capitalize transition-colors ${
                    view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
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
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          title="ROI Ratio"
          value={`${c.roiRatio.toFixed(1)}x`}
          subtitle={`${formatCurrency(c.estimatedValueSaved)} value / ${formatCurrency(c.totalCost)} cost`}
          icon={Trophy}
        />
        <StatCard
          title="Estimated Hours Saved"
          value={formatNumber(Math.round(c.estimatedHoursSaved))}
          subtitle={`${formatCurrency(c.estimatedValueSaved)} estimated value`}
          icon={Clock}
        />
        <StatCard
          title="Acceptance Rate"
          value={`${(c.acceptRate * 100).toFixed(1)}%`}
          subtitle={`${formatNumber(c.linesAccepted)} lines accepted`}
          icon={Code2}
        />
        <StatCard
          title="Seat Utilization"
          value={`${(c.seatUtilization * 100).toFixed(0)}%`}
          subtitle={`${c.activeSeats}/${c.totalSeats} active · ${c.idleSeats} idle`}
          icon={Users}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <StatCard
          title="Cost per Accepted Line"
          value={c.costPerLine > 0 ? `$${c.costPerLine.toFixed(4)}` : "N/A"}
          subtitle="Lower is better"
          icon={DollarSign}
        />
        <StatCard
          title="Total AI Spend"
          value={formatCurrency(c.totalCost)}
          subtitle={`${formatNumber(c.totalRequests)} requests`}
          icon={DollarSign}
        />
      </div>

      {/* Acceptance Rate Trend */}
      {data.acceptRateTrend.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Acceptance Rate Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.acceptRateTrend} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="arGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  }
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  domain={[0, 1]}
                />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value) => [`${(Number(value) * 100).toFixed(1)}%`, "Accept Rate"]}
                />
                <Area
                  type="monotone"
                  dataKey="acceptRate"
                  stroke="#10b981"
                  fill="url(#arGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Department View */}
      {view === "department" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>ROI by Department</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 font-medium text-muted-foreground">Department</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Cost</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Lines Accepted</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Accept Rate</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Seats</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Utilization</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Idle</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDepartment.map((d) => (
                    <tr key={d.departmentId} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-3 font-medium">{d.department}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(d.totalCost)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(d.linesAccepted)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={d.acceptRate > 0.3 ? "text-emerald-600" : d.acceptRate > 0.15 ? "text-amber-600" : "text-red-500"}>
                          {(d.acceptRate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{d.activeUsers}/{d.userCount}</td>
                      <td className="px-4 py-3 w-32">
                        <ProgressBar value={d.seatUtilization * 100} showLabel={false} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {d.idleSeats > 0 && (
                          <span className="text-amber-600 flex items-center justify-end gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {d.idleSeats}
                          </span>
                        )}
                        {d.idleSeats === 0 && <span className="text-muted-foreground">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User View */}
      {view === "user" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>ROI by User</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 font-medium text-muted-foreground">User</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Department</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Cost</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Lines</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Accept Rate</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">Active Days</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byUser.map((u) => (
                    <tr key={u.userId} className={`border-b border-border last:border-0 hover:bg-muted/30 ${u.isIdle ? "opacity-60" : ""}`}>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={u.name} size="sm" />
                          <div>
                            <p className="font-medium">{u.name}</p>
                            <p className="text-[11px] text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.department}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(u.totalCost)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(u.linesAccepted)}</td>
                      <td className="px-4 py-3 text-right">
                        {u.linesAccepted > 0 ? `${(u.acceptRate * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">{u.activeDays}</td>
                      <td className="px-4 py-3">
                        {u.isIdle ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" /> Idle
                          </span>
                        ) : u.seatUtilization > 0.6 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <ArrowUpRight className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                            <ArrowDownRight className="h-3 w-3" /> Low
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company View - Idle Seats & Department Breakdown */}
      {view === "company" && (
        <>
          {data.byDepartment.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Department Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.byDepartment} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value) => [formatCurrency(Number(value)), "Cost"]}
                    />
                    <Bar dataKey="totalCost" radius={[4, 4, 0, 0]}>
                      {data.byDepartment.map((_, i) => (
                        <Cell key={i} fill={["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"][i % 8]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {c.idleSeats > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Idle Seats ({c.idleSeats})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-6 py-3 font-medium text-muted-foreground">User</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Department</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">Team</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byUser.filter((u) => u.isIdle).slice(0, 20).map((u) => (
                        <tr key={u.userId} className="border-b border-border last:border-0">
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <Avatar name={u.name} size="sm" />
                              <div>
                                <p className="font-medium">{u.name}</p>
                                <p className="text-[11px] text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{u.department}</td>
                          <td className="px-4 py-3 text-muted-foreground">{u.team || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
