"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowDown,
  TrendingUp,
  ShieldAlert,
  Lightbulb,
  BarChart3,
  Users,
  Zap,
} from "lucide-react";

const providers = ["Anthropic", "OpenAI", "Cursor", "Gemini", "Vertex AI"];

/* ── Scroll-reveal hook ── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("landed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

/* ── Animated section wrapper ── */
function RevealSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useReveal();
  return (
    <div
      ref={ref}
      className={`reveal-section ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Demo chart: Department budget bar chart ── */
function BudgetChart() {
  const departments = [
    { name: "Engineering", spent: 12400, budget: 15000 },
    { name: "Data Science", spent: 18200, budget: 12000 },
    { name: "Product", spent: 6800, budget: 10000 },
    { name: "Marketing", spent: 3200, budget: 5000 },
    { name: "Support", spent: 4900, budget: 5000 },
  ];
  const maxVal = Math.max(
    ...departments.map((d) => Math.max(d.spent, d.budget))
  );

  return (
    <div className="w-full max-w-md space-y-4">
      {departments.map((d) => {
        const overBudget = d.spent > d.budget;
        return (
          <div key={d.name} className="space-y-1.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-foreground font-medium">{d.name}</span>
              <span
                className={
                  overBudget
                    ? "text-red-500 font-semibold"
                    : "text-muted-foreground"
                }
              >
                ${d.spent.toLocaleString()}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  / ${d.budget.toLocaleString()}
                </span>
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(d.budget / maxVal) * 100}%`,
                  backgroundColor: "rgba(22,22,231,0.08)",
                }}
              />
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${overBudget ? "bg-red-500" : "bg-brand"}`}
                style={{ width: `${(d.spent / maxVal) * 100}%` }}
              />
            </div>
            {overBudget && (
              <p className="text-[11px] text-red-500 flex items-center gap-1 font-medium">
                <ShieldAlert className="h-3 w-3" />
                {Math.round(((d.spent - d.budget) / d.budget) * 100)}% over
                budget
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Demo chart: Model usage donut (SVG) ── */
function ModelUsageChart() {
  const models = [
    { name: "Claude Sonnet 4", pct: 72, color: "#1616e7" },
    { name: "GPT-4o", pct: 14, color: "#64748b" },
    { name: "Gemini Pro", pct: 9, color: "#94a3b8" },
    { name: "Other", pct: 5, color: "#cbd5e1" },
  ];

  let cumulative = 0;
  const segments = models.map((m) => {
    const start = cumulative;
    cumulative += m.pct;
    return { ...m, start };
  });

  return (
    <div className="flex items-center gap-8">
      <div className="relative shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140">
          {segments.map((s) => {
            const r = 58;
            const circumference = 2 * Math.PI * r;
            const offset = circumference - (s.pct / 100) * circumference;
            const rotation = (s.start / 100) * 360 - 90;
            return (
              <circle
                key={s.name}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={offset}
                transform={`rotate(${rotation} 70 70)`}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">72%</span>
          <span className="text-[10px] text-muted-foreground">one model</span>
        </div>
      </div>
      <div className="space-y-2">
        {models.map((m) => (
          <div key={m.name} className="flex items-center gap-2.5 text-[13px]">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: m.color }}
            />
            <span className="text-muted-foreground">{m.name}</span>
            <span className="text-foreground font-semibold ml-auto">
              {m.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Demo chart: Cost trend sparkline (SVG) ── */
function CostTrendChart() {
  const before = [4200, 4800, 5100, 5600, 6200, 7100, 7800];
  const after = [7800, 7200, 6100, 5400, 4800, 4100, 3600];
  const all = [...before, ...after];
  const maxY = Math.max(...all);
  const minY = Math.min(...all) * 0.8;
  const w = 400;
  const h = 120;
  const toPoint = (val: number, i: number, total: number) => {
    const x = (i / (total - 1)) * w;
    const y = h - ((val - minY) / (maxY - minY)) * h;
    return `${x},${y}`;
  };
  const beforeLine = before
    .map((v, i) => toPoint(v, i, all.length))
    .join(" ");
  const afterLine = after
    .map((v, i) => toPoint(v, i + before.length, all.length))
    .join(" ");

  const midX = ((before.length - 1) / (all.length - 1)) * w;

  return (
    <div className="w-full max-w-md">
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h + 20}`}
        className="overflow-visible"
      >
        <polyline
          points={beforeLine}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
        <polyline
          points={afterLine}
          fill="none"
          stroke="#1616e7"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1={midX}
          y1="0"
          x2={midX}
          y2={h + 4}
          stroke="#64748b"
          strokeWidth="1"
          strokeDasharray="4,4"
          opacity="0.4"
        />
        <text
          x={midX}
          y={h + 16}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="10"
        >
          Plutus enabled
        </text>
      </svg>
      <div className="flex items-center gap-5 mt-4 text-[12px]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-[2px] rounded bg-red-500 opacity-70" />
          <span className="text-muted-foreground">Before</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-[2px] rounded bg-brand" />
          <span className="text-muted-foreground">After optimisation</span>
        </div>
        <span className="ml-auto text-green-600 font-bold flex items-center gap-1 text-[13px]">
          <TrendingUp className="h-3.5 w-3.5" />
          54% savings
        </span>
      </div>
    </div>
  );
}

/* ── Feature pill ── */
function FeaturePill({
  icon: Icon,
  text,
}: {
  icon: React.ElementType;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3.5 text-[13px] text-foreground shadow-sm">
      <Icon className="h-4 w-4 text-brand shrink-0" />
      {text}
    </div>
  );
}

export function LandingClient() {
  return (
    <div className="min-h-screen flex flex-col bg-sidebar text-white">
      <style jsx global>{`
        .reveal-section {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .reveal-section.landed {
          opacity: 1;
          transform: translateY(0);
        }
        .reveal-section .reveal-chart {
          opacity: 0;
          transform: translateX(30px);
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s,
            transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
        }
        .reveal-section.landed .reveal-chart {
          opacity: 1;
          transform: translateX(0);
        }
        .reveal-section .reveal-text {
          opacity: 0;
          transform: translateX(-30px);
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s,
            transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
        }
        .reveal-section.landed .reveal-text {
          opacity: 1;
          transform: translateX(0);
        }
        .reveal-section.flip .reveal-chart {
          transform: translateX(-30px);
        }
        .reveal-section.flip .reveal-text {
          transform: translateX(30px);
        }
        .reveal-section.flip.landed .reveal-chart,
        .reveal-section.flip.landed .reveal-text {
          transform: translateX(0);
        }
      `}</style>

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(22,22,231,0.12),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(22,22,231,0.08),transparent_60%)]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-10 h-14 shrink-0">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo/symbol.svg"
            alt="Agent Plutus"
            width={28}
            height={28}
            className="brightness-0 invert"
          />
          <Image
            src="/logo/text-white.svg"
            alt="Agent Plutus"
            width={120}
            height={24}
          />
        </div>

        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-[13px] font-semibold text-white transition-all hover:bg-brand-light active:scale-[0.97]"
        >
          Log In
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </nav>

      {/* Main content area */}
      <div className="relative z-10 flex-1 pr-3.5 pb-3.5 pl-3.5 lg:pl-3.5">
        <div className="bg-background rounded-2xl overflow-hidden">
          {/* ─── Hero ─── */}
          <section className="relative overflow-hidden">
            <div className="absolute -right-20 -top-20 opacity-[0.03] pointer-events-none select-none">
              <Image
                src="/logo/symbol.svg"
                alt=""
                width={500}
                height={500}
                aria-hidden="true"
              />
            </div>

            <div className="relative max-w-5xl mx-auto px-6 sm:px-10 pt-24 pb-20 lg:pt-32 lg:pb-24">
              <div className="flex flex-col items-center text-center">
                <div className="mb-8">
                  <Image
                    src="/logo/symbol.svg"
                    alt="Agent Plutus"
                    width={56}
                    height={56}
                  />
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] text-foreground mb-4">
                  Enterprise AI{" "}
                  <span className="text-brand">Cost Intelligence</span>
                </h1>

                <p className="text-sm sm:text-base text-muted-foreground max-w-lg mb-8 leading-relaxed">
                  Monitor, manage, and optimise your organisation&apos;s AI
                  spending across every provider, team, and user.
                </p>

                {/* Hero buttons */}
                <div className="flex items-center gap-3 mb-10">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-brand-light active:scale-[0.97] shadow-lg shadow-brand/20"
                  >
                    Log In
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <a
                    href="#insights"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-5 py-2.5 text-[13px] font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.97]"
                  >
                    Learn More
                    <ArrowDown className="h-3.5 w-3.5" />
                  </a>
                </div>

                {/* Provider tags */}
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground mr-1">
                    Integrates with
                  </span>
                  {providers.map((p) => (
                    <span
                      key={p}
                      className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ─── Section 1: Budget Alerts ─── */}
          <div id="insights" className="scroll-mt-8">
            <div className="max-w-6xl mx-auto px-6 sm:px-10">
              <div className="h-px bg-border" />
            </div>

            <RevealSection className="max-w-6xl mx-auto px-6 sm:px-10 py-20 lg:py-28">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="reveal-text">
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-4">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Budget Alerts
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 leading-tight">
                    Catch overages before
                    <br />
                    they compound
                  </h2>
                  <p className="text-[15px] text-muted-foreground leading-relaxed mb-6 max-w-md">
                    Set spending limits by department, team, or individual user.
                    When costs cross a threshold, the right stakeholders are
                    notified instantly — no more month-end surprises on your AI
                    bill.
                  </p>
                  <ul className="space-y-2.5 text-[13px] text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      </span>
                      Real-time alerts when budgets are exceeded
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      </span>
                      Configurable thresholds per department
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      </span>
                      Historical spend tracking and trend analysis
                    </li>
                  </ul>
                </div>
                <div className="reveal-chart flex justify-center lg:justify-end">
                  <div className="rounded-xl border border-border bg-card p-6 shadow-lg w-full max-w-lg">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-sm font-semibold text-foreground">
                        Department Budgets
                      </h3>
                      <span className="text-[11px] text-muted-foreground">
                        This month
                      </span>
                    </div>
                    <BudgetChart />
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>

          {/* ─── Section 2: Usage Insights ─── */}
          <div className="bg-muted/30">
            <div className="max-w-6xl mx-auto px-6 sm:px-10">
              <div className="h-px bg-border" />
            </div>

            <RevealSection className="flip max-w-6xl mx-auto px-6 sm:px-10 py-20 lg:py-28">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="reveal-chart order-2 lg:order-1 flex justify-center lg:justify-start">
                  <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-sm font-semibold text-foreground">
                        Model Distribution — J. Martinez
                      </h3>
                      <span className="text-[11px] text-muted-foreground">
                        Last 30 days
                      </span>
                    </div>
                    <ModelUsageChart />
                  </div>
                </div>
                <div className="reveal-text order-1 lg:order-2">
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-brand-subtle px-2.5 py-1 text-[11px] font-semibold text-brand uppercase tracking-wider mb-4">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Usage Insights
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 leading-tight">
                    Spot model concentration
                    <br />
                    risk early
                  </h2>
                  <p className="text-[15px] text-muted-foreground leading-relaxed mb-6 max-w-md">
                    When a developer relies on the same model for everything,
                    they may be overpaying for simple tasks or missing
                    better-suited alternatives. Agent Plutus surfaces these
                    patterns automatically.
                  </p>
                  <ul className="space-y-2.5 text-[13px] text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      </span>
                      Per-user model usage breakdown
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      </span>
                      AI-powered recommendations for cheaper alternatives
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      </span>
                      Team-level and org-level model analytics
                    </li>
                  </ul>
                </div>
              </div>
            </RevealSection>
          </div>

          {/* ─── Section 3: Cost Optimisation ─── */}
          <div className="max-w-6xl mx-auto px-6 sm:px-10">
            <div className="h-px bg-border" />
          </div>

          <RevealSection className="max-w-6xl mx-auto px-6 sm:px-10 py-20 lg:py-28">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <div className="reveal-text">
                <div className="inline-flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-1 text-[11px] font-semibold text-green-600 uppercase tracking-wider mb-4">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Cost Optimisation
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 leading-tight">
                  Prove the ROI of every
                  <br />
                  policy change
                </h2>
                <p className="text-[15px] text-muted-foreground leading-relaxed mb-6 max-w-md">
                  Compare spending before and after optimisation efforts. Agent
                  Plutus quantifies the dollar impact so you can demonstrate
                  value to leadership — not just claim it.
                </p>
                <ul className="space-y-2.5 text-[13px] text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-4 w-4 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    </span>
                    Before-and-after spend comparison
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-4 w-4 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    </span>
                    Automated savings calculation
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-4 w-4 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    </span>
                    Executive-ready reports and dashboards
                  </li>
                </ul>
              </div>
              <div className="reveal-chart flex justify-center lg:justify-end">
                <div className="rounded-xl border border-border bg-card p-6 shadow-lg w-full max-w-lg">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-semibold text-foreground">
                      Monthly AI Spend
                    </h3>
                    <span className="text-[11px] text-green-600 font-semibold">
                      $4,200 saved/mo
                    </span>
                  </div>
                  <CostTrendChart />
                </div>
              </div>
            </div>
          </RevealSection>

          {/* ─── Feature highlights ─── */}
          <div className="bg-muted/30">
            <div className="max-w-6xl mx-auto px-6 sm:px-10">
              <div className="h-px bg-border" />
            </div>

            <RevealSection className="max-w-5xl mx-auto px-6 sm:px-10 py-20 lg:py-24">
              <div className="text-center mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                  Everything in one place
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  No spreadsheets. No monthly exports. Real-time data from every
                  AI provider your organisation uses.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <FeaturePill
                  icon={BarChart3}
                  text="Per-user and per-team cost breakdown"
                />
                <FeaturePill
                  icon={ShieldAlert}
                  text="Anomaly detection and spend alerts"
                />
                <FeaturePill
                  icon={Users}
                  text="HR directory sync for attribution"
                />
                <FeaturePill
                  icon={Lightbulb}
                  text="AI-powered optimisation suggestions"
                />
                <FeaturePill
                  icon={Zap}
                  text="Automated syncing every 6 hours"
                />
                <FeaturePill
                  icon={TrendingUp}
                  text="Exportable reports and dashboards"
                />
              </div>
            </RevealSection>
          </div>

          {/* ─── CTA ─── */}
          <RevealSection className="max-w-5xl mx-auto px-6 sm:px-10 py-16 lg:py-20">
            <div className="rounded-xl bg-sidebar text-white p-8 sm:p-12 text-center">
              <h2 className="text-xl sm:text-2xl font-bold mb-2">
                Ready to take control of your AI spend?
              </h2>
              <p className="text-sm text-slate-300 mb-6 max-w-md mx-auto">
                Deploy on your own infrastructure in minutes. SSO login,
                encrypted credentials, no data leaves your network.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-brand-light active:scale-[0.97] shadow-lg shadow-brand/20"
              >
                Get Started
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </RevealSection>

          {/* Footer */}
          <footer className="border-t border-border px-6 sm:px-10 py-6">
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo/symbol.svg"
                  alt="Agent Plutus"
                  width={18}
                  height={18}
                  className="opacity-40"
                />
                <span className="text-[11px] text-muted-foreground">
                  &copy; {new Date().getFullYear()} Agent Plutus
                </span>
              </div>
              <a
                href="mailto:contact@agentplutus.com"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                contact@agentplutus.com
              </a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
