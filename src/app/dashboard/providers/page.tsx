"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/dashboard-api";
import { PROVIDER_LABELS } from "@/lib/utils";
import {
  Plug, RefreshCw, Trash2, CheckCircle, XCircle, Key, Save, X,
  Clock, AlertTriangle, FolderSync, GitCompareArrows,
} from "lucide-react";
import Link from "next/link";
import { ProviderFieldMappingModal } from "@/components/provider-field-mapping-modal";

const DIR_DISCLAIMER_DISMISSED_KEY = "provider-dir-disclaimer-dismissed";

const INTERVAL_OPTIONS = [
  { value: "1", label: "Every 1 hour" },
  { value: "2", label: "Every 2 hours" },
  { value: "4", label: "Every 4 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every 24 hours" },
];

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic", hint: "Admin API key (sk-ant-admin...)" },
  { value: "anthropic_compliance", label: "Anthropic Compliance", hint: "Compliance API key — audit-based user activity (no cost data)" },
  { value: "openai", label: "OpenAI", hint: "Admin API key" },
  { value: "gemini", label: "Gemini", hint: "Google AI Studio API key" },
  { value: "cursor", label: "Cursor", hint: "Enterprise Analytics API key" },
  { value: "vertex", label: "Vertex AI", hint: "GCP Service Account JSON" },
];

interface ProviderCred {
  id: string;
  provider: string;
  label: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
}

export default function ProvidersPage() {
  const [credentials, setCredentials] = useState<ProviderCred[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [syncInterval, setSyncInterval] = useState("6");
  const [currentInterval, setCurrentInterval] = useState("6");
  const [intervalSaving, setIntervalSaving] = useState(false);
  const [intervalSaved, setIntervalSaved] = useState(false);

  const [directoryConfigured, setDirectoryConfigured] = useState<boolean | null>(null);
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);
  const [mappingProvider, setMappingProvider] = useState<string | null>(null);

  const showDisclaimer = directoryConfigured === false && !disclaimerDismissed;
  const disableConfigButtons = showDisclaimer;

  const loadProviders = () => {
    setLoading(true);
    api
      .getProviders()
      .then((data) => {
        setCredentials(data.providers ?? []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProviders();

    setDisclaimerDismissed(
      localStorage.getItem(DIR_DISCLAIMER_DISMISSED_KEY) === "true"
    );

    api.getSettings().then((data) => {
      setSyncInterval(String(data.syncIntervalHours ?? 6));
      setCurrentInterval(String(data.syncIntervalHours ?? 6));
      setDirectoryConfigured((data.userCount ?? 0) > 0);
    }).catch(() => {});
  }, []);

  const handleSaveInterval = async () => {
    setIntervalSaving(true);
    try {
      await api.updateSettings({ sync_interval_hours: parseInt(syncInterval, 10) });
      setCurrentInterval(syncInterval);
      setIntervalSaved(true);
      setTimeout(() => setIntervalSaved(false), 3000);
    } catch {
      // silently fail
    } finally {
      setIntervalSaving(false);
    }
  };

  const handleDismissDisclaimer = () => {
    localStorage.setItem(DIR_DISCLAIMER_DISMISSED_KEY, "true");
    setDisclaimerDismissed(true);
  };

  const handleConfigure = (provider: string) => {
    if (disableConfigButtons) return;
    setConfiguring(provider);
    setKeyInput("");
    setLabelInput("");
    setCardError(null);
  };

  const handleSave = async (provider: string) => {
    if (!keyInput.trim()) return;
    setSaving(true);
    setCardError(null);
    try {
      await api.addProvider(provider, keyInput.trim(), labelInput.trim() || undefined);
      setConfiguring(null);
      setKeyInput("");
      setLabelInput("");
      loadProviders();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider: string) => {
    if (!confirm(`Remove ${PROVIDER_LABELS[provider] ?? provider} credentials?`)) return;
    try {
      await api.deleteProvider(provider);
      loadProviders();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleSync = async (provider: string) => {
    setSyncing(provider);
    try {
      await api.triggerSync(provider);
      loadProviders();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        title="Providers"
        description="Configure API keys for your AI platforms"
      />

      {error && (
        <Card className="p-4 border-destructive/50 bg-red-50">
          <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
        </Card>
      )}

      {/* Directory disclaimer */}
      {showDisclaimer && (
        <Card className="p-4 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                Set up your employee directory first
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Configure your employee directory before adding AI providers to ensure usage data is properly linked to users.
                Without a directory, usage records cannot be attributed to individuals.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <Link href="/dashboard/settings?tab=directory-sync">
                  <Button size="sm" variant="secondary">
                    <FolderSync className="h-3.5 w-3.5" />
                    Configure Directory
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={handleDismissDisclaimer}>
                  Dismiss
                </Button>
              </div>
            </div>
            <button
              onClick={handleDismissDisclaimer}
              className="text-amber-500 hover:text-amber-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Sync Frequency */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Provider Sync Frequency</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          How often usage data is automatically pulled from your AI providers.
        </p>
        <div className="flex items-end gap-3">
          <div className="w-56">
            <Select
              label="Sync interval"
              options={INTERVAL_OPTIONS}
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
            />
          </div>
          <Button
            onClick={handleSaveInterval}
            disabled={syncInterval === currentInterval || intervalSaving}
            size="sm"
          >
            {intervalSaving ? "Saving..." : "Save"}
          </Button>
          {intervalSaved && (
            <span className="text-xs text-emerald-600 font-medium">Saved</span>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-5 bg-muted rounded w-24 mb-4" />
              <div className="h-4 bg-muted rounded w-40" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PROVIDERS.map((p) => {
            const cred = credentials.find((c) => c.provider === p.value);
            const isConnected = !!cred?.isActive;
            const isConfiguring = configuring === p.value;

            return (
              <Card
                key={p.value}
                className={`p-6 flex flex-col ${disableConfigButtons && !isConnected ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2.5">
                      <Plug className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{p.label}</h3>
                      {cred?.label && (
                        <p className="text-xs text-muted-foreground">{cred.label}</p>
                      )}
                    </div>
                  </div>
                  {isConnected ? (
                    <Badge variant="success">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <XCircle className="h-3 w-3 mr-1" />
                      Not configured
                    </Badge>
                  )}
                </div>

                {cred?.lastSyncAt && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Last sync: {new Date(cred.lastSyncAt).toLocaleString()}
                  </p>
                )}

                <p className="text-xs text-muted-foreground mb-4">{p.hint}</p>

                {isConfiguring ? (
                  <div className="space-y-3 mt-auto">
                    <Input
                      placeholder={p.hint}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      type="password"
                      autoFocus
                    />
                    <Input
                      placeholder="Label (optional)"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                    />
                    {cardError && (
                      <div className="rounded-md bg-red-50 border border-red-200 p-3">
                        {cardError.split("\n").map((line, i) => (
                          <p key={i} className={`text-xs ${i === 0 ? "text-destructive font-medium" : "text-red-700 mt-1"}`}>
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSave(p.value)}
                        disabled={!keyInput.trim() || saving}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfiguring(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {isConnected ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSync(p.value)}
                          disabled={syncing === p.value}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${syncing === p.value ? "animate-spin" : ""}`} />
                          {syncing === p.value ? "Syncing..." : "Sync Now"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setMappingProvider(p.value)}
                        >
                          <GitCompareArrows className="h-3.5 w-3.5" />
                          Map Fields
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleConfigure(p.value)}
                        >
                          <Key className="h-3.5 w-3.5" />
                          Update Key
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(p.value)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConfigure(p.value)}
                        disabled={disableConfigButtons}
                      >
                        <Key className="h-3.5 w-3.5" />
                        Configure
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ProviderFieldMappingModal
        open={!!mappingProvider}
        onClose={() => setMappingProvider(null)}
        provider={mappingProvider ?? ""}
      />
    </div>
  );
}
