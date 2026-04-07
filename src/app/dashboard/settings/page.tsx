"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/dashboard-api";
import { RefreshCw, Users, Code2, Bot, Eye, EyeOff } from "lucide-react";

const INTERVAL_OPTIONS = [
  { value: "1", label: "Every 1 hour" },
  { value: "2", label: "Every 2 hours" },
  { value: "4", label: "Every 4 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every 24 hours" },
];

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

interface Settings {
  organization: string;
  syncIntervalHours: number;
  userCount: number;
  providerCount: number;
  lastSync: { at: string; status: string } | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedInterval, setSelectedInterval] = useState("6");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiConfig, setAiConfig] = useState<AiAssistantConfig>({ provider: "openai", model: "gpt-4o-mini", apiKey: "" });
  const [aiSaved, setAiSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      setSelectedInterval(String(data.syncIntervalHours));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    loadSettings();
    setAiConfig(loadAiConfig());
  }, [loadSettings]);

  const handleSaveInterval = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings({ sync_interval_hours: parseInt(selectedInterval, 10) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const intervalChanged = settings
    ? String(settings.syncIntervalHours) !== selectedInterval
    : false;

  return (
    <div className="space-y-6">
      <Header
        title="Settings"
        description="Configure your Agent Plutus instance"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Sync Schedule</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Usage data is automatically synced from all configured providers on a recurring schedule.
            You can also trigger a manual sync from the Providers page.
          </p>

          <div className="flex items-end gap-3">
            <div className="w-64">
              <Select
                label="Sync interval"
                options={INTERVAL_OPTIONS}
                value={selectedInterval}
                onChange={(e) => setSelectedInterval(e.target.value)}
              />
            </div>
            <Button
              onClick={handleSaveInterval}
              disabled={!intervalChanged || saving}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>

          {saved && (
            <p className="text-sm text-emerald-600 font-medium">
              Sync schedule updated successfully
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          {settings?.lastSync && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Last sync:</span>
              <span>{new Date(settings.lastSync.at).toLocaleString()}</span>
              <Badge variant={settings.lastSync.status === "success" ? "success" : "warning"}>
                {settings.lastSync.status}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Directory Integration</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Push your employee directory to Agent Plutus so usage can be mapped to users, departments, and teams.
            Your system (Active Directory, HR platform, or custom script) should POST to the endpoint below.
          </p>

          {settings && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Current directory:</span>
              <Badge variant="default">
                {settings.userCount} user{settings.userCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">API Endpoint</span>
            </div>
            <code className="block text-sm font-mono bg-card rounded px-3 py-2 border border-border">
              POST /api/v1/directory
            </code>
            <p className="text-xs text-muted-foreground">
              Expected JSON body:
            </p>
            <pre className="text-xs font-mono bg-card rounded px-3 py-2 border border-border overflow-x-auto whitespace-pre">{`{
  "users": [
    {
      "email": "alice@company.com",
      "name": "Alice Chen",
      "department": "Engineering",
      "team": "Platform",
      "job_title": "Staff Engineer",
      "employee_id": "EMP-001",
      "status": "active"
    }
  ]
}`}</pre>
            <p className="text-xs text-muted-foreground">
              Users not included in the payload will be marked as inactive.
              Departments and teams are auto-created from the directory data.
            </p>
          </div>
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
                setAiConfig((prev) => ({
                  ...prev,
                  provider,
                  model: DEFAULT_MODELS[provider] ?? prev.model,
                }));
              }}
            />
            <Input
              label="Model"
              placeholder="e.g. gpt-4o-mini"
              value={aiConfig.model}
              onChange={(e) => setAiConfig((prev) => ({ ...prev, model: e.target.value }))}
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

    </div>
  );
}
