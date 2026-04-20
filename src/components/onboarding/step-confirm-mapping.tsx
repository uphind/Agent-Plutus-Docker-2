"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, GitCompareArrows, AlertTriangle } from "lucide-react";
import { TARGET_FIELDS } from "@/lib/providers/field-definitions";
import {
  getPresetForEndpoint,
  getPresetsForProvider,
  type MappingPreset,
} from "@/lib/providers/mapping-presets";
import { api } from "@/lib/dashboard-api";
import { PROVIDER_LABELS } from "@/lib/utils";
import type { DiscoveredEndpointSummary } from "./wizard";

/** Targets that MUST be mapped before the wizard lets the user finish. */
const REQUIRED_TARGET_KEYS = ["userRef", "model", "date"];

interface Mapping {
  sourceField: string;
  targetField: string;
}

function lookupSampleAt(body: unknown, path: string): unknown {
  if (body === null || body === undefined) return undefined;
  const parts = path.split(".").flatMap((p) => (p.endsWith("[]") ? [p.slice(0, -2), "[]"] : [p]));
  let cur: unknown = body;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (part === "[]") {
      if (Array.isArray(cur)) cur = cur[0];
      else return undefined;
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Drop the `[].results[]` array prefix from a dotted path so source keys
 * line up with what the existing adapters expect. */
function discoveredPathToMappingKey(fullPath: string): string {
  const lastArrayIdx = fullPath.lastIndexOf("[]");
  const leaf = lastArrayIdx >= 0 ? fullPath.slice(lastArrayIdx + 3) : fullPath;
  return leaf || fullPath;
}

export function StepConfirmMapping({
  internalProvider,
  discoveredEndpoints,
  providerApiKey,
  onNext,
}: {
  internalProvider: string | null;
  discoveredEndpoints: DiscoveredEndpointSummary[];
  providerApiKey: string;
  onNext: () => void;
}) {
  const [activeEndpointId, setActiveEndpointId] = useState<string | null>(
    discoveredEndpoints[0]?.id ?? null
  );
  const activeEndpoint =
    discoveredEndpoints.find((e) => e.id === activeEndpointId) ?? discoveredEndpoints[0] ?? null;

  const presets = useMemo(
    () => (internalProvider ? getPresetsForProvider(internalProvider) : []),
    [internalProvider]
  );
  const [presetId, setPresetId] = useState<string | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestedTargets, setAiSuggestedTargets] = useState<Set<string>>(new Set());
  const [aiError, setAiError] = useState<string | null>(null);

  // Auto-apply the matching preset on first paint and whenever the active
  // endpoint changes.
  useEffect(() => {
    if (!internalProvider) return;
    const preset = getPresetForEndpoint(internalProvider, activeEndpoint?.id);
    if (preset) {
      setPresetId(preset.id);
      setMappings(preset.mappings.map((m) => ({ ...m })));
    }
  }, [internalProvider, activeEndpoint]);

  // Check if AI Tools is configured so we know whether to show the AI button
  // and (eventually) auto-run it.
  useEffect(() => {
    api
      .getAiToolsConfig()
      .then((data: { configured: boolean }) => setAiAvailable(!!data.configured))
      .catch(() => setAiAvailable(false));
  }, []);

  const handleApplyPreset = (id: string) => {
    const next = presets.find((p) => p.id === id);
    if (!next) return;
    setPresetId(next.id);
    applyPreset(next);
  };

  const applyPreset = (preset: MappingPreset) => {
    setMappings(preset.mappings.map((m) => ({ ...m })));
    setAiSuggestedTargets(new Set());
  };

  const handleAiSuggest = async () => {
    if (!internalProvider || !activeEndpoint) return;
    setAiSuggesting(true);
    setAiError(null);
    try {
      const data = (await api.suggestMapping({
        provider: internalProvider,
        apiName: activeEndpoint.apiName,
        endpointName: activeEndpoint.endpointName,
        sourceFields: activeEndpoint.fields.map((path) => ({
          path,
          sample: lookupSampleAt(activeEndpoint.body, path),
        })),
        targetFields: TARGET_FIELDS.map((t) => ({
          key: t.key,
          label: t.label,
          description: t.description,
          required: t.required,
        })),
      })) as { suggestions: Array<{ sourceField: string; targetField: string }> };
      const merged = new Map(mappings.map((m) => [m.targetField, m]));
      const suggestedSet = new Set<string>();
      for (const s of data.suggestions) {
        if (!s.sourceField || !s.targetField) continue;
        merged.set(s.targetField, { sourceField: s.sourceField, targetField: s.targetField });
        suggestedSet.add(s.targetField);
      }
      setMappings([...merged.values()]);
      setAiSuggestedTargets(suggestedSet);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI suggestion failed");
    } finally {
      setAiSuggesting(false);
    }
  };

  const mappedTargets = useMemo(() => new Set(mappings.map((m) => m.targetField)), [mappings]);
  const missingRequired = REQUIRED_TARGET_KEYS.filter((k) => !mappedTargets.has(k));

  const handleSaveAndContinue = async () => {
    if (!internalProvider || missingRequired.length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Reuse the existing field-mapping endpoint via the api client.
      await fetch("/api/v1/providers/field-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: internalProvider, mappings }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed to save mappings (HTTP ${res.status})`);
        }
      });
      onNext();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  };

  if (!internalProvider || discoveredEndpoints.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No provider was selected in the previous step.
        </CardContent>
      </Card>
    );
  }

  // Suppress unused-var for providerApiKey (held in case a future step needs
  // it for a re-probe).
  void providerApiKey;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Confirm field mapping</CardTitle>
          </div>
          <Badge variant="info">{PROVIDER_LABELS[internalProvider] ?? internalProvider}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We&apos;ve auto-applied the preset that fits the discovered endpoint. Review the
          mappings below — required fields are marked. The wizard can&apos;t finish until
          every required field is mapped.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Endpoint switcher */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Endpoint
            </label>
            <select
              className="w-full h-9 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={activeEndpointId ?? ""}
              onChange={(e) => setActiveEndpointId(e.target.value)}
            >
              {discoveredEndpoints.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.apiName} · {d.endpointName}
                </option>
              ))}
            </select>
          </div>

          {/* Preset switcher */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preset
            </label>
            <select
              className="w-full h-9 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={presetId ?? ""}
              onChange={(e) => handleApplyPreset(e.target.value)}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {aiAvailable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAiSuggest}
            disabled={aiSuggesting}
          >
            <Sparkles className={`h-3.5 w-3.5 ${aiSuggesting ? "animate-pulse" : ""}`} />
            {aiSuggesting ? "AI thinking..." : "Suggest with AI"}
          </Button>
        )}

        {aiError && (
          <div className="rounded-md border border-red-200 bg-red-50/50 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{aiError}</p>
          </div>
        )}

        {/* Mapping table */}
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Agent-Plutus field</th>
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody>
              {TARGET_FIELDS.map((tf) => {
                const m = mappings.find((x) => x.targetField === tf.key);
                const isRequired = REQUIRED_TARGET_KEYS.includes(tf.key);
                const isSuggested = aiSuggestedTargets.has(tf.key);
                return (
                  <tr key={tf.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{tf.label}</span>
                        {isRequired && (
                          <span className="text-[10px] text-red-500 font-medium">Required</span>
                        )}
                      </div>
                      {tf.description && (
                        <p className="text-[10px] text-muted-foreground">{tf.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        className={`w-full h-8 rounded-md border bg-card px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring ${
                          isRequired && !m ? "border-red-300" : "border-border"
                        }`}
                        value={m?.sourceField ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setMappings((prev) => {
                            const filtered = prev.filter((x) => x.targetField !== tf.key);
                            if (!value) return filtered;
                            return [...filtered, { sourceField: value, targetField: tf.key }];
                          });
                          setAiSuggestedTargets((prev) => {
                            const next = new Set(prev);
                            next.delete(tf.key);
                            return next;
                          });
                        }}
                      >
                        <option value="">— Not mapped —</option>
                        {(activeEndpoint?.fields ?? []).map((path) => {
                          const key = discoveredPathToMappingKey(path);
                          return (
                            <option key={path} value={key}>
                              {key} ({path})
                            </option>
                          );
                        })}
                      </select>
                      {isSuggested && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-brand">
                          <Sparkles className="h-2.5 w-2.5" /> AI suggestion
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {missingRequired.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <strong>Missing required:</strong>{" "}
            {missingRequired
              .map((k) => TARGET_FIELDS.find((t) => t.key === k)?.label ?? k)
              .join(", ")}
            . Map these to continue.
          </p>
        )}

        {saveError && (
          <p className="text-sm text-destructive whitespace-pre-line">{saveError}</p>
        )}

        <div className="flex items-center justify-end pt-2 border-t border-border">
          <Button
            onClick={handleSaveAndContinue}
            disabled={saving || missingRequired.length > 0}
            title={missingRequired.length > 0 ? "Map all required fields first" : ""}
          >
            {saving ? "Saving..." : "Save mappings & finish"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
