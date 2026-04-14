"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Bot, Eye, EyeOff, Languages, Pencil, Check as CheckIcon, RefreshCw } from "lucide-react";
import { useTerminology } from "@/lib/terminology";
import { DirectorySyncContent } from "@/app/dashboard/settings/graph/page";
import { ApiDocsContent } from "@/app/dashboard/api-docs/page";

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

function saveAiConfig(config: AiAssistantConfig) {
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
  { id: "general", label: "General" },
  { id: "directory-sync", label: "Directory Sync" },
  { id: "api-docs", label: "API Docs" },
];

function GeneralSettings() {
  const [aiConfig, setAiConfig] = useState<AiAssistantConfig>({ provider: "openai", model: "gpt-4o-mini", apiKey: "" });
  const [aiSaved, setAiSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{ provider: string; modelId: string; displayName: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const { overrides, reload: reloadTerminology } = useTerminology();
  const [termEditing, setTermEditing] = useState<string | null>(null);
  const [termDraft, setTermDraft] = useState("");
  const [termSaving, setTermSaving] = useState(false);
  const [termSaved, setTermSaved] = useState(false);

  const loadModels = useCallback(async (refresh = false) => {
    setModelsLoading(true);
    try {
      const res = await fetch(`/api/v1/models/available${refresh ? "?refresh=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data.models ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    setAiConfig(loadAiConfig());
    loadModels();
  }, [loadModels]);

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
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <CardTitle>AI Assistant</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure an LLM to power the AI assistant on the Suggestions page.
            Your API key is stored locally in your browser and sent directly to the provider — it is never saved on our server.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Provider"
              options={LLM_PROVIDER_OPTIONS}
              value={aiConfig.provider}
              onChange={(e) => {
                const provider = e.target.value;
                const providerModels = availableModels.filter((m) => m.provider === provider);
                setAiConfig((prev) => ({
                  ...prev,
                  provider,
                  model: providerModels[0]?.modelId ?? DEFAULT_MODELS[provider] ?? prev.model,
                }));
              }}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Model</label>
                <button
                  type="button"
                  onClick={() => loadModels(true)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  disabled={modelsLoading}
                >
                  <RefreshCw className={`h-3 w-3 ${modelsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
              {availableModels.filter((m) => m.provider === aiConfig.provider).length > 0 ? (
                <select
                  className="flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  value={aiConfig.model}
                  onChange={(e) => setAiConfig((prev) => ({ ...prev, model: e.target.value }))}
                >
                  {availableModels
                    .filter((m) => m.provider === aiConfig.provider)
                    .map((m) => (
                      <option key={m.modelId} value={m.modelId}>{m.displayName}</option>
                    ))}
                </select>
              ) : (
                <Input
                  placeholder="e.g. gpt-4o-mini"
                  value={aiConfig.model}
                  onChange={(e) => setAiConfig((prev) => ({ ...prev, model: e.target.value }))}
                />
              )}
            </div>
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
    </div>
  );
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam || "general");

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam, activeTab]);

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    const url = id === "general" ? "/dashboard/settings" : `/dashboard/settings?tab=${id}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <Header
        title="Settings"
        description="Configure your Agent Plutus instance"
      />

      <Tabs tabs={SETTINGS_TABS} active={activeTab} onChange={handleTabChange} />

      {activeTab === "general" && <GeneralSettings />}
      {activeTab === "directory-sync" && <DirectorySyncContent />}
      {activeTab === "api-docs" && <ApiDocsContent />}
    </div>
  );
}
