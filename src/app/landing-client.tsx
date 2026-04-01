"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  BarChart3,
  Users,
  Shield,
  Zap,
  ArrowRight,
  Lock,
  Mail,
  Building2,
  TrendingUp,
  Boxes,
} from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "Usage Analytics",
    desc: "Real-time dashboards and historical trends across every AI provider.",
  },
  {
    icon: Users,
    title: "Team Management",
    desc: "Per-user and per-team consumption tracking with smart allocation.",
  },
  {
    icon: Shield,
    title: "Budget Controls",
    desc: "Automated spending limits and alerts before costs spiral.",
  },
  {
    icon: Zap,
    title: "Real-time Sync",
    desc: "Automatic data ingestion from all major AI providers.",
  },
  {
    icon: Building2,
    title: "Department View",
    desc: "Organisational hierarchy with drill-down cost breakdowns.",
  },
  {
    icon: Boxes,
    title: "Model Analytics",
    desc: "Compare cost-efficiency across models and providers.",
  },
];

const providers = ["Anthropic", "OpenAI", "Cursor", "Gemini", "Vertex AI"];

export function LandingClient() {
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-sidebar text-white overflow-hidden">
      {/* Sidebar-style radial gradients — same as dashboard */}
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

        <div className="flex items-center gap-2">
          <a
            href="mailto:contact@agentplutus.com"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Mail className="h-3.5 w-3.5" />
            Contact Us
          </a>

          <div className="relative">
            <button
              onClick={() => setShowComingSoon((v) => !v)}
              onBlur={() => setShowComingSoon(false)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors cursor-default"
            >
              <Lock className="h-3.5 w-3.5" />
              Log In
            </button>
            {showComingSoon && (
              <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-900 shadow-lg z-50">
                Coming Soon
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-white" />
              </div>
            )}
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-[13px] font-semibold text-white transition-all hover:bg-brand-light active:scale-[0.97]"
          >
            View Demo
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      {/* Main content area — mirrors dashboard shell layout */}
      <div className="relative z-10 flex-1 min-h-0 pr-3.5 pb-3.5 pl-3.5 lg:pl-3.5">
        <div className="h-full bg-background rounded-2xl overflow-y-auto">

          {/* Hero */}
          <section className="relative overflow-hidden">
            {/* Faint symbol watermark */}
            <div className="absolute -right-20 -top-20 opacity-[0.03] pointer-events-none select-none">
              <Image
                src="/logo/symbol.svg"
                alt=""
                width={500}
                height={500}
                aria-hidden="true"
              />
            </div>

            <div className="relative max-w-5xl mx-auto px-6 sm:px-10 pt-20 pb-16 lg:pt-28 lg:pb-20">
              <div className="flex flex-col items-center text-center">
                {/* Logo mark */}
                <div className="mb-8">
                  <Image
                    src="/logo/symbol.svg"
                    alt="Agent Plutus"
                    width={56}
                    height={56}
                  />
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3.5 py-1 text-[11px] font-medium text-muted-foreground mb-6">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live demo available
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] text-foreground mb-4">
                  Enterprise AI{" "}
                  <span className="text-brand">Cost Intelligence</span>
                </h1>

                <p className="text-sm sm:text-base text-muted-foreground max-w-lg mb-10 leading-relaxed">
                  Monitor, manage, and optimise your organisation&apos;s AI
                  spending across every provider, team, and user.
                </p>

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

          {/* Divider */}
          <div className="max-w-5xl mx-auto px-6 sm:px-10">
            <div className="h-px bg-border" />
          </div>

          {/* Features */}
          <section className="max-w-5xl mx-auto px-6 sm:px-10 py-16 lg:py-20">
            <div className="text-center mb-10">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Platform
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Everything you need to control AI costs
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-xl border border-border bg-card p-5 hover:shadow-sm transition-all"
                >
                  <div className="h-9 w-9 rounded-lg bg-brand-subtle flex items-center justify-center mb-3">
                    <f.icon className="h-[18px] w-[18px] text-brand" />
                  </div>
                  <h3 className="text-[13px] font-semibold text-foreground mb-1">
                    {f.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Stats bar */}
          <section className="max-w-5xl mx-auto px-6 sm:px-10 pb-16">
            <div className="rounded-xl border border-border bg-muted/30 p-6 flex flex-col sm:flex-row items-center justify-around gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">5</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  AI Providers
                </p>
              </div>
              <div className="hidden sm:block h-8 w-px bg-border" />
              <div>
                <p className="text-2xl font-bold text-foreground flex items-center gap-1">
                  <TrendingUp className="h-5 w-5 text-brand" />
                  Real-time
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Usage Sync
                </p>
              </div>
              <div className="hidden sm:block h-8 w-px bg-border" />
              <div>
                <p className="text-2xl font-bold text-foreground">100%</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Cost Visibility
                </p>
              </div>
            </div>
          </section>

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
