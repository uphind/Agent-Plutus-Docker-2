"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard-api";
import { formatCurrency, formatNumber, PROVIDER_LABELS } from "@/lib/utils";
import { Receipt, Download, Building2, DollarSign, FileSpreadsheet, AlertCircle } from "lucide-react";

interface ChargebackData {
  month: string;
  totalCost: number;
  lineItems: Array<{
    departmentId: string;
    department: string;
    costCenter: string;
    glCode: string;
    provider: string;
    model: string;
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    userCount: number;
  }>;
  unassigned: Array<{
    provider: string;
    model: string;
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    userCount: number;
  }>;
  byCostCenter: Array<{
    costCenter: string;
    glCode: string;
    department: string;
    totalCost: number;
    lineItems: Array<{
      provider: string;
      model: string;
      totalCost: number;
      totalTokens: number;
      totalRequests: number;
      userCount: number;
    }>;
  }>;
  departments: Array<{
    id: string;
    name: string;
    cost_center: string;
    gl_code: string;
    user_count: number;
  }>;
}

function getMonthOptions(): Array<{ value: string; label: string }> {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    options.push({ value: val, label });
  }
  return options;
}

export default function ChargebackPage() {
  const [data, setData] = useState<ChargebackData | null>(null);
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getChargeback(month)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [month]);

  const handleExportCsv = useCallback(() => {
    if (!data) return;

    const headers = ["Cost Center", "GL Code", "Department", "Provider", "Model", "Users", "Tokens", "Requests", "Cost (USD)"];
    const rows = data.lineItems.map((li) => [
      li.costCenter || "—",
      li.glCode || "—",
      `"${li.department}"`,
      PROVIDER_LABELS[li.provider] ?? li.provider,
      `"${li.model}"`,
      li.userCount,
      li.totalTokens,
      li.totalRequests,
      li.totalCost.toFixed(6),
    ]);

    if (data.unassigned.length > 0) {
      for (const u of data.unassigned) {
        rows.push([
          "UNASSIGNED", "", "Unassigned",
          PROVIDER_LABELS[u.provider] ?? u.provider,
          `"${u.model}"`,
          u.userCount,
          u.totalTokens,
          u.totalRequests,
          u.totalCost.toFixed(6),
        ]);
      }
    }

    rows.push(["", "", "", "", "", "", "", "TOTAL", data.totalCost.toFixed(2)]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chargeback-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, month]);

  if (loading) {
    return (
      <div>
        <Header title="Chargeback Reports" description="Internal cost allocation by department and cost center" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Chargeback Reports" description="Internal cost allocation by department and cost center" />
        <Card className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const deptCount = new Set(data.lineItems.map((li) => li.departmentId)).size;
  const hasCostCenters = data.lineItems.some((li) => li.costCenter);

  return (
    <div>
      <Header
        title="Chargeback Reports"
        description="Internal cost allocation by department and cost center"
        action={
          <div className="flex items-center gap-3">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={getMonthOptions()}
            />
            <Button variant="secondary" size="sm" onClick={handleExportCsv}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
        <StatCard
          title="Total Cost"
          value={formatCurrency(data.totalCost)}
          subtitle={`${data.lineItems.length} line items`}
          icon={DollarSign}
        />
        <StatCard
          title="Departments"
          value={deptCount}
          subtitle={hasCostCenters ? "With cost centers" : "No cost centers set"}
          icon={Building2}
        />
        <StatCard
          title="Unassigned Cost"
          value={formatCurrency(data.unassigned.reduce((s, u) => s + u.totalCost, 0))}
          subtitle={`${data.unassigned.length} items not allocated`}
          icon={Receipt}
        />
      </div>

      {/* Cost Center Configuration */}
      {!hasCostCenters && data.departments.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50">
          <CardContent className="py-4">
            <p className="text-sm text-amber-800 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span>
                <strong>Tip:</strong> Set cost center and GL code on departments for proper financial system integration.
                Go to Settings to configure.
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* By Cost Center */}
      {data.byCostCenter.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              By Cost Center
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.byCostCenter.map((cc, idx) => (
              <div key={idx} className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{cc.department}</span>
                    {cc.costCenter && (
                      <span className="text-xs text-muted-foreground ml-2">
                        CC: {cc.costCenter} {cc.glCode && `· GL: ${cc.glCode}`}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-sm">{formatCurrency(cc.totalCost)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-2 font-medium text-muted-foreground">Provider</th>
                      <th className="px-4 py-2 font-medium text-muted-foreground">Model</th>
                      <th className="px-4 py-2 font-medium text-muted-foreground text-right">Users</th>
                      <th className="px-4 py-2 font-medium text-muted-foreground text-right">Tokens</th>
                      <th className="px-4 py-2 font-medium text-muted-foreground text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cc.lineItems.map((li, liIdx) => (
                      <tr key={liIdx} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">{PROVIDER_LABELS[li.provider] ?? li.provider}</td>
                        <td className="px-4 py-2 text-muted-foreground">{li.model}</td>
                        <td className="px-4 py-2 text-right">{li.userCount}</td>
                        <td className="px-4 py-2 text-right">{formatNumber(li.totalTokens)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(li.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Full Line Items */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>All Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">Department</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Cost Center</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">GL Code</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Provider</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Model</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Users</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Tokens</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.lineItems.map((li, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-6 py-3 font-medium">{li.department}</td>
                    <td className="px-4 py-3 text-muted-foreground">{li.costCenter || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{li.glCode || "—"}</td>
                    <td className="px-4 py-3">{PROVIDER_LABELS[li.provider] ?? li.provider}</td>
                    <td className="px-4 py-3 text-muted-foreground">{li.model}</td>
                    <td className="px-4 py-3 text-right">{li.userCount}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(li.totalTokens)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(li.totalCost)}</td>
                  </tr>
                ))}
                {data.unassigned.map((u, i) => (
                  <tr key={`u-${i}`} className="border-b border-border last:border-0 bg-amber-50/30">
                    <td className="px-6 py-3 text-muted-foreground italic">Unassigned</td>
                    <td className="px-4 py-3 text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-muted-foreground">—</td>
                    <td className="px-4 py-3">{PROVIDER_LABELS[u.provider] ?? u.provider}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.model}</td>
                    <td className="px-4 py-3 text-right">{u.userCount}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(u.totalTokens)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(u.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-6 py-3" colSpan={7}>Total</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(data.totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
