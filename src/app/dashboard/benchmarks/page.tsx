"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, PROVIDER_LABELS } from "@/lib/utils";
import {
  BarChart3, Users, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Minus, Info, Lock,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface BenchmarkData {
  companySize: string;
  activeUsers: number;
  yourMetrics: {
    costPerDev: number;
    acceptRate: number;
    costPerLine: number;
    totalCost: number;
    providerMix: Record<string, number>;
  };
  benchmarks: {
    costPerDev: number;
    acceptRate: number;
    costPerLine: number;
    providerMix: Record<string, number>;
    sampleSize: number;
    isRealData: boolean;
  };
  comparisons: {
    costPerDev: { delta: number; percentDiff: number; assessment: string };
    acceptRate: { delta: number; percentDiff: number; assessment: string };
  };
  insights: string[];
}

function ComparisonIndicator({ assessment, inverse }: { assessment: string; inverse?: boolean }) {
  const isGood = inverse
    ? ["above", "slightly above"].includes(assessment)
    : ["below", "slightly below"].includes(assessment);
  const isBad = inverse
    ? ["below", "slightly below"].includes(assessment)
    : ["above", "slightly above"].includes(assessment);

  if (isGood) return <ArrowDownRight className="h-4 w-4 text-emerald-500" />;
  if (isBad) return <ArrowUpRight className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export default function BenchmarksPage() {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getBenchmarks()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <Header title="Benchmarks" description="Compare your AI usage against industry peers" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const providerCompare = Object.entries(data.yourMetrics.providerMix).map(([provider, share]) => ({
    provider: PROVIDER_LABELS[provider] ?? provider,
    yours: share * 100,
    benchmark: (data.benchmarks.providerMix[provider] ?? 0) * 100,
  }));

  return (
    <div>
      <Header
        title="Benchmarks"
        description="Compare your AI usage against industry peers"
      />

      {!data.benchmarks.isRealData && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="py-4">
            <p className="text-sm text-blue-800 flex items-center gap-2">
              <Info className="h-4 w-4" />
              <span>
                Benchmarks use estimated industry data. As more organizations join Agent Plutus,
                benchmarks will be powered by real anonymized data from peer companies.
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Company Info */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
        <StatCard
          title="Company Size Tier"
          value={`${data.companySize} employees`}
          subtitle={`${data.activeUsers} active AI users`}
          icon={Users}
        />
        <StatCard
          title="30-Day AI Spend"
          value={formatCurrency(data.yourMetrics.totalCost)}
          subtitle={`${formatCurrency(data.yourMetrics.costPerDev)}/developer`}
          icon={BarChart3}
        />
        <StatCard
          title="Benchmark Sample"
          value={data.benchmarks.isRealData ? `${data.benchmarks.sampleSize} companies` : "Industry est."}
          subtitle={data.benchmarks.isRealData ? "Anonymized peer data" : "Growing with platform adoption"}
          icon={Lock}
        />
      </div>

      {/* Metric Comparisons */}
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cost per Developer</p>
            <ComparisonIndicator assessment={data.comparisons.costPerDev.assessment} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Yours</p>
              <p className="text-xl font-bold">{formatCurrency(data.yourMetrics.costPerDev)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Median</p>
              <p className="text-xl font-bold text-muted-foreground">{formatCurrency(data.benchmarks.costPerDev)}</p>
            </div>
          </div>
          <p className={`text-xs mt-3 font-medium ${
            data.comparisons.costPerDev.percentDiff > 0 ? "text-red-500" : "text-emerald-600"
          }`}>
            {data.comparisons.costPerDev.percentDiff > 0 ? "+" : ""}
            {data.comparisons.costPerDev.percentDiff.toFixed(0)}% vs median
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acceptance Rate</p>
            <ComparisonIndicator assessment={data.comparisons.acceptRate.assessment} inverse />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Yours</p>
              <p className="text-xl font-bold">{(data.yourMetrics.acceptRate * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Median</p>
              <p className="text-xl font-bold text-muted-foreground">{(data.benchmarks.acceptRate * 100).toFixed(1)}%</p>
            </div>
          </div>
          <p className={`text-xs mt-3 font-medium ${
            data.comparisons.acceptRate.percentDiff > 0 ? "text-emerald-600" : "text-red-500"
          }`}>
            {data.comparisons.acceptRate.percentDiff > 0 ? "+" : ""}
            {data.comparisons.acceptRate.percentDiff.toFixed(0)}% vs median
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cost per Accepted Line</p>
            <ComparisonIndicator assessment="on par" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Yours</p>
              <p className="text-xl font-bold">${data.yourMetrics.costPerLine.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Median</p>
              <p className="text-xl font-bold text-muted-foreground">${data.benchmarks.costPerLine.toFixed(4)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Provider Mix Comparison */}
      {providerCompare.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Provider Mix vs Benchmark
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={providerCompare} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="provider" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value) => [`${Number(value).toFixed(1)}%`]}
                />
                <Bar dataKey="yours" name="Your Mix" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="benchmark" name="Benchmark" fill="#d1d5db" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      {data.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm">{insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
