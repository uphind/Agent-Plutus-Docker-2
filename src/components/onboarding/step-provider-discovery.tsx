"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plug, Eye, EyeOff, Loader2, Radar, CheckCircle, XCircle, AlertTriangle, Sparkles, SkipForward,
} from "lucide-react";
import { api } from "@/lib/dashboard-api";
import type { N8nCredentialPayload } from "@/lib/providers/n8n";
import { addRequestedIntegration } from "@/lib/requested-integrations";
import type { ProviderSelection } from "./step-select-providers";
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

export interface ProviderDiscoveryResult {
  internalProvider: string;
  discoveredEndpoints: DiscoveredEndpointSummary[];
  apiKey: string;
}

/**
 * Per-provider Discovery step. Differs from the standalone Discovery page:
 *
 *   - The Discovery POST is FILTERED to only this provider's endpoints, so
 *     the probe completes in seconds instead of the full ~87-endpoint sweep.
 *   - Empty-result and unsupported-internal-provider paths are first-class:
 *     the user always has a path forward (continue / skip / request).
 */
export function StepProviderDiscovery({
  selection,
  onNext,
  onSkip,
  positionLabel,
}: {
  selection: ProviderSelection;
  onNext: (result: ProviderDiscoveryResult) => void;
  onSkip: () => void;
  /** "Provider 2 of 4" — purely informational. */
  positionLabel?: string;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [n8nBaseUrl, setN8nBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [requestedAlready, setRequestedAlready] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const successResults = results.filter((r) => r.status === "ok" || r.status === "no_data");
  const noResultsAfterRun = !running && total > 0 && successResults.length === 0;

  const isN8n = selection.id === "n8n";
  const isMicrosoftGraph = selection.id === "microsoft_copilot";

  const handleRun = async () => {
    if (!keyInput.trim()) return;
    if (isN8n && !n8nBaseUrl.trim()) return;
    setRunning(true);
    setError(null);
    setResults([]);
    setCompleted(0);
    setTotal(0);
    setKeyHint(null);
    setSaveError(null);
    setRequestedAlready(false);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/v1/providers/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: keyInput.trim(),
          n8n_base_url: isN8n ? n8nBaseUrl.trim() : undefined,
          providers:
            selection.discoveryProviderIds.length > 0
              ? selection.discoveryProviderIds
              : undefined,
        }),
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

  const handleConfirmAndContinue = async () => {
    // Pick an internalProvider — prefer the selection's, fall back to the
    // first successful result's. (The "Other" tile uses the latter.)
    const internal =
      selection.internalProvider ??
      successResults.find((r) => r.internalProvider)?.internalProvider ??
      null;

    if (!internal) {
      setSaveError("This provider doesn't have a sync adapter yet — use the Request integration button instead.");
      return;
    }

    setSavingProvider(true);
    setSaveError(null);
    try {
      const sample = successResults[0];
      const label = `${sample?.providerLabel ?? selection.label} · ${sample?.apiName ?? "Discovery"}`;
      let credential = keyInput.trim();
      if (internal === "n8n") {
        const payload: N8nCredentialPayload = {
          v: 1,
          baseUrl: n8nBaseUrl.trim().replace(/\/+$/, ""),
          apiKey: keyInput.trim(),
        };
        credential = JSON.stringify(payload);
      }
      await api.addProvider(internal, credential, label);
      const endpoints: DiscoveredEndpointSummary[] = successResults
        .filter((r) => (r.internalProvider ?? null) === internal)
        .filter((r) => r.fields && r.fields.length > 0)
        .map((r) => ({
          id: r.id,
          apiName: r.apiName,
          endpointName: r.endpointName,
          fields: r.fields ?? [],
          body: r.body,
        }));
      onNext({
        internalProvider: internal,
        discoveredEndpoints: endpoints,
        apiKey: credential,
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save provider credential");
    } finally {
      setSavingProvider(false);
    }
  };

  const handleRequestIntegration = () => {
    addRequestedIntegration({
      provider: selection.id,
      providerLabel: selection.label,
      apiName: successResults[0]?.apiName,
      endpointName: successResults[0]?.endpointName,
      keyHint: keyHint ?? undefined,
      requestedAt: new Date().toISOString(),
    });
    setRequestedAlready(true);
  };

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Connect {selection.label}</CardTitle>
          </div>
          {positionLabel && (
            <span className="text-[11px] text-muted-foreground">{positionLabel}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {isMicrosoftGraph ? (
            <>
              Paste a valid <strong>Microsoft Graph access token</strong> (Bearer{" "}
              <span className="font-mono">eyJ…</span>) from Entra ID. This is{" "}
              <strong>not</strong> a static vendor API key — it is an OAuth access token with
              the right Graph scopes (for example <span className="font-mono">User.Read</span>{" "}
              for <span className="font-mono">/me</span>; Copilot usage reports need{" "}
              <span className="font-mono">Reports.Read.All</span>). We probe only{" "}
              <span className="font-mono">microsoft_copilot</span> endpoints so this stays fast.
            </>
          ) : isN8n ? (
            <>
              Enter your <strong>n8n instance base URL</strong> and <strong>API key</strong> (from
              n8n Settings → API). We probe only the n8n REST surface. The key is stored encrypted
              together with the URL as one credential.
            </>
          ) : (
            <>
              Paste your <strong>{selection.label}</strong> API key. We&apos;ll probe only{" "}
              <span className="font-mono">{selection.label}</span>&apos;s endpoints (
              {selection.discoveryProviderIds.length > 0
                ? `${selection.discoveryProviderIds.join(", ")}`
                : "every supported endpoint, since you picked Other"}
              ) so this is fast.
              {!selection.internalProvider && selection.id !== "other" && (
                <>
                  {" "}There&apos;s no sync adapter for {selection.label} yet, so we can&apos;t
                  save the credential — but we&apos;ll log it on your requested-integrations list.
                </>
              )}
            </>
          )}
        </p>

        {isN8n && (
          <Input
            label="n8n base URL"
            placeholder="https://n8n.example.com"
            value={n8nBaseUrl}
            onChange={(e) => setN8nBaseUrl(e.target.value)}
          />
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              type={showKey ? "text" : "password"}
              placeholder={
                isMicrosoftGraph
                  ? "Entra ID access token (eyJ…)"
                  : isN8n
                    ? "n8n API key"
                    : `${selection.label} API key`
              }
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
          <Button
            onClick={handleRun}
            disabled={!keyInput.trim() || running || (isN8n && !n8nBaseUrl.trim())}
          >
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

        {!running && successResults.length > 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
            <p className="text-sm font-semibold text-emerald-900">
              {successResults.length} endpoint{successResults.length === 1 ? "" : "s"} responded
            </p>
            <div className="flex flex-wrap gap-1.5">
              {successResults.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-card px-2 py-0.5 text-[11px]"
                  title={`${r.apiName} · ${r.endpointName}`}
                >
                  <CheckCircle className="h-2.5 w-2.5 text-emerald-600" />
                  <span className="text-muted-foreground">{r.apiName}</span>
                  <span className="text-foreground/40">·</span>
                  <span className="font-medium">{r.endpointName}</span>
                  {r.fields && (
                    <span className="text-muted-foreground">· {r.fields.length} fields</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {noResultsAfterRun && (
          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 flex items-start gap-2">
            <XCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">
                Sorry — we couldn&apos;t find anything for {selection.label} with this key.
              </p>
              <p className="text-xs mt-1">
                Double-check the key has the right scope (admin / org / billing — not just a
                project key) and try again, or skip and come back to this provider later.
              </p>
            </div>
          </div>
        )}

        {saveError && (
          <p className="text-sm text-destructive whitespace-pre-line">{saveError}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onSkip}>
            <SkipForward className="h-3.5 w-3.5" />
            Skip {selection.label}
          </Button>
          {!selection.internalProvider && successResults.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                handleRequestIntegration();
                onSkip();
              }}
              disabled={requestedAlready}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {requestedAlready ? "Requested · skipping" : `Request ${selection.label} integration`}
            </Button>
          )}
          {selection.internalProvider && successResults.length > 0 && (
            <Button
              onClick={handleConfirmAndContinue}
              disabled={savingProvider}
            >
              {savingProvider ? "Saving credential…" : `Save & continue to mapping`}
            </Button>
          )}
        </div>

        {!selection.internalProvider && successResults.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            No sync adapter yet — Save &amp; map will be enabled once we ship one.
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
