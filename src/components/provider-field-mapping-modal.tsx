"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/dashboard-api";
import {
  TARGET_FIELDS,
  getSourceFields,
  getDefaultMappings,
} from "@/lib/providers/field-definitions";
import type { FieldDef } from "@/lib/providers/field-definitions";
import {
  GripVertical, ArrowRight, Check, Trash2, RotateCcw, Wand2,
  Download, AlertTriangle, Radar,
} from "lucide-react";
import { PROVIDER_LABELS } from "@/lib/utils";

interface Mapping {
  sourceField: string;
  targetField: string;
}

/**
 * One endpoint's worth of discovered shape, passed in by the Discovery page so
 * the modal can show real fields + sample values without re-hitting the API.
 */
export interface DiscoveredEndpoint {
  id: string;
  apiName: string;
  endpointName: string;
  /** Leaf-only dotted paths (e.g. "data[].results[].model"). */
  fields: string[];
  /** Full parsed response body — used for per-field sample value lookups. */
  body: unknown;
}

interface Props {
  open: boolean;
  onClose: () => void;
  provider: string;
  /**
   * Optional list of endpoints that returned data during discovery. When
   * provided the modal shows an endpoint pill picker on the source side and
   * lists the live discovered fields (with sample values) instead of (or in
   * addition to) the static built-in defaults.
   */
  discoveredEndpoints?: DiscoveredEndpoint[];
}

export function ProviderFieldMappingModal({ open, onClose, provider, discoveredEndpoints }: Props) {
  const [sourceFields, setSourceFields] = useState<FieldDef[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [isDefault, setIsDefault] = useState(true);

  const [sampleValues, setSampleValues] = useState<Record<string, unknown>>({});
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // When opened from Discovery: pick the first discovered endpoint by default
  // and let the user switch between them via the pill bar.
  const [activeDiscoveredId, setActiveDiscoveredId] = useState<string | null>(
    discoveredEndpoints && discoveredEndpoints.length > 0 ? discoveredEndpoints[0].id : null
  );

  useEffect(() => {
    if (discoveredEndpoints && discoveredEndpoints.length > 0) {
      setActiveDiscoveredId((prev) => prev ?? discoveredEndpoints[0].id);
    } else {
      setActiveDiscoveredId(null);
    }
  }, [discoveredEndpoints]);

  const activeDiscovered = useMemo(
    () =>
      discoveredEndpoints?.find((d) => d.id === activeDiscoveredId) ??
      discoveredEndpoints?.[0] ??
      null,
    [discoveredEndpoints, activeDiscoveredId]
  );

  const label = PROVIDER_LABELS[provider] ?? provider;

  const load = useCallback(async () => {
    if (!provider) return;
    setLoading(true);
    try {
      const data = await api.getProviderFieldMapping(provider);
      setSourceFields(data.sourceFields ?? getSourceFields(provider));
      setMappings(data.mappings ?? []);
      setIsDefault(data.isDefault ?? true);
    } catch {
      setSourceFields(getSourceFields(provider));
      setMappings(getDefaultMappings(provider));
      setIsDefault(true);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (open) {
      load();
      setSaved(false);
      setSaveError(null);
      setSampleValues({});
      setHasFetched(false);
      setFetchError(null);
    }
  }, [open, load]);

  // --- Fetch live sample ---
  const handleFetchSample = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const data = await api.fetchProviderSample(provider);
      const liveFields: string[] = data.availableFields ?? [];
      const rows: Record<string, unknown>[] = data.rows ?? [];

      // Build a "best sample value" map — pick first non-null value for each field
      const values: Record<string, unknown> = {};
      for (const row of rows) {
        for (const [k, v] of Object.entries(row)) {
          if (values[k] === undefined && v != null) {
            values[k] = v;
          }
        }
      }
      setSampleValues(values);

      // Merge live fields into source fields — add any new ones the API returned
      const existingKeys = new Set(sourceFields.map((f) => f.key));
      const newFields: FieldDef[] = [];
      for (const key of liveFields) {
        if (!existingKeys.has(key)) {
          newFields.push({ key, label: key, description: "Discovered from live API" });
        }
      }
      if (newFields.length > 0) {
        setSourceFields((prev) => [...prev, ...newFields]);
      }

      setHasFetched(true);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch sample data");
    } finally {
      setFetching(false);
    }
  };

  // --- Drag & drop ---
  const handleDragStart = (field: string) => setDraggedField(field);

  const handleDrop = (targetField: string) => {
    if (!draggedField) return;
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.targetField !== targetField);
      return [...filtered, { sourceField: draggedField, targetField }];
    });
    setDraggedField(null);
    setSaved(false);
  };

  // --- Click-to-map ---
  const handleSourceClick = (field: string) => {
    setSelectedSource(selectedSource === field ? null : field);
  };

  const handleTargetClick = (targetField: string) => {
    if (!selectedSource) return;
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.targetField !== targetField);
      return [...filtered, { sourceField: selectedSource, targetField }];
    });
    setSelectedSource(null);
    setSaved(false);
  };

  const removeMapping = (targetField: string) => {
    setMappings((prev) => prev.filter((m) => m.targetField !== targetField));
    setSaved(false);
  };

  const getMappedSource = (targetField: string) =>
    mappings.find((m) => m.targetField === targetField)?.sourceField;

  const isMapped = (sourceField: string) =>
    mappings.some((m) => m.sourceField === sourceField);

  // --- Auto-map based on defaults ---
  const handleAutoMap = () => {
    setMappings(getDefaultMappings(provider));
    setSaved(false);
  };

  const handleClearAll = () => {
    setMappings([]);
    setSaved(false);
  };

  // --- Save ---
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveProviderFieldMapping(provider, mappings);
      setSaved(true);
      setIsDefault(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  };

  function formatSampleValue(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.length > 30 ? v.slice(0, 30) + "..." : v;
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return String(v);
    return JSON.stringify(v).slice(0, 30);
  }

  /**
   * Discovered fields use full dotted paths (e.g. `data[].results[].model`).
   * The internal adapters and the existing static field definitions expect
   * the leaf segment (`model`, `cache_creation.ephemeral_1h_input_tokens`,
   * etc.) — so when the user maps a discovered field we save the leaf form.
   *
   * For nested-but-non-array dotted leaves like
   * `data[].results[].cache_creation.ephemeral_1h_input_tokens` we strip the
   * array container prefix but keep any trailing dotted nesting (since some
   * existing source field definitions use the latter shape).
   */
  function discoveredPathToMappingKey(fullPath: string): string {
    // Drop everything up to and including the last `[]` segment.
    const lastArrayIdx = fullPath.lastIndexOf("[]");
    const leaf = lastArrayIdx >= 0 ? fullPath.slice(lastArrayIdx + 3) : fullPath;
    return leaf || fullPath;
  }

  /**
   * Walk the parsed response body using the dotted path (with `[]` markers)
   * to extract the first available sample value.
   */
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${label} — Field Mapping`}
      className="max-w-4xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Drag a source field from the left and drop it onto the matching target on the right.
              Or click a source, then click a target.
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleFetchSample}
                disabled={fetching}
              >
                <Download className={`h-3.5 w-3.5 ${fetching ? "animate-pulse" : ""}`} />
                {fetching ? "Fetching..." : hasFetched ? "Refresh Data" : "Fetch Live Data"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleAutoMap}>
                <Wand2 className="h-3.5 w-3.5" />
                Auto
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClearAll}>
                <RotateCcw className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>

          {fetchError && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{fetchError}</p>
            </div>
          )}

          {isDefault && !hasFetched && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2">
              <p className="text-xs text-blue-700">
                Showing default mappings. Click <strong>Fetch Live Data</strong> to pull real
                fields and sample values from the API, or edit and save to lock in your configuration.
              </p>
            </div>
          )}

          {hasFetched && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
              <p className="text-xs text-emerald-700">
                Live data loaded — sample values are shown next to each source field.
                Fields not in the static list are marked as <em>discovered</em>.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 items-start">
            {/* Source fields */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {label} API Fields
              </p>

              {/* Endpoint pill bar — only shown when discoveredEndpoints were
                  passed in (i.e. the modal was opened from Discovery). Lets
                  the user switch between the response shape of each endpoint
                  that successfully returned data. */}
              {discoveredEndpoints && discoveredEndpoints.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Radar className="h-3 w-3" />
                    Live discovered endpoints ({discoveredEndpoints.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {discoveredEndpoints.map((d) => {
                      const isActive = activeDiscoveredId === d.id || (!activeDiscoveredId && discoveredEndpoints[0].id === d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setActiveDiscoveredId(d.id)}
                          className={`text-[11px] px-2 py-1 rounded-md border transition-all ${
                            isActive
                              ? "border-brand bg-brand/5 text-foreground font-medium"
                              : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50"
                          }`}
                          title={`${d.apiName} · ${d.endpointName}`}
                        >
                          {d.endpointName}
                          <span className="text-muted-foreground ml-1">({d.fields.length})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                {/* Live discovered fields for the active endpoint (when present) */}
                {activeDiscovered && activeDiscovered.fields.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 bg-card/95 backdrop-blur-sm z-[1]">
                      <span className="font-mono text-foreground/70">{activeDiscovered.apiName}</span>
                      <span className="text-foreground/30">·</span>
                      <span>{activeDiscovered.endpointName}</span>
                    </div>
                    {activeDiscovered.fields.map((path) => {
                      const mappingKey = discoveredPathToMappingKey(path);
                      const mapped = isMapped(mappingKey);
                      const isSelected = selectedSource === mappingKey;
                      const sample = lookupSampleAt(activeDiscovered.body, path);
                      const hasSample = sample !== undefined && sample !== null;
                      return (
                        <div
                          key={`disc-${path}`}
                          draggable
                          onDragStart={() => handleDragStart(mappingKey)}
                          onClick={() => handleSourceClick(mappingKey)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                            isSelected
                              ? "border-brand bg-brand/5 ring-1 ring-brand cursor-pointer"
                              : mapped
                              ? "border-emerald-200 bg-emerald-50/50 cursor-grab"
                              : "border-border hover:border-muted-foreground/50 cursor-grab"
                          }`}
                          title={path}
                        >
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-xs truncate">{mappingKey}</span>
                              <Badge variant="outline" className="text-[9px] py-0 px-1 shrink-0">live</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate font-mono" title={path}>
                              {path}
                            </p>
                            {hasSample ? (
                              <p className="text-[10px] text-muted-foreground truncate" title={String(sample)}>
                                <span className="text-foreground/60">= </span>
                                {formatSampleValue(sample)}
                              </p>
                            ) : (
                              <p className="text-[10px] text-muted-foreground/50 italic">null in sample</p>
                            )}
                          </div>
                          {mapped && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                        </div>
                      );
                    })}

                    {/* Visual divider before the static defaults */}
                    {sourceFields.length > 0 && (
                      <div className="flex items-center gap-2 px-1 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        <div className="h-px flex-1 bg-border" />
                        <span>Built-in field definitions</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                  </>
                )}

                {/* Static / built-in source fields (always shown) */}
                {sourceFields.map((sf) => {
                  const mapped = isMapped(sf.key);
                  const isSelected = selectedSource === sf.key;
                  const sample = sampleValues[sf.key];
                  const hasSample = sample !== undefined && sample !== null;
                  return (
                    <div
                      key={sf.key}
                      draggable
                      onDragStart={() => handleDragStart(sf.key)}
                      onClick={() => handleSourceClick(sf.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                        isSelected
                          ? "border-brand bg-brand/5 ring-1 ring-brand cursor-pointer"
                          : mapped
                          ? "border-emerald-200 bg-emerald-50/50 cursor-grab"
                          : "border-border hover:border-muted-foreground/50 cursor-grab"
                      }`}
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs">{sf.key}</span>
                          {sf.description === "Discovered from live API" && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1">new</Badge>
                          )}
                        </div>
                        {hasFetched && hasSample ? (
                          <p className="text-[10px] text-muted-foreground truncate" title={String(sample)}>
                            <span className="text-foreground/60">= </span>
                            {formatSampleValue(sample)}
                          </p>
                        ) : hasFetched && !hasSample ? (
                          <p className="text-[10px] text-muted-foreground/50 italic">no data</p>
                        ) : sf.description && sf.description !== "Discovered from live API" ? (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {sf.description}
                          </p>
                        ) : null}
                      </div>
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
                Tokenear Fields
              </p>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                {TARGET_FIELDS.map((tf) => {
                  const mappedSource = getMappedSource(tf.key);
                  return (
                    <div
                      key={tf.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(tf.key)}
                      onClick={() => selectedSource && handleTargetClick(tf.key)}
                      className={`px-3 py-2.5 rounded-lg border-2 border-dashed transition-all ${
                        mappedSource
                          ? "border-emerald-300 bg-emerald-50/50"
                          : selectedSource
                          ? "border-brand/50 bg-brand/5 cursor-pointer"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{tf.label}</span>
                            {tf.required && (
                              <span className="text-[10px] text-red-500 font-medium">Required</span>
                            )}
                          </div>
                          {tf.description && (
                            <p className="text-[11px] text-muted-foreground">{tf.description}</p>
                          )}
                        </div>
                        {mappedSource && (
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <Badge variant="success" className="font-mono text-[10px]">
                              {mappedSource}
                            </Badge>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeMapping(tf.key); }}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-border">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Mappings"}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {saved && (
              <span className="text-xs text-emerald-600 font-medium">
                Mappings saved successfully
              </span>
            )}
            {saveError && (
              <span className="text-xs text-destructive font-medium">
                {saveError}
              </span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
