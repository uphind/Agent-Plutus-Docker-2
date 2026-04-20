"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Users, Eye, EyeOff, AlertTriangle, Check, Clock, FolderSync } from "lucide-react";
import { api } from "@/lib/dashboard-api";

const PROVIDER_INTERVAL_OPTIONS = [
  { value: "1", label: "Every 1 hour" },
  { value: "2", label: "Every 2 hours" },
  { value: "4", label: "Every 4 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every 24 hours" },
];

const DIR_INTERVAL_OPTIONS = [
  { value: "0", label: "Manual only" },
  { value: "1", label: "Every 1 hour" },
  { value: "2", label: "Every 2 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every 24 hours" },
];

export interface DirectoryStepResult {
  /** Whether the user successfully connected MS Graph in this step. */
  graphConnected: boolean;
  /** Live field list from the sample user (used by the next step's mapping UI). */
  availableFields: string[];
  /** A sample user object — used to show example values during mapping. */
  sampleUser: Record<string, unknown> | null;
}

export function StepDirectory({
  onNext,
  onSkip,
}: {
  onNext: (result: DirectoryStepResult) => void;
  onSkip: () => void;
}) {
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const [providerInterval, setProviderInterval] = useState("6");
  const [dirInterval, setDirInterval] = useState("0");

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<DirectoryStepResult | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s: { syncIntervalHours?: number; dirSyncIntervalHours?: number }) => {
        if (s.syncIntervalHours) setProviderInterval(String(s.syncIntervalHours));
        if (s.dirSyncIntervalHours !== undefined) setDirInterval(String(s.dirSyncIntervalHours));
      })
      .catch(() => {});
  }, []);

  const handleConnect = async () => {
    if (!tenantId.trim() || !clientId.trim() || !clientSecret.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/graph/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantId.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Connection failed (HTTP ${res.status})`);
      // Persist sync intervals (best-effort).
      try {
        await api.updateSettings({
          sync_interval_hours: parseInt(providerInterval, 10),
          dir_sync_interval_hours: parseInt(dirInterval, 10),
        });
      } catch {
        // non-fatal — the user can adjust intervals later in Settings
      }
      setConnected({
        graphConnected: true,
        availableFields: data.availableFields ?? [],
        sampleUser: data.sampleUser ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleContinue = () => {
    if (!connected) return;
    onNext(connected);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Connect your employee directory</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Wire up Microsoft Graph so usage records can be linked to real users by email. You
          can skip this and connect it later from Settings → Directory Sync — every other step
          still works without it.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Tenant ID"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            disabled={!!connected}
          />
          <Input
            label="Client ID"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={!!connected}
          />
        </div>

        <div className="relative">
          <Input
            label="Client Secret"
            type={showSecret ? "text" : "password"}
            placeholder="Enter client secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            disabled={!!connected}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2.5 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border">
          <div>
            <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" />
              Provider sync frequency
            </div>
            <Select
              options={PROVIDER_INTERVAL_OPTIONS}
              value={providerInterval}
              onChange={(e) => setProviderInterval(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              How often Agent-Plutus pulls usage data from your AI providers.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FolderSync className="h-3 w-3" />
              Directory sync frequency
            </div>
            <Select
              options={DIR_INTERVAL_OPTIONS}
              value={dirInterval}
              onChange={(e) => setDirInterval(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              How often we re-pull users from Microsoft Graph.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50/50 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
          </div>
        )}

        {connected && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-800">
              Connected to Microsoft Graph. {connected.availableFields.length} fields detected
              from a sample user.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onSkip}>
            Skip — I&apos;ll wire AD later
          </Button>
          {!connected ? (
            <Button
              onClick={handleConnect}
              disabled={connecting || !tenantId || !clientId || !clientSecret}
            >
              {connecting ? "Connecting..." : "Connect & continue"}
            </Button>
          ) : (
            <Button onClick={handleContinue}>Continue</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
