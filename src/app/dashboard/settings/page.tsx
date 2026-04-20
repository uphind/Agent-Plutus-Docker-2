"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Bot, Eye, EyeOff, Languages, Pencil, Check as CheckIcon, Wrench, Sparkles, Trash2, BarChart3 } from "lucide-react";
import { LlmModelSelect } from "@/components/llm-model-select";
import { useTerminology } from "@/lib/terminology";
import { DirectorySyncContent } from "@/app/dashboard/settings/graph/page";
import { ProvidersContent } from "@/app/dashboard/providers/page";
import { api } from "@/lib/dashboard-api";

const LLM_PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
];

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
};

export interface AiAssistantConfig {
  provider: string;
  model: string;
  apiKey: string;
}

export function loadAiConfig(): AiAssistantConfig {
  if (typeof window === "undefined") return { provider: "openai", model: "gpt-4o-mini", apiKey: "" };
  try {
    const raw = localStorage.getItem("ai_assistant_config");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { provider: "openai", model: "gpt-4o-mini", apiKey: "" };
}

export function saveAiConfig(config: AiAssistantConfig) {
  localStorage.setItem("ai_assistant_config", JSON.stringify(config));
}

const TERMINOLOGY_DEFAULTS: Array<{ systemTerm: string; label: string; description: string }> = [
  { systemTerm: "department", label: "Department", description: "Organizational unit grouping teams" },
  { systemTerm: "team", label: "Team", description: "Sub-unit within a department" },
  { systemTerm: "user", label: "User", description: "Individual person in the system" },
  { systemTerm: "seat", label: "User", description: "Licensed position / active account" },
  { systemTerm: "seat optimization", label: "User Analysis", description: "Feature for analyzing user utilization" },
];

const SETTINGS_TABS = [
  { id: "providers", label: "Providers" },
  { id: "terminology", label: "Terminology" },
  { id: "ai-assistant", label: "AI Assistant" },
  { id: "directory-sync", label: "Directory Sync" },
];

function TerminologySettings() {
  const { overrides, reload: reloadTerminology } = useTerminology();
  const [termEditing, setTermEditing] = useState<string | null>(null);
  const [termDraft, setTermDraft] = useState("");
  const [termSaving, setTermSaving] = useState(false);
  const [termSaved, setTermSaved] = useState(false);

  const handleSaveTerm = async (systemTerm: string) => {
    if (!termDraft.trim()) {
      setTermEditing(null);
      return;
    }
    setTermSaving(true);
    try {
      await fetch("/api/v1/settings/terminology", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: [{ systemTerm, customTerm: termDraft.trim() }] }),
      });
      await reloadTerminology();
      setTermEditing(null);
      setTermSaved(true);
      setTimeout(() => setTermSaved(false), 3000);
    } catch {
      // silently fail
    } finally {
      setTermSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Terminology</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Customize the terms used throughout the platform to match your organization&apos;s vocabulary.
        </p>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Default Term</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Term</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {TERMINOLOGY_DEFAULTS.map((td) => {
                const customValue = overrides[td.systemTerm] ?? "";
                const isEditing = termEditing === td.systemTerm;
                return (
                  <tr key={td.systemTerm} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <div>
                        <span className="font-medium">{td.label}</span>
                        <p className="text-[11px] text-muted-foreground">{td.description}</p>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input
                          autoFocus
                          className="h-8 w-full rounded border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          value={termDraft}
                          onChange={(e) => setTermDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveTerm(td.systemTerm);
                            } else if (e.key === "Escape") {
                              setTermEditing(null);
                            }
                          }}
                        />
                      ) : (
                        <span className={customValue ? "font-medium text-brand" : "text-muted-foreground"}>
                          {customValue || td.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isEditing ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveTerm(td.systemTerm)}
                          disabled={termSaving}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setTermEditing(td.systemTerm);
                            setTermDraft(customValue || "");
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {termSaved && (
          <p className="text-sm text-emerald-600 font-medium">Terminology updated successfully</p>
        )}
      </CardContent>
    </Card>
  );
}

function AiAssistantSettings() {
  const [aiConfig, setAiConfig] = useState<AiAssistantConfig>({ provider: "openai", model: "gpt-4o-mini", apiKey: "" });
  const [aiSaved, setAiSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setAiConfig(loadAiConfig());
  }, []);

  return (
    <div className="space-y-6">
    <div className="flex items-center justify-end -mb-2">
      <Link
        href="/dashboard/onboarding"
        className="text-xs text-brand hover:text-brand-light font-medium inline-flex items-center gap-1.5"
      >
        <Sparkles className="h-3 w-3" />
        Re-run onboarding wizard
      </Link>
    </div>
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Chatbot key</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Configure an LLM to power the AI chatbot (the floating bubble in the bottom-right
          corner). Your API key is stored locally in your browser and sent directly to the
          provider — it is never saved on our server.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Provider"
            options={LLM_PROVIDER_OPTIONS}
            value={aiConfig.provider}
            onChange={(e) => {
              const provider = e.target.value;
              setAiConfig((prev) => ({
                ...prev,
                provider,
                model: DEFAULT_MODELS[provider] ?? prev.model,
              }));
            }}
          />
          <LlmModelSelect
            provider={aiConfig.provider}
            value={aiConfig.model}
            onChange={(model) => setAiConfig((prev) => ({ ...prev, model }))}
          />
        </div>

        <div className="relative">
          <Input
            label="API Key"
            type={showApiKey ? "text" : "password"}
            placeholder="sk-..."
            value={aiConfig.apiKey}
            onChange={(e) => setAiConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2.5 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              saveAiConfig(aiConfig);
              setAiSaved(true);
              setTimeout(() => setAiSaved(false), 3000);
            }}
            disabled={!aiConfig.apiKey.trim()}
          >
            Save
          </Button>
          {aiSaved && (
            <p className="text-sm text-emerald-600 font-medium">
              AI assistant configuration saved
            </p>
          )}
        </div>
      </CardContent>
    </Card>

    <ChatbotUsagePanel />

    <AiToolsSettings />
    </div>
  );
}

function AiToolsSettings() {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [configured, setConfigured] = useState<{ provider: string | null; model: string | null }>({
    provider: null,
    model: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    api
      .getAiToolsConfig()
      .then((data: { configured: boolean; provider: string | null; model: string | null }) => {
        setConfigured({ provider: data.provider, model: data.model });
        if (data.provider) setProvider(data.provider);
        if (data.model) setModel(data.model);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = (await api.saveAiToolsConfig({ provider, model, apiKey: apiKey.trim() })) as {
        provider: string;
        model: string;
      };
      setConfigured({ provider: res.provider, model: res.model });
      setApiKey("");
      setSavedAt(new Date());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI Tools key");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (typeof window !== "undefined" && !window.confirm("Remove the AI Tools key?")) return;
    try {
      await api.deleteAiToolsConfig();
      setConfigured({ provider: null, model: null });
    } catch {
      // ignore
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <CardTitle>AI Tools key (server-side)</CardTitle>
          </div>
          {configured.provider ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <Sparkles className="h-3 w-3" /> Configured · {configured.provider} · {configured.model}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              Not configured
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Powers in-app AI features that run on the server, like field-mapping suggestions in
          the provider mapping modal. Stored encrypted in the database. Distinct from the
          chatbot key above (which lives only in your browser).
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Provider"
            options={LLM_PROVIDER_OPTIONS}
            value={provider}
            onChange={(e) => {
              const next = e.target.value;
              setProvider(next);
              setModel(DEFAULT_MODELS[next] ?? model);
            }}
          />
          <LlmModelSelect provider={provider} value={model} onChange={setModel} />
        </div>

        <div className="relative">
          <Input
            label="API Key"
            type={showKey ? "text" : "password"}
            placeholder={configured.provider ? "•••••••••• (already configured — paste a new key to replace)" : "sk-..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !apiKey.trim()}>
            {saving ? "Saving..." : configured.provider ? "Update key" : "Save AI Tools key"}
          </Button>
          {configured.provider && (
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
              Remove
            </Button>
          )}
          {savedAt && (
            <p className="text-sm text-emerald-600 font-medium">Saved successfully</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChatbotUsagePanel() {
  const [days, setDays] = useState(30);
  type UsageResponse = {
    totals: { inputTokens: number; outputTokens: number; cachedTokens: number; requests: number; costUsd: number | null };
    byDay: Array<{ date: string; inputTokens: number; outputTokens: number; requests: number; costUsd: number | null }>;
    byModel: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number; requests: number; costUsd: number | null }>;
    providerReport?: { available: boolean; provider?: string; totalCostUsd?: number | null; note?: string };
  };
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getAiUsage(days, "chatbot")
      .then((d: UsageResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const totals = data?.totals;
  const maxDay = Math.max(1, ...(data?.byDay ?? []).map((d) => d.inputTokens + d.outputTokens));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Chatbot usage</CardTitle>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5 text-xs">
            {[7, 30, 90].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  days === n ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !totals || totals.requests === 0 ? (
          <p className="text-sm text-muted-foreground">
            No chatbot calls yet in the last {days} days. Your usage will appear here once you
            ask the floating chatbot a question.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Requests" value={totals.requests.toLocaleString()} />
              <Stat label="Input tokens" value={totals.inputTokens.toLocaleString()} />
              <Stat label="Output tokens" value={totals.outputTokens.toLocaleString()} />
              <Stat
                label="Estimated cost"
                value={totals.costUsd != null ? `$${totals.costUsd.toFixed(4)}` : "—"}
              />
            </div>

            {/* Tiny per-day bar chart */}
            {data?.byDay && data.byDay.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Tokens per day
                </p>
                <div className="flex items-end gap-1 h-16">
                  {data.byDay.map((d) => {
                    const total = d.inputTokens + d.outputTokens;
                    const h = (total / maxDay) * 100;
                    return (
                      <div
                        key={d.date}
                        className="flex-1 bg-brand/40 hover:bg-brand transition-colors rounded-sm min-w-[2px]"
                        style={{ height: `${Math.max(h, 1)}%` }}
                        title={`${d.date}: ${total.toLocaleString()} tokens · ${d.requests} req`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {data?.byModel && data.byModel.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Model</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Req</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">In</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Out</th>
                      <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.map((m) => (
                      <tr key={`${m.provider}-${m.model}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 font-mono">{m.provider} · {m.model}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{m.requests}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{m.inputTokens.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{m.outputTokens.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {m.costUsd != null ? `$${m.costUsd.toFixed(4)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data?.providerReport?.available && (
              <p className="text-[11px] text-muted-foreground">
                Provider report (last {days} days, {data.providerReport.provider}):{" "}
                <span className="font-mono">
                  {data.providerReport.totalCostUsd != null
                    ? `$${data.providerReport.totalCostUsd.toFixed(4)}`
                    : "—"}
                </span>
                . {data.providerReport.note ?? ""}
              </p>
            )}

            <p className="text-[10px] text-muted-foreground">
              Token counts come from each chat response (real-time, accurate). Cost is computed
              from a maintained model→price table, or from the official provider cost report
              when an admin provider is connected on the Providers tab.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  // Derive the active tab directly from the URL — no useState needed. This
  // also transparently migrates legacy tab values (?tab=general → terminology,
  // ?tab=api-docs → providers).
  const activeTab = useMemo(() => {
    if (!tabParam) return "providers";
    if (tabParam === "general") return "terminology";
    if (tabParam === "api-docs") return "providers";
    return tabParam;
  }, [tabParam]);

  const handleTabChange = (id: string) => {
    const url = id === "providers" ? "/dashboard/settings" : `/dashboard/settings?tab=${id}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <Header
        title="Settings"
        description="Configure your Agent Plutus instance"
      />

      <Tabs tabs={SETTINGS_TABS} active={activeTab} onChange={handleTabChange} />

      {activeTab === "providers" && <ProvidersContent showHeader={false} />}
      {activeTab === "terminology" && <TerminologySettings />}
      {activeTab === "ai-assistant" && <AiAssistantSettings />}
      {activeTab === "directory-sync" && <DirectorySyncContent />}
    </div>
  );
}
