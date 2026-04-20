"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plug, Eye, EyeOff, Loader2, Radar, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { api } from "@/lib/dashboard-api";
import { PROVIDER_LABELS } from "@/lib/utils";
import type { DiscoveredEndpointSummary } from "./wizard";

interface ProbeResult {
  id: string;
  provider: string;
  providerLabel: string;
  apiName: string;
  endpointName: string;
  description: string;
  internalProvider?: string;
  status: "ok" | "no_data" | "auth_failed" | "not_found" | "rate_limited" | "skipped" | "error";
  httpStatus?: number;
  body?: unknown;
  fields?: string[];
  rowCount?: number;
}

interface InitEvent { type: "init"; keyHint: string; endpoints: ProbeResult[] }
interface ResultEvent { type: "result"; result: ProbeResult }
interface DoneEvent { type: "done" }

export function StepAddProvider({
  onNext,
}: {
  onNext: (args: { internalProvider: string; discoveredEndpoints: DiscoveredEndpointSummary[]; apiKey: string }) => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [chosenProvider, setChosenProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const successResults = results.filter((r) => r.status === "ok" || r.status === "no_data");
  const successByProvider = new Map<string, { providerLabel: string; results: ProbeResult[]; internalProvider?: string }>();
  for (const r of successResults) {
    let group = successByProvider.get(r.provider);
    if (!group) {
      group = { providerLabel: r.providerLabel, results: [], internalProvider: r.internalProvider };
      successByProvider.set(r.provider, group);
    }
    group.results.push(r);
    if (!group.internalProvider && r.internalProvider) group.internalProvider = r.internalProvider;
  }

  const handleRun = async () => {
    if (!keyInput.trim()) return;
    setRunning(true);
    setError(null);
    setResults([]);
    setCompleted(0);
    setTotal(0);
    setKeyHint(null);
    setChosenProvider(null);
    setSaveError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/v1/providers/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: keyInput.trim() }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Discovery failed (HTTP ${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let event: InitEvent | ResultEvent | DoneEvent;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "init") {
            setKeyHint(event.keyHint);
            setTotal(event.endpoints.length);
            setResults(event.endpoints.map((e) => ({ ...e, status: "skipped" as const })));
          } else if (event.type === "result") {
            setResults((prev) => prev.map((p) => (p.id === event.result.id ? event.result : p)));
            setCompleted((c) => c + 1);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Discovery failed");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleConfirm = async () => {
    if (!chosenProvider) return;
    const group = successByProvider.get(chosenProvider);
    if (!group?.internalProvider) {
      setSaveError("This provider doesn't have a sync adapter yet. You can request it from the Discovery page.");
      return;
    }
    setSavingProvider(true);
    setSaveError(null);
    try {
      // Save the credential against the internal provider type.
      const label = `${group.providerLabel} · ${group.results[0].apiName}`;
      await api.addProvider(group.internalProvider, keyInput.trim(), label);
      // Pass the matching successful endpoints into the next step (mapping).
      const endpoints: DiscoveredEndpointSummary[] = group.results
        .filter((r) => r.fields && r.fields.length > 0)
        .map((r) => ({
          id: r.id,
          apiName: r.apiName,
          endpointName: r.endpointName,
          fields: r.fields ?? [],
          body: r.body,
        }));
      onNext({
        internalProvider: group.internalProvider,
        discoveredEndpoints: endpoints,
        apiKey: keyInput.trim(),
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save provider credential");
    } finally {
      setSavingProvider(false);
    }
  };

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Add your first provider</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Paste any provider API key below. We&apos;ll probe every supported endpoint in
          parallel to figure out which provider it belongs to and what data it can reach.
          The key is sent to your own server, used to probe, and held in memory only — it
          isn&apos;t saved unless you confirm a successful match below.
        </p>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              type={showKey ? "text" : "password"}
              placeholder="sk-ant-… | sk-admin-… | AIza… | ghp_… | n8n token | { service-account JSON }"
              className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-1.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button onClick={handleRun} disabled={!keyInput.trim() || running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
            {running ? "Probing..." : "Run discovery"}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50/50 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
          </div>
        )}

        {(running || results.length > 0) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {keyHint && <span className="font-mono mr-2">{keyHint}</span>}
                {running ? `Probing… ${completed} / ${total}` : `Done · ${completed} / ${total}`}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${running ? "bg-brand" : "bg-emerald-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {!running && results.length > 0 && successByProvider.size === 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 flex items-start gap-2">
            <XCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              No endpoints responded for this key. Double-check it&apos;s the right scope (admin
              vs. project key) and try again.
            </p>
          </div>
        )}

        {!running && successByProvider.size > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Found a match — pick which provider to wire up
            </p>
            {[...successByProvider.entries()].map(([providerId, group]) => {
              const isChosen = chosenProvider === providerId;
              const supported = !!group.internalProvider;
              return (
                <button
                  key={providerId}
                  type="button"
                  onClick={() => supported && setChosenProvider(providerId)}
                  disabled={!supported}
                  className={`w-full text-left rounded-lg border p-4 transition-all ${
                    isChosen
                      ? "border-brand bg-brand/5 ring-1 ring-brand"
                      : supported
                      ? "border-border hover:border-muted-foreground/50"
                      : "border-border opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="rounded-md bg-muted p-1.5 mt-0.5">
                        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{group.providerLabel}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {group.results.length} endpoint{group.results.length === 1 ? "" : "s"} responded
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {group.results.slice(0, 4).map((r) => (
                            <span
                              key={r.id}
                              className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50/60 px-1.5 py-0.5 text-[10px]"
                              title={`${r.apiName} · ${r.endpointName}`}
                            >
                              <CheckCircle className="h-2.5 w-2.5 text-emerald-600" />
                              <span className="text-muted-foreground">{r.apiName}</span>
                              <span className="text-foreground/40">·</span>
                              <span className="font-medium">{r.endpointName}</span>
                            </span>
                          ))}
                          {group.results.length > 4 && (
                            <span className="text-[10px] text-muted-foreground self-center">
                              +{group.results.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {supported ? (
                      isChosen && <Badge variant="success">Selected</Badge>
                    ) : (
                      <Badge variant="outline" title="No sync adapter for this provider yet">
                        Not yet supported
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {saveError && (
          <p className="text-sm text-destructive whitespace-pre-line">{saveError}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            onClick={handleConfirm}
            disabled={!chosenProvider || savingProvider}
          >
            {savingProvider
              ? "Saving credential..."
              : chosenProvider
              ? `Save ${PROVIDER_LABELS[chosenProvider] ?? chosenProvider} & continue`
              : "Pick a provider above to continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
