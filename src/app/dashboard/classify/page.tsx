"use client";

import { useCallback, useRef, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  Upload, FileText, X, Loader2, Download, PiggyBank,
  DollarSign, BarChart3, TrendingDown, ChevronDown,
  ChevronUp, Users, ArrowRight,
} from "lucide-react";

interface RecommendedRow {
  user_email: string;
  user_name: string;
  department: string;
  team: string;
  provider: string;
  model: string;
  total_requests: number;
  total_input: number;
  total_output: number;
  total_cost_usd: number;
  active_days: number;
  requests_per_day: number;
  avg_input: number;
  avg_output: number;
  ratio: number;
  model_tier: number;
  cache_rate: number;
  category: string;
  recommendation_global: string;
  is_cheaper_global: boolean;
  est_savings_global_usd: number | null;
  recommendation_same_vendor: string;
  is_cheaper_same_vendor: boolean;
  est_savings_same_vendor_usd: number | null;
  explanation: string;
  why_cheaper_plain_english: string;
}

interface ClassifySummary {
  totalRows: number;
  totalCost: number;
  estSavingsGlobal: number;
  estSavingsSameVendor: number;
  forecastCostGlobal: number;
  savingPctGlobal: number;
  vendorsDetected: string[];
  modelsDetected: string[];
  categoryCounts: Record<string, number>;
}

interface ClassifyResult {
  rows: RecommendedRow[];
  summary: ClassifySummary;
}

type SortKey = "user_name" | "category" | "model" | "total_cost_usd" | "est_savings_global_usd" | "est_savings_same_vendor_usd";

const CATEGORY_COLORS: Record<string, string> = {
  "\u{1F9D1}\u200D\u{1F4BB} Power / Technical": "bg-indigo-500/10 text-indigo-700",
  "\u270D\uFE0F Content Generator": "bg-amber-500/10 text-amber-700",
  "\u{1F4AC} Conversational": "bg-sky-500/10 text-sky-700",
  "\u{1F50D} Lookup / Q&A": "bg-emerald-500/10 text-emerald-700",
  "\u{1F9EA} Explorer": "bg-violet-500/10 text-violet-700",
};

export default function ClassifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("est_savings_global_usd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith(".json") && !name.endsWith(".csv")) {
      setError("Please upload a JSON or CSV file");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const classify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/classify", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Classification failed" }));
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = async () => {
    if (!file) return;
    setDownloading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/report", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Report generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-usage-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setFilterCategory("all");
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortDir === "desc" ? <ChevronDown className="h-3 w-3 inline ml-0.5" /> : <ChevronUp className="h-3 w-3 inline ml-0.5" />
    ) : null;

  const sortedRows = result
    ? [...result.rows]
        .filter((r) => filterCategory === "all" || r.category === filterCategory)
        .sort((a, b) => {
          const dir = sortDir === "asc" ? 1 : -1;
          const av = a[sortKey] ?? 0;
          const bv = b[sortKey] ?? 0;
          if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
          return ((av as number) - (bv as number)) * dir;
        })
    : [];

  return (
    <div className="space-y-5">
      <Header
        title="AI Usage Classifier"
        description="Upload usage data to classify users and discover cost optimization opportunities"
        action={
          result ? (
            <button
              onClick={reset}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <Upload className="h-3.5 w-3.5" /> New analysis
            </button>
          ) : undefined
        }
      />

      {!result && (
        <Card>
          <CardContent className="py-12">
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer ${
                dragActive
                  ? "border-brand bg-brand/5"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".json,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium mb-1">
                Drop your usage file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Supports JSON and CSV files with AI API usage logs
              </p>
            </div>

            {file && (
              <div className="mt-6 flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={classify}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                    {loading ? "Classifying..." : "Classify & Analyze"}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="mt-4 text-sm text-destructive text-center">{error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Current Cost"
              value={formatCurrency(result.summary.totalCost)}
              subtitle={`${result.summary.totalRows} user-model rows`}
              icon={DollarSign}
            />
            <StatCard
              title="Savings (Any Vendor)"
              value={
                <span className="text-emerald-600">
                  {formatCurrency(result.summary.estSavingsGlobal)}
                </span>
              }
              subtitle={`${result.summary.savingPctGlobal.toFixed(1)}% reduction`}
              icon={PiggyBank}
            />
            <StatCard
              title="Savings (Same Vendor)"
              value={
                <span className="text-emerald-600">
                  {formatCurrency(result.summary.estSavingsSameVendor)}
                </span>
              }
              subtitle="Staying within current vendor"
              icon={TrendingDown}
            />
            <StatCard
              title="Users Analyzed"
              value={String(new Set(result.rows.map((r) => r.user_email)).size)}
              subtitle={`${result.summary.vendorsDetected.length} vendors, ${result.summary.modelsDetected.length} models`}
              icon={Users}
            />
          </div>

          {/* Category Breakdown */}
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(result.summary.categoryCounts).map(([cat, count]) => (
              <Card
                key={cat}
                className={`p-4 cursor-pointer transition-all ${
                  filterCategory === cat
                    ? "ring-2 ring-primary"
                    : "hover:bg-muted/30"
                }`}
                onClick={() => setFilterCategory(filterCategory === cat ? "all" : cat)}
              >
                <p className="text-xs font-medium text-muted-foreground truncate">{cat}</p>
                <p className="text-xl font-bold mt-1">{count}</p>
                <p className="text-[10px] text-muted-foreground">user-model rows</p>
              </Card>
            ))}
          </div>

          {/* Actions bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {filterCategory !== "all" && (
                <Badge variant="outline" className="gap-1">
                  {filterCategory}
                  <button onClick={() => setFilterCategory("all")} className="ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {sortedRows.length} of {result.rows.length} rows
              </span>
            </div>
            <button
              onClick={downloadReport}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? "Generating..." : "Download Excel Report"}
            </button>
          </div>

          {/* Results Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-muted/30">
                    {([
                      ["User", "user_name"],
                      ["Category", "category"],
                      ["Model", "model"],
                      ["Cost", "total_cost_usd"],
                      ["Best (any vendor)", "est_savings_global_usd"],
                      ["Best (same vendor)", "est_savings_same_vendor_usd"],
                    ] as [string, SortKey][]).map(([label, key]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      >
                        {label}
                        <SortIcon col={key} />
                      </th>
                    ))}
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const rowKey = `${row.user_email}-${row.model}`;
                    const isExpanded = expandedRow === rowKey;
                    return (
                      <TableRow
                        key={rowKey}
                        row={row}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedRow(isExpanded ? null : rowKey)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function TableRow({
  row,
  isExpanded,
  onToggle,
}: {
  row: RecommendedRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const catClass = CATEGORY_COLORS[row.category] ?? "bg-gray-500/10 text-gray-700";

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
      >
        <td className="px-4 py-3">
          <p className="text-sm font-medium">{row.user_name || row.user_email}</p>
          <p className="text-[10px] text-muted-foreground">{row.user_email}</p>
        </td>
        <td className="px-4 py-3">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${catClass}`}>
            {row.category}
          </span>
        </td>
        <td className="px-4 py-3">
          <p className="text-sm">{row.model}</p>
          <p className="text-[10px] text-muted-foreground">{row.provider}</p>
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-sm font-medium tabular-nums">
            {formatCurrency(row.total_cost_usd)}
          </span>
        </td>
        <td className="px-4 py-3">
          {row.is_cheaper_global ? (
            <div>
              <div className="flex items-center gap-1 text-xs">
                <ArrowRight className="h-3 w-3 text-emerald-600" />
                <span className="truncate max-w-[180px]">{row.recommendation_global}</span>
              </div>
              <span className="text-xs font-semibold text-emerald-600 tabular-nums">
                {formatCurrency(row.est_savings_global_usd ?? 0)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{"\u2014"}</span>
          )}
        </td>
        <td className="px-4 py-3">
          {row.is_cheaper_same_vendor ? (
            <div>
              <div className="flex items-center gap-1 text-xs">
                <ArrowRight className="h-3 w-3 text-sky-600" />
                <span className="truncate max-w-[180px]">{row.recommendation_same_vendor}</span>
              </div>
              <span className="text-xs font-semibold text-sky-600 tabular-nums">
                {formatCurrency(row.est_savings_same_vendor_usd ?? 0)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{"\u2014"}</span>
          )}
        </td>
        <td className="px-4 py-3">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Usage Stats
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Total Requests: </span>
                    <span className="font-medium">{row.total_requests.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Active Days: </span>
                    <span className="font-medium">{row.active_days}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Req/Day: </span>
                    <span className="font-medium">{row.requests_per_day.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Input: </span>
                    <span className="font-medium">{Math.round(row.avg_input).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Output: </span>
                    <span className="font-medium">{Math.round(row.avg_output).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Output/Input: </span>
                    <span className="font-medium">{row.ratio.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Model Tier: </span>
                    <span className="font-medium">{row.model_tier}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cache Rate: </span>
                    <span className="font-medium">{(row.cache_rate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Analysis
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {row.why_cheaper_plain_english}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
