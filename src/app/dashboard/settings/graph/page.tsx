"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users, Link2, ArrowRight, GripVertical, Check,
  RefreshCw, Eye, EyeOff, AlertTriangle, Trash2,
} from "lucide-react";

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

export default function GraphIntegrationPage() {
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
  const [isConfigured, setIsConfigured] = useState(false);

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
    try {
      const res = await fetch("/api/v1/graph/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSyncResult({ total: data.total, created: data.created, updated: data.updated });
    } catch {
      // silently fail
    } finally {
      setSyncing(false);
    }
  };

  const hasRequiredMappings = mappings.some((m) => m.targetField === "email") &&
    mappings.some((m) => m.targetField === "name");

  return (
    <div className="space-y-6">
      <Header
        title="Directory Sync"
        description="Connect your Microsoft Graph API (Active Directory) and map fields to Agent Plutus"
      />

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

      {/* Step 3: Sync */}
      {step === "done" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Sync Directory</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pull users from your Active Directory using the configured field mappings.
            </p>
            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Now"}
            </Button>
            {syncResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-sm font-medium text-emerald-700">
                  Sync complete: {syncResult.total} users processed ({syncResult.created} created, {syncResult.updated} updated)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
