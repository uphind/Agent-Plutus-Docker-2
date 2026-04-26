"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/dashboard-api";
import {
  Users, Link2, ArrowRight, GripVertical, Check,
  RefreshCw, Eye, EyeOff, AlertTriangle, Trash2, Clock, LinkIcon,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";

const DIR_SYNC_INTERVAL_OPTIONS = [
  { value: "0", label: "Manual only" },
  { value: "1", label: "Every 1 hour" },
  { value: "2", label: "Every 2 hours" },
  { value: "4", label: "Every 4 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every 24 hours" },
];

const RELINK_INTERVAL_OPTIONS = [
  { value: "0", label: "Manual only" },
  { value: "1", label: "Every 1 hour" },
  { value: "2", label: "Every 2 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every 24 hours" },
  { value: "48", label: "Every 2 days" },
  { value: "168", label: "Every 7 days" },
];

interface Mapping {
  sourceField: string;
  targetField: string;
}

const TARGET_FIELDS = [
  { key: "email", label: "Email", required: true, description: "User email address for identification" },
  { key: "name", label: "Full Name", required: true, description: "Display name of the user" },
  { key: "department", label: "Department", required: false, description: "Organizational department" },
  { key: "team", label: "Team", required: false, description: "Team within a department" },
  { key: "job_title", label: "Job Title", required: false, description: "Role or position title" },
  { key: "employee_id", label: "Employee ID", required: false, description: "Internal employee identifier" },
  { key: "status", label: "Status", required: false, description: "Active or inactive status" },
];

export function DirectorySyncContent() {
  const [step, setStep] = useState<"connect" | "map" | "done">("connect");
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [sampleUser, setSampleUser] = useState<Record<string, unknown> | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ total: number; created: number; updated: number } | null>(null);
  const [syncProgress, setSyncProgress] = useState<{
    progress: number;
    processed: number;
    total: number;
    message: string | null;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [dirSyncInterval, setDirSyncInterval] = useState("0");
  const [currentDirInterval, setCurrentDirInterval] = useState("0");
  const [dirIntervalSaving, setDirIntervalSaving] = useState(false);
  const [dirIntervalSaved, setDirIntervalSaved] = useState(false);
  const [dirIntervalError, setDirIntervalError] = useState<string | null>(null);
  const [lastDirectorySync, setLastDirectorySync] = useState<string | null>(null);

  const [relinkInterval, setRelinkInterval] = useState("0");
  const [currentRelinkInterval, setCurrentRelinkInterval] = useState("0");
  const [relinkSaving, setRelinkSaving] = useState(false);
  const [relinkSaved, setRelinkSaved] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [relinkResult, setRelinkResult] = useState<{ total: number; relinked: number; merged: number; unresolved: number } | null>(null);
  const [relinkError, setRelinkError] = useState<string | null>(null);
  const [orphanedCount, setOrphanedCount] = useState(0);
  const [lastRelinkAt, setLastRelinkAt] = useState<string | null>(null);
  const [relinkIntervalError, setRelinkIntervalError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((data) => {
      setDirSyncInterval(String(data.dirSyncIntervalHours ?? 0));
      setCurrentDirInterval(String(data.dirSyncIntervalHours ?? 0));
      setRelinkInterval(String(data.relinkIntervalHours ?? 0));
      setCurrentRelinkInterval(String(data.relinkIntervalHours ?? 0));
      setOrphanedCount(data.orphanedRecordCount ?? 0);
      setLastRelinkAt(data.lastRelinkAt ?? null);
      setLastDirectorySync(data.lastDirectorySync ?? null);
    }).catch(() => {});
  }, []);

  const handleSaveDirInterval = async () => {
    setDirIntervalSaving(true);
    setDirIntervalError(null);
    try {
      await api.updateSettings({ dir_sync_interval_hours: parseInt(dirSyncInterval, 10) });
      setCurrentDirInterval(dirSyncInterval);
      setDirIntervalSaved(true);
      setTimeout(() => setDirIntervalSaved(false), 3000);
    } catch (err) {
      setDirIntervalError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setDirIntervalSaving(false);
    }
  };

  const handleSaveRelinkInterval = async () => {
    setRelinkSaving(true);
    setRelinkIntervalError(null);
    try {
      await api.updateSettings({ relink_interval_hours: parseInt(relinkInterval, 10) });
      setCurrentRelinkInterval(relinkInterval);
      setRelinkSaved(true);
      setTimeout(() => setRelinkSaved(false), 3000);
    } catch (err) {
      setRelinkIntervalError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setRelinkSaving(false);
    }
  };

  const handleRelink = async () => {
    setRelinking(true);
    setRelinkResult(null);
    setRelinkError(null);
    try {
      const data = await api.triggerRelink();
      setRelinkResult({ total: data.total, relinked: data.relinked, merged: data.merged, unresolved: data.unresolved });
      setOrphanedCount(data.unresolved);
      setLastRelinkAt(new Date().toISOString());
    } catch (err) {
      setRelinkError(err instanceof Error ? err.message : "Re-link failed");
    } finally {
      setRelinking(false);
    }
  };

  const loadExistingConfig = useCallback(async () => {
    try {
      const [sampleRes, mappingRes] = await Promise.all([
        fetch("/api/v1/graph/sample"),
        fetch("/api/v1/graph/field-mapping"),
      ]);

      if (sampleRes.ok) {
        const sampleData = await sampleRes.json();
        setAvailableFields(sampleData.availableFields ?? []);
        setSampleUser(sampleData.sampleUser);
        setIsConfigured(true);

        if (mappingRes.ok) {
          const mappingData = await mappingRes.json();
          if (mappingData.mappings?.length > 0) {
            setMappings(mappingData.mappings);
            setStep("done");
          } else {
            setStep("map");
          }
        } else {
          setStep("map");
        }
      }
    } catch {
      // Not configured yet
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadExistingConfig();
  }, [loadExistingConfig]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/v1/graph/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, clientId, clientSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");

      setAvailableFields(data.availableFields ?? []);
      setSampleUser(data.sampleUser);
      setIsConfigured(true);

      autoMap(data.availableFields ?? []);
      setStep("map");
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const autoMap = (fields: string[]) => {
    const auto: Mapping[] = [];
    const fieldSet = new Set(fields.map((f) => f.toLowerCase()));

    const autoRules: Array<{ target: string; sources: string[] }> = [
      { target: "email", sources: ["mail", "userprincipalname", "email"] },
      { target: "name", sources: ["displayname", "name"] },
      { target: "department", sources: ["department"] },
      { target: "team", sources: ["team", "officelocation"] },
      { target: "job_title", sources: ["jobtitle", "job_title"] },
      { target: "employee_id", sources: ["employeeid", "employee_id", "id"] },
    ];

    for (const rule of autoRules) {
      for (const source of rule.sources) {
        if (fieldSet.has(source)) {
          const original = fields.find((f) => f.toLowerCase() === source);
          if (original) {
            auto.push({ sourceField: original, targetField: rule.target });
            break;
          }
        }
      }
    }

    setMappings(auto);
  };

  const handleDragStart = (field: string) => {
    setDraggedField(field);
  };

  const handleDrop = (targetField: string) => {
    if (!draggedField) return;
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.targetField !== targetField);
      return [...filtered, { sourceField: draggedField, targetField }];
    });
    setDraggedField(null);
  };

  const handleSourceClick = (field: string) => {
    if (selectedSource === field) {
      setSelectedSource(null);
    } else {
      setSelectedSource(field);
    }
  };

  const handleTargetClick = (targetField: string) => {
    if (!selectedSource) return;
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.targetField !== targetField);
      return [...filtered, { sourceField: selectedSource, targetField }];
    });
    setSelectedSource(null);
  };

  const removeMapping = (targetField: string) => {
    setMappings((prev) => prev.filter((m) => m.targetField !== targetField));
  };

  const getMappedSource = (targetField: string) => {
    return mappings.find((m) => m.targetField === targetField)?.sourceField;
  };

  const isMapped = (sourceField: string) => {
    return mappings.some((m) => m.sourceField === sourceField);
  };

  const handleSaveMappings = async () => {
    setSaving(true);
    try {
      await fetch("/api/v1/graph/field-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      setStep("done");
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/v1/graph/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed to start");

      const jobId = data.jobId as string | undefined;
      if (!jobId) {
        // Legacy synchronous response — fall back to old behaviour.
        setSyncResult({ total: data.total, created: data.created, updated: data.updated });
        setLastDirectorySync(new Date().toISOString());
        return;
      }

      // Poll the SyncJob row until we hit a terminal state. The bell icon
      // also surfaces this same data — having it inline here just spares
      // the user from opening the dropdown to know the sync's still going.
      const pollInterval = 1500;
      const maxWaitMs = 30 * 60 * 1000;
      const start = Date.now();

      while (Date.now() - start < maxWaitMs) {
        const status = await api.getActiveSyncJobs();
        type StatusJob = {
          id: string;
          status: string;
          progress: number;
          processed: number;
          total: number;
          message: string | null;
          error: string | null;
        };
        const job = ((status.jobs ?? []) as StatusJob[]).find((j) => j.id === jobId);

        if (!job) {
          // Already aged out of the active window — assume success and stop.
          setLastDirectorySync(new Date().toISOString());
          break;
        }

        setSyncProgress({
          progress: job.progress,
          processed: job.processed,
          total: job.total,
          message: job.message,
        });

        if (job.status === "completed") {
          setSyncResult({ total: job.total, created: 0, updated: 0 });
          setLastDirectorySync(new Date().toISOString());
          break;
        }
        if (job.status === "failed") {
          setSyncError(job.error ?? job.message ?? "Sync failed");
          break;
        }

        await new Promise((r) => setTimeout(r, pollInterval));
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const hasRequiredMappings = mappings.some((m) => m.targetField === "email") &&
    mappings.some((m) => m.targetField === "name");

  if (loadingConfig) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Directory Sync</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 animate-pulse">
              <div className="h-4 w-2/3 bg-muted rounded" />
              <div className="h-9 w-full bg-muted/60 rounded" />
              <div className="h-9 w-1/3 bg-muted/60 rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Directory + Schedule (only when fully configured) */}
      {step === "done" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Sync Directory</CardTitle>
              </div>
              <Badge variant="success">Connected</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:divide-x md:divide-border">
              {/* Left: Schedule */}
              <div className="space-y-3 md:pr-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Sync schedule</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Automatically pull users from your directory on a recurring schedule.
                  Set to &quot;Manual only&quot; to disable automatic sync.
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1 max-w-xs">
                    <Select
                      label="Interval"
                      options={DIR_SYNC_INTERVAL_OPTIONS}
                      value={dirSyncInterval}
                      onChange={(e) => setDirSyncInterval(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleSaveDirInterval}
                    disabled={dirSyncInterval === currentDirInterval || dirIntervalSaving}
                    size="sm"
                  >
                    {dirIntervalSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
                {dirIntervalSaved && (
                  <p className="text-xs text-emerald-600 font-medium">
                    Sync schedule updated successfully
                  </p>
                )}
                {dirIntervalError && (
                  <p className="text-xs text-red-600 font-medium">{dirIntervalError}</p>
                )}
              </div>

              {/* Right: Manual sync */}
              <div className="space-y-3 md:pl-6">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Manual sync</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pull users from your Active Directory now using the configured field mappings.
                </p>
                {lastDirectorySync && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(lastDirectorySync).toLocaleString()}
                  </p>
                )}
                <Button onClick={handleSync} disabled={syncing}>
                  {syncing ? "Syncing..." : "Sync Now"}
                </Button>
                {syncing && syncProgress && (
                  <div className="rounded-lg border border-brand/30 bg-brand/[0.06] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-brand">
                        {syncProgress.message ?? "Working…"}
                      </p>
                      <span className="text-xs font-semibold text-brand tabular-nums">
                        {syncProgress.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-brand/15 overflow-hidden">
                      <div
                        className="h-full bg-brand transition-all duration-500"
                        style={{ width: `${Math.max(2, syncProgress.progress)}%` }}
                      />
                    </div>
                    {syncProgress.total > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {syncProgress.processed.toLocaleString()} / {syncProgress.total.toLocaleString()} users
                      </p>
                    )}
                  </div>
                )}
                {syncError && (
                  <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                    <p className="text-xs font-medium text-red-700 whitespace-pre-line">
                      {syncError}
                    </p>
                  </div>
                )}
                {syncResult && !syncing && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                    <p className="text-xs font-medium text-emerald-700">
                      Sync complete: {syncResult.total} users processed
                      {syncResult.created || syncResult.updated
                        ? ` (${syncResult.created} created, ${syncResult.updated} updated)`
                        : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Connect */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Graph API Connection</CardTitle>
            </div>
            {isConfigured && (
              <Badge variant="success">Connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "connect" && !isConfigured ? (
            <>
              <p className="text-sm text-muted-foreground">
                Enter your Azure AD application credentials to connect to Microsoft Graph API.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Tenant ID"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                />
                <Input
                  label="Client ID"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div className="relative">
                <Input
                  label="Client Secret"
                  type={showSecret ? "text" : "password"}
                  placeholder="Enter client secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2.5 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {connectError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {connectError}
                </div>
              )}
              <Button
                onClick={handleConnect}
                disabled={connecting || !tenantId || !clientId || !clientSecret}
              >
                {connecting ? "Connecting..." : "Connect & Test"}
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Graph API is connected. {availableFields.length} fields detected.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setIsConfigured(false); setStep("connect"); }}
              >
                Reconfigure
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Field Mapping */}
      {(step === "map" || step === "done") && availableFields.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Field Mapping</CardTitle>
              </div>
              {step === "done" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setStep("map")}
                >
                  Edit Mappings
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {step === "map" && (
              <p className="text-sm text-muted-foreground mb-4">
                Drag a field from the left and drop it onto the matching Agent Plutus field on the right.
                Or click a source field, then click a target field to create the mapping.
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 items-start">
              {/* Source fields */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Your Graph API Fields
                </p>
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {availableFields.map((field) => {
                    const mapped = isMapped(field);
                    const isSelected = selectedSource === field;
                    return (
                      <div
                        key={field}
                        draggable={step === "map"}
                        onDragStart={() => handleDragStart(field)}
                        onClick={() => step === "map" && handleSourceClick(field)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                          step !== "map"
                            ? "border-border opacity-60"
                            : isSelected
                            ? "border-brand bg-brand/5 ring-1 ring-brand cursor-pointer"
                            : mapped
                            ? "border-emerald-200 bg-emerald-50/50 cursor-grab"
                            : "border-border hover:border-muted-foreground/50 cursor-grab"
                        }`}
                      >
                        {step === "map" && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                        <span className="font-mono text-xs flex-1">{field}</span>
                        {sampleUser && sampleUser[field] != null && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                            {String(sampleUser[field])}
                          </span>
                        )}
                        {mapped && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Arrow */}
              <div className="hidden lg:flex items-center justify-center pt-8">
                <ArrowRight className="h-6 w-6 text-muted-foreground/30" />
              </div>

              {/* Target fields */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Agent Plutus Fields
                </p>
                <div className="space-y-1.5">
                  {TARGET_FIELDS.map((tf) => {
                    const mappedSource = getMappedSource(tf.key);
                    return (
                      <div
                        key={tf.key}
                        onDragOver={(e) => { if (step === "map") e.preventDefault(); }}
                        onDrop={() => handleDrop(tf.key)}
                        onClick={() => step === "map" && selectedSource && handleTargetClick(tf.key)}
                        className={`px-3 py-2.5 rounded-lg border-2 border-dashed transition-all ${
                          step !== "map"
                            ? mappedSource
                              ? "border-emerald-200 bg-emerald-50/30"
                              : "border-border"
                            : mappedSource
                            ? "border-emerald-300 bg-emerald-50/50"
                            : selectedSource
                            ? "border-brand/50 bg-brand/5 cursor-pointer"
                            : "border-border hover:border-muted-foreground/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{tf.label}</span>
                              {tf.required && (
                                <span className="text-[10px] text-red-500 font-medium">Required</span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{tf.description}</p>
                          </div>
                          {mappedSource && (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="success" className="font-mono text-[10px]">
                                {mappedSource}
                              </Badge>
                              {step === "map" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeMapping(tf.key); }}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {step === "map" && (
              <div className="mt-6 flex items-center gap-3">
                <Button
                  onClick={handleSaveMappings}
                  disabled={saving || !hasRequiredMappings}
                >
                  {saving ? "Saving..." : "Save Mappings"}
                </Button>
                {!hasRequiredMappings && (
                  <p className="text-xs text-muted-foreground">
                    Map at least Email and Full Name to continue.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Re-link Orphaned Records */}
      {step === "done" && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Re-link Orphaned Records</CardTitle>
                <InfoTooltip
                  widthClass="w-[22rem]"
                  align="left"
                  text={
                    <span className="space-y-2 block">
                      <span className="block">
                        When usage data is ingested from a provider, each record carries an identifier
                        (email, external user id, Cursor account id, etc.). We try to match it to a
                        user in your directory at ingest time.
                      </span>
                      <span className="block">
                        If no match is found — e.g. the directory hasn&apos;t been synced yet, the
                        user was added later, or the provider sends a personal email — the record
                        is stored as <strong>orphaned</strong>: kept with its full cost / token data,
                        but not attached to any user, team, or department, so it doesn&apos;t roll up
                        into reports.
                      </span>
                      <span className="block">
                        <strong>Re-link</strong> sweeps every orphaned record and re-runs matching
                        against the current directory:
                      </span>
                      <span className="block">
                        • <strong>relinked</strong> – attached to a user that now exists<br />
                        • <strong>merged</strong> – multiple provider records for the same person
                        unified onto one user<br />
                        • <strong>unresolved</strong> – still no match (often personal emails or
                        former employees)
                      </span>
                      <span className="block text-muted-foreground">
                        Safe and idempotent. Use the schedule below to run it automatically after
                        each directory sync.
                      </span>
                    </span>
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Usage records that could not be matched to a user during sync can be
                retroactively linked after the directory is updated.
              </p>

              <div className="flex items-center gap-4">
                <div className="rounded-lg border border-border px-4 py-3 bg-muted/30">
                  <p className="text-2xl font-bold tabular-nums">{orphanedCount}</p>
                  <p className="text-[11px] text-muted-foreground">Orphaned records</p>
                </div>
                {lastRelinkAt && (
                  <div className="text-xs text-muted-foreground">
                    Last re-link: {new Date(lastRelinkAt).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleRelink} disabled={relinking || orphanedCount === 0}>
                  {relinking ? "Re-linking..." : "Re-link Now"}
                </Button>
                {orphanedCount === 0 && !relinkResult && (
                  <p className="text-xs text-muted-foreground">No orphaned records to re-link</p>
                )}
              </div>

              {relinkError && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                  <p className="text-sm font-medium text-red-700">{relinkError}</p>
                </div>
              )}

              {relinkResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-1">
                  <p className="text-sm font-medium text-emerald-700">
                    Re-link complete: {relinkResult.relinked} linked, {relinkResult.merged} merged, {relinkResult.unresolved} unresolved
                  </p>
                  <p className="text-xs text-emerald-600">
                    {relinkResult.total} total orphaned records processed
                  </p>
                </div>
              )}

              <div className="border-t border-border pt-4 mt-4">
                <p className="text-xs font-medium mb-3">Automatic Re-link Schedule</p>
                <div className="flex items-end gap-3">
                  <div className="w-64">
                    <Select
                      label="Re-link interval"
                      options={RELINK_INTERVAL_OPTIONS}
                      value={relinkInterval}
                      onChange={(e) => setRelinkInterval(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleSaveRelinkInterval}
                    disabled={relinkInterval === currentRelinkInterval || relinkSaving}
                    size="sm"
                  >
                    {relinkSaving ? "Saving..." : "Save"}
                  </Button>
                  {relinkSaved && (
                    <span className="text-xs text-emerald-600 font-medium">Saved</span>
                  )}
                </div>
                {relinkIntervalError && (
                  <p className="text-sm text-red-600 font-medium mt-2">{relinkIntervalError}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function GraphIntegrationPage() {
  return <DirectorySyncContent />;
}
