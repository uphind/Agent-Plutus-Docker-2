"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import {
  Lightbulb, DollarSign, UserX, Zap, TrendingDown,
  ChevronRight, ChevronDown, Eye, EyeOff, PiggyBank, Sparkles,
} from "lucide-react";

interface Suggestion {
  id: string;
  category: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  estimatedSavings?: number;
  affectedEntities: Array<{ type: string; id: string; name: string }>;
  linkTo?: string;
}

interface SuggestionsData {
  suggestions: Suggestion[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    totalEstimatedSavings: number;
  };
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Lightbulb; bg: string; iconColor: string }> = {
  cost_optimization: { label: "Cost Optimization", icon: DollarSign, bg: "bg-emerald-500/10", iconColor: "#10b981" },
  budget_alerts: { label: "Budget Alerts", icon: TrendingDown, bg: "bg-amber-500/10", iconColor: "#f59e0b" },
  seat_management: { label: "Seat Management", icon: UserX, bg: "bg-sky-500/10", iconColor: "#0ea5e9" },
  efficiency: { label: "Efficiency", icon: Zap, bg: "bg-violet-500/10", iconColor: "#8b5cf6" },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-400",
  info: "bg-blue-400",
};

function getDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem("dismissed_suggestions") ?? "[]"));
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>) {
  localStorage.setItem("dismissed_suggestions", JSON.stringify([...ids]));
}

export default function SuggestionsPage() {
  const [data, setData] = useState<SuggestionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissedState] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/suggestions");
      if (!res.ok) throw new Error(`Failed to load suggestions (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); setDismissedState(getDismissed()); }, [fetchData]);

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissedState(next);
    persistDismissed(next);
  };

  const handleRestore = (id: string) => {
    const next = new Set(dismissed);
    next.delete(id);
    setDismissedState(next);
    persistDismissed(next);
    if (next.size === 0) setShowDismissed(false);
  };

  const handleResetDismissed = () => {
    setDismissedState(new Set());
    persistDismissed(new Set());
    setShowDismissed(false);
  };

  const toggleCat = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const all = data?.suggestions ?? [];
  const visible = all.filter((s) => !dismissed.has(s.id));
  const dismissedItems = all.filter((s) => dismissed.has(s.id));
  const totalSavings = visible.reduce((s, v) => s + (v.estimatedSavings ?? 0), 0);
  const actionableCount = visible.filter((s) => s.severity !== "info").length;
  const topOpportunity = visible.filter((s) => (s.estimatedSavings ?? 0) > 0).sort((a, b) => (b.estimatedSavings ?? 0) - (a.estimatedSavings ?? 0))[0];

  const grouped = new Map<string, Suggestion[]>();
  for (const s of visible) {
    if (!grouped.has(s.category)) grouped.set(s.category, []);
    grouped.get(s.category)!.push(s);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Header title="Suggestions" description="Actionable recommendations to optimize your AI spend" />
        <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Header title="Suggestions" description="Actionable recommendations to optimize your AI spend" />
        <Card><CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-destructive font-medium">{error}</p>
          <button onClick={fetchData} className="mt-3 text-xs text-brand hover:underline">Try again</button>
        </CardContent></Card>
      </div>
    );
  }

  if (!data || visible.length === 0) {
    return (
      <div className="space-y-6">
        <Header title="Suggestions" description="Actionable recommendations to optimize your AI spend"
          action={dismissed.size > 0 ? (
            <button onClick={handleResetDismissed} className="text-sm text-brand hover:underline flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Restore all ({dismissed.size})
            </button>
          ) : undefined}
        />
        <Card><CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
            <Lightbulb className="h-7 w-7 text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold mb-1">All optimized</h2>
          <p className="text-sm text-muted-foreground max-w-sm">No recommendations right now. Your AI spend looks well-managed.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header title="Suggestions" description="Actionable recommendations to optimize your AI spend"
        action={dismissed.size > 0 ? (
          <button onClick={() => setShowDismissed(!showDismissed)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
            {showDismissed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showDismissed ? "Hide" : "Show"} dismissed ({dismissed.size})
          </button>
        ) : undefined}
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Potential Savings" value={formatCurrency(totalSavings)} subtitle="estimated per month" icon={PiggyBank} />
        <StatCard title="Suggestions" value={String(visible.length)} subtitle={`${actionableCount} actionable`} icon={Lightbulb} />
        <StatCard
          title="Top Opportunity"
          value={topOpportunity ? (
            <span className="text-emerald-600">{formatCurrency(topOpportunity.estimatedSavings ?? 0)}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
          ) : "—"}
          subtitle={topOpportunity ? topOpportunity.title : "No savings identified"}
          icon={Sparkles}
        />
      </div>

      {/* Grouped tables */}
      {Array.from(grouped.entries()).map(([category, items]) => {
        const meta = CATEGORY_META[category] ?? { label: category, icon: Lightbulb, bg: "bg-gray-500/10", iconColor: "#6b7280" };
        const CatIcon = meta.icon;
        const isOpen = !collapsed.has(category);
        const catSavings = items.reduce((s, i) => s + (i.estimatedSavings ?? 0), 0);

        return (
          <Card key={category} className="overflow-hidden">
            <button
              onClick={() => toggleCat(category)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
            >
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
                <CatIcon className="h-4 w-4" style={{ color: meta.iconColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{meta.label}</p>
                {catSavings > 0 && (
                  <p className="text-[11px] text-emerald-600 font-medium">{formatCurrency(catSavings)} potential savings</p>
                )}
              </div>
              <Badge variant="outline">{items.length}</Badge>
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>

            {isOpen && (
              <div className="border-t border-border overflow-x-auto">
                <table className="w-full min-w-[600px]" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "24px" }} />
                    <col />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "90px" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" />
                      <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recommendation</th>
                      <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Affected</th>
                      <th className="px-5 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. Savings</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s) => {
                      const dot = SEVERITY_DOT[s.severity] ?? "bg-gray-400";
                      const hasSavings = (s.estimatedSavings ?? 0) > 0;
                      return (
                        <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors group">
                          <td className="pl-5 py-3">
                            <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                          </td>
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium">{s.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {s.affectedEntities.slice(0, 3).map((e) => (
                                <span key={e.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted whitespace-nowrap">{e.name}</span>
                              ))}
                              {s.affectedEntities.length > 3 && (
                                <MoreChips items={s.affectedEntities.slice(3)} />
                              )}
                              {s.affectedEntities.length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {hasSavings ? (
                              <span className="text-sm font-semibold text-emerald-600 tabular-nums">{formatCurrency(s.estimatedSavings!)}<span className="text-[10px] font-normal text-muted-foreground">/mo</span></span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {s.linkTo && (
                                <Link href={s.linkTo} className="text-muted-foreground hover:text-brand transition-colors" title="View details">
                                  <ChevronRight className="h-4 w-4" />
                                </Link>
                              )}
                              <button
                                onClick={() => handleDismiss(s.id)}
                                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors sm:opacity-0 sm:group-hover:opacity-100 px-1.5 py-0.5 rounded hover:bg-muted"
                              >
                                Dismiss
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

      {/* Dismissed */}
      {showDismissed && dismissedItems.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dismissed</p>
            <button onClick={handleResetDismissed} className="text-[10px] text-brand hover:underline">Restore all</button>
          </div>
          <table className="w-full">
            <tbody>
              {dismissedItems.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors opacity-50 hover:opacity-100">
                  <td className="px-5 py-2.5 text-sm text-muted-foreground">{s.title}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => handleRestore(s.id)} className="text-[10px] text-brand hover:underline">Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

    </div>
  );
}

function MoreChips({ items }: { items: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = items.length * 30 + 16;
    const above = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    setPos({
      top: above ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
      left: rect.left,
    });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (popRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-[10px] font-medium text-brand cursor-default px-1.5 py-0.5 rounded hover:bg-brand/5 transition-colors"
      >
        +{items.length}
      </span>
      {open && pos && (
        <div
          ref={popRef}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="fixed z-[9999] border border-border rounded-lg py-1.5 px-1.5 animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ top: pos.top, left: pos.left, backgroundColor: "#ffffff", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}
        >
          <div className="flex items-center gap-1 flex-wrap max-w-[280px]">
            {items.map((e) => (
              <span key={e.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted whitespace-nowrap">
                {e.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
