"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
  Clock, AlertTriangle, FolderSync, GitCompareArrows, Radar,
  TableIcon, LayoutGrid, Plus, Pencil, EyeOff, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { ProviderFieldMappingModal } from "@/components/provider-field-mapping-modal";
import { useViewPreference } from "@/lib/use-view-preference";
import { useRequestedIntegrations } from "@/lib/requested-integrations";

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
  { value: "anthropic_analytics", label: "Anthropic Analytics", hint: "Enterprise Analytics API key (read:analytics) — per-user engagement, no cost data" },
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

interface ProvidersContentProps {
  showHeader?: boolean;
}

export function ProvidersContent({ showHeader = true }: ProvidersContentProps) {
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
  const [layout, setLayout] = useViewPreference<"table" | "cards">("providers.layout", "table");

  // Curated list of providers the user wants visible. Defaults to all known
  // providers so nothing is hidden until the user explicitly hides one.
  // This is purely a view preference — hiding a provider here does NOT delete
  // any saved credential or mapping; it just removes the row from this list
  // so users can keep their workspace focused.
  const ALL_PROVIDER_IDS = useMemo(() => PROVIDERS.map((p) => p.value), []);
  const [visibleProviderIds, setVisibleProviderIds] = useViewPreference<string[]>(
    "providers.visibleIds",
    ALL_PROVIDER_IDS
  );
  const [editMode, setEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Always show providers that are currently configured even if the user
  // hasn't explicitly opted them in — otherwise a stored credential could
  // get orphaned in the UI.
  const visibleProviders = useMemo(() => {
    const visibleSet = new Set(visibleProviderIds);
    const configuredProviders = new Set(credentials.filter((c) => c.isActive).map((c) => c.provider));
    return PROVIDERS.filter((p) => visibleSet.has(p.value) || configuredProviders.has(p.value));
  }, [visibleProviderIds, credentials]);

  const hiddenProviders = useMemo(() => {
    const visibleSet = new Set(visibleProviders.map((p) => p.value));
    return PROVIDERS.filter((p) => !visibleSet.has(p.value));
  }, [visibleProviders]);

  const handleAddProviderToView = (id: string) => {
    setVisibleProviderIds(Array.from(new Set([...visibleProviderIds, id])));
  };

  const handleHideProviderFromView = (id: string) => {
    // Don't allow hiding a connected provider — it would lose its row even
    // though the credential is still active. Surface a confirmation prompt.
    const cred = credentials.find((c) => c.provider === id);
    if (cred?.isActive) {
      const ok = confirm(
        "This provider has an active credential. Hiding it from the list won't delete the credential — the row will reappear automatically. Continue?"
      );
      if (!ok) return;
    }
    setVisibleProviderIds(visibleProviderIds.filter((v) => v !== id));
  };

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
      {showHeader && (
        <Header
          title="Providers"
          description="Configure API keys for your AI platforms"
        />
      )}

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

      {/* Discovery callout */}
      <Card className="p-5 border-brand/30 bg-gradient-to-br from-brand/5 via-card to-card">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-brand/10 p-2.5 shrink-0">
            <Radar className="h-5 w-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">Don&apos;t know which provider an API key belongs to?</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Run <strong>Discovery</strong> to probe every supported endpoint with a single key
              and see exactly which providers, sub-APIs, and fields respond — then save and map
              the matches in one click.
            </p>
            <Link href="/dashboard/providers/discovery">
              <Button size="sm">
                <Radar className="h-3.5 w-3.5" />
                Open Discovery
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Configured providers</h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAddModal(true)}
            disabled={hiddenProviders.length === 0}
            title={hiddenProviders.length === 0 ? "All known providers already shown" : "Add a provider to your list"}
          >
            <Plus className="h-3.5 w-3.5" />
            Provider
          </Button>
          <Button
            size="sm"
            variant={editMode ? "primary" : "ghost"}
            onClick={() => setEditMode((v) => !v)}
            title="Hide providers you don't use from this list"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editMode ? "Done" : "Edit"}
          </Button>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setLayout("table")}
            title="Table view"
            aria-label="Table view"
            aria-pressed={layout === "table"}
            className={`p-1.5 rounded-md transition-colors ${
              layout === "table" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TableIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setLayout("cards")}
            title="Card view"
            aria-label="Card view"
            aria-pressed={layout === "cards"}
            className={`p-1.5 rounded-md transition-colors ${
              layout === "cards" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
        </div>
      </div>

      {loading ? (
        layout === "table" ? (
          <Card className="p-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="border-b border-border last:border-0 px-5 py-3 animate-pulse">
                <div className="h-4 bg-muted rounded w-40" />
              </div>
            ))}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="h-5 bg-muted rounded w-24 mb-4" />
                <div className="h-4 bg-muted rounded w-40" />
              </Card>
            ))}
          </div>
        )
      ) : layout === "table" ? (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Label</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Last sync</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProviders.map((p) => {
                const cred = credentials.find((c) => c.provider === p.value);
                const isConnected = !!cred?.isActive;
                const isConfiguring = configuring === p.value;
                return (
                  <Fragment key={p.value}>
                    <tr className={`border-b border-border last:border-0 ${disableConfigButtons && !isConnected ? "opacity-60" : ""}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-md bg-muted p-1.5">
                            <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.label}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{p.hint}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
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
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground truncate">
                        {cred?.label ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {cred?.lastSyncAt ? new Date(cred.lastSyncAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {isConnected ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleSync(p.value)} disabled={syncing === p.value} title="Sync now">
                                <RefreshCw className={`h-3.5 w-3.5 ${syncing === p.value ? "animate-spin" : ""}`} />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setMappingProvider(p.value)} title="Map fields">
                                <GitCompareArrows className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleConfigure(p.value)} title="Update key">
                                <Key className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(p.value)} title="Remove credential">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" onClick={() => handleConfigure(p.value)} disabled={disableConfigButtons}>
                              <Key className="h-3.5 w-3.5" />
                              Configure
                            </Button>
                          )}
                          {editMode && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleHideProviderFromView(p.value)}
                              title="Hide from this list (does not delete the credential)"
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isConfiguring && (
                      <tr className="border-b border-border last:border-0 bg-muted/20">
                        <td colSpan={5} className="px-5 py-4">
                          <div className="space-y-3">
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
                              <Button size="sm" onClick={() => handleSave(p.value)} disabled={!keyInput.trim() || saving}>
                                <Save className="h-3.5 w-3.5" />
                                {saving ? "Saving..." : "Save"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfiguring(null)}>
                                <X className="h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleProviders.map((p) => {
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
                    {editMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleHideProviderFromView(p.value)}
                        title="Hide from this list"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Hide
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {visibleProviders.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <EyeOff className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No providers in your list</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            You&apos;ve hidden every provider from view. Add some back to start configuring.
          </p>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add a provider
          </Button>
        </Card>
      )}

      <RequestedIntegrationsSection />

      <ProviderFieldMappingModal
        open={!!mappingProvider}
        onClose={() => setMappingProvider(null)}
        provider={mappingProvider ?? ""}
      />

      {showAddModal && (
        <Modal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add a provider to your list"
        >
          <div className="px-6 py-5 space-y-3 text-sm">
            {hiddenProviders.length === 0 ? (
              <p className="text-muted-foreground">
                Every supported provider is already showing in your list. If you need a brand
                new integration that Tokenear doesn&apos;t ship yet, run{" "}
                <Link href="/dashboard/providers/discovery" className="text-brand hover:underline" onClick={() => setShowAddModal(false)}>
                  Discovery
                </Link>{" "}
                with the API key — successful probes for unsupported providers can be added to
                your requested-integrations list.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Pick a provider to add it back to your Configured providers list. This is a
                  view preference only — adding a provider here doesn&apos;t configure or store
                  any credentials.
                </p>
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {hiddenProviders.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        handleAddProviderToView(p.value);
                        if (hiddenProviders.length === 1) setShowAddModal(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-brand hover:bg-brand/5 text-left transition-colors"
                    >
                      <div className="rounded-md bg-muted p-1.5">
                        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{p.label}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{p.hint}</p>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="flex items-center justify-end pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RequestedIntegrationsSection() {
  const { items, remove } = useRequestedIntegrations();
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-sky-500" />
          Requested integrations
          <span className="text-xs text-muted-foreground font-normal">
            providers you asked us to add — not yet syncable
          </span>
        </h3>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Discovered via</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Key hint</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requested</th>
              <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.provider} className="border-b border-border last:border-0">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{it.providerLabel}</span>
                    <Badge variant="info">Pending integration</Badge>
                  </div>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {it.apiName ? (
                    <span>
                      {it.apiName}
                      {it.endpointName ? ` · ${it.endpointName}` : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-5 py-3 text-xs font-mono text-muted-foreground">{it.keyHint ?? "—"}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {new Date(it.requestedAt).toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(it.provider)} title="Remove from request list">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function ProvidersPage() {
  return <ProvidersContent showHeader />;
}
