"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, PROVIDER_LABELS } from "@/lib/utils";
import {
  ScrollText, DollarSign, AlertTriangle, ArrowRight,
  TrendingUp, ChevronDown, ChevronUp, Zap,
} from "lucide-react";

interface ContractData {
  providerSpend: Array<{ provider: string; monthly_spend: number }>;
  tierAlerts: Array<{
    provider: string;
    currentSpend: number;
    currentTier: string | null;
    nextTier: string | null;
    nextThreshold: number | null;
    potentialDiscount: string | null;
  }>;
  substitutionAdvisory: Array<{
    currentModel: string;
    replacementModel: string;
    currentCost: number;
    potentialSavings: number;
    costReductionPct: number;
    qualityImpactPct: number;
    requestCount: number;
  }>;
  spendProjections: Array<{
    provider: string;
    currentMonthly: number;
    previousMonthly: number;
    monthlyGrowthRate: number;
    projected3m: number;
    projected6m: number;
    projected12m: number;
  }>;
  totalPotentialSavings: number;
}

export default function ContractIntelPage() {
  const [data, setData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getContractIntel()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <Header title="Contract Intelligence" description="Provider pricing optimization and contract advisory" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    );
  }

  if (!data) return null;

  const totalMonthly = data.providerSpend.reduce((s, p) => s + p.monthly_spend, 0);

  return (
    <div>
      <Header
        title="Contract Intelligence"
        description="Provider pricing optimization and contract advisory"
      />

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
        <StatCard
          title="Monthly AI Spend"
          value={formatCurrency(totalMonthly)}
          subtitle={`${data.providerSpend.length} providers`}
          icon={DollarSign}
        />
        <StatCard
          title="Potential Savings"
          value={formatCurrency(data.totalPotentialSavings)}
          subtitle="From model substitutions"
          icon={Zap}
        />
        <StatCard
          title="Tier Alerts"
          value={data.tierAlerts.length}
          subtitle="Discount thresholds nearby"
          icon={AlertTriangle}
        />
      </div>

      {/* Tier Alerts */}
      {data.tierAlerts.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Discount Tier Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.tierAlerts.map((ta) => (
              <div key={ta.provider} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{PROVIDER_LABELS[ta.provider] ?? ta.provider}</span>
                  <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Near next tier
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Current spend</p>
                    <p className="font-semibold">{formatCurrency(ta.currentSpend)}/mo</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Next tier threshold</p>
                    <p className="font-semibold">{formatCurrency(ta.nextThreshold ?? 0)}/mo</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-muted-foreground">Potential discount</p>
                    <p className="font-semibold text-emerald-600">{ta.potentialDiscount}</p>
                  </div>
                </div>
                {ta.currentTier && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Current tier: {ta.currentTier} → Next: {ta.nextTier}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Model Substitution Advisory */}
      {data.substitutionAdvisory.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Model Substitution Advisory
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.substitutionAdvisory.map((sa) => (
              <div
                key={sa.currentModel}
                className="rounded-lg border border-border p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedSub(expandedSub === sa.currentModel ? null : sa.currentModel)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">{sa.currentModel}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" />
                        {sa.replacementModel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-600">
                        Save {formatCurrency(sa.potentialSavings)}/mo
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {sa.costReductionPct}% cost reduction
                      </p>
                    </div>
                    {expandedSub === sa.currentModel
                      ? <ChevronUp className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
                {expandedSub === sa.currentModel && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Current Cost</p>
                      <p className="font-medium">{formatCurrency(sa.currentCost)}/mo</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Request Count</p>
                      <p className="font-medium">{sa.requestCount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Quality Impact</p>
                      <p className="font-medium text-amber-600">~{sa.qualityImpactPct}% lower</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Spend Projections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Spend Projections for Contract Negotiation
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">Provider</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Current /mo</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Growth</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">3-Month</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">6-Month</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">12-Month</th>
                </tr>
              </thead>
              <tbody>
                {data.spendProjections.map((sp) => (
                  <tr key={sp.provider} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-6 py-3 font-medium">{PROVIDER_LABELS[sp.provider] ?? sp.provider}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(sp.currentMonthly)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={sp.monthlyGrowthRate > 0 ? "text-red-500" : "text-emerald-600"}>
                        {sp.monthlyGrowthRate >= 0 ? "+" : ""}{(sp.monthlyGrowthRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(sp.projected3m)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(sp.projected6m)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(sp.projected12m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
