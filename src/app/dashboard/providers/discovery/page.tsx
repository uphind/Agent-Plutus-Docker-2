"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ProviderFieldMappingModal } from "@/components/provider-field-mapping-modal";
import { api } from "@/lib/dashboard-api";
import { buildSchemaTemplate } from "@/lib/providers/discovery-catalog";
import { useRequestedIntegrations } from "@/lib/requested-integrations";
import {
  Radar,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldOff,
  Plug,
  Download,
  Settings2,
  FileJson,
  Save,
  KeyRound,
  Hourglass,
  StopCircle,
  Sparkles,
} from "lucide-react";

type ProbeStatus =
  | "pending"
  | "ok"
  | "no_data"
  | "auth_failed"
  | "not_found"
  | "rate_limited"
  | "skipped"
  | "error";

interface EndpointInfo {
  id: string;
  provider: string;
  providerLabel: string;
  apiName: string;
  endpointName: string;
  description: string;
  docsUrl?: string;
  authHint: string;
  internalProvider?: string;
}

interface ProbeResult extends EndpointInfo {
  status: ProbeStatus;
  httpStatus?: number;
  elapsedMs?: number;
  url?: string;
  method?: string;
  body?: unknown;
  fields?: string[];
  rowCount?: number;
  message?: string;
  skipReason?: string;
  needs?: string[];
}

interface InitEvent {
  type: "init";
  keyHint: string;
  detection: { hint: string; likelyProviders: string[] };
  context: Record<string, string | undefined>;
  endpoints: EndpointInfo[];
}

interface ResultEvent {
  type: "result";
  result: ProbeResult;
}

interface DoneEvent {
  type: "done";
  summary: {
    attempted: number;
    ok: number;
    noData: number;
    authFailed: number;
    notFound: number;
    rateLimited: number;
    skipped: number;
    errored: number;
  };
}

type StreamEvent = InitEvent | ResultEvent | DoneEvent;

const STATUS_META: Record<
  Exclude<ProbeStatus, "pending">,
  { variant: "success" | "warning" | "error" | "info" | "outline"; label: string; Icon: typeof CheckCircle }
> = {
  ok: { variant: "success", label: "OK · data", Icon: CheckCircle },
  no_data: { variant: "info", label: "Auth OK, empty", Icon: AlertTriangle },
  auth_failed: { variant: "error", label: "Auth failed", Icon: XCircle },
  not_found: { variant: "warning", label: "404", Icon: XCircle },
  rate_limited: { variant: "warning", label: "Rate limited", Icon: Clock },
  skipped: { variant: "outline", label: "Skipped", Icon: ShieldOff },
  error: { variant: "error", label: "Error", Icon: XCircle },
};

export default function DiscoveryPage() {
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [githubOrg, setGithubOrg] = useState("");
  const [githubEnterprise, setGithubEnterprise] = useState("");
  const [n8nBaseUrl, setN8nBaseUrl] = useState("");
  const [vertexProjectId, setVertexProjectId] = useState("");
  const [vertexLocation, setVertexLocation] = useState("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [detectionHint, setDetectionHint] = useState<string | null>(null);
  const [contextEcho, setContextEcho] = useState<Record<string, string | undefined>>({});
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [autoExpandFirstSuccess, setAutoExpandFirstSuccess] = useState(true);

  const [savedProviders, setSavedProviders] = useState<Record<string, "saving" | "saved" | string>>({});
  const [mappingProvider, setMappingProvider] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<ProbeResult | null>(null);
  const { items: requestedItems, add: addRequested } = useRequestedIntegrations();
  const requestedSet = useMemo(
    () => new Set(requestedItems.map((r) => r.provider)),
    [requestedItems]
  );

  const abortRef = useRef<AbortController | null>(null);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Make sure we abort the stream if the user navigates away mid-discovery.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleRun = async () => {
    if (!keyInput.trim()) return;
    setRunning(true);
    setError(null);
    setResults([]);
    setKeyHint(null);
    setDetectionHint(null);
    setContextEcho({});
    setCompletedCount(0);
    setTotalCount(0);
    setExpanded({});
    setSavedProviders({});
    setAutoExpandFirstSuccess(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/v1/providers/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: keyInput.trim(),
          github_org: githubOrg.trim() || undefined,
          github_enterprise: githubEnterprise.trim() || undefined,
          n8n_base_url: n8nBaseUrl.trim() || undefined,
          vertex_project_id: vertexProjectId.trim() || undefined,
          vertex_location: vertexLocation.trim() || undefined,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `Discovery failed (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let firstSuccessSeen = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (event.type === "init") {
            setKeyHint(event.keyHint);
            setDetectionHint(event.detection.hint);
            setContextEcho(event.context ?? {});
            setTotalCount(event.endpoints.length);
            setResults(
              event.endpoints.map<ProbeResult>((e) => ({
                ...e,
                status: "pending",
              }))
            );
          } else if (event.type === "result") {
            setResults((prev) =>
              prev.map((p) => (p.id === event.result.id ? { ...p, ...event.result } : p))
            );
            setCompletedCount((c) => c + 1);

            // Auto-expand the first successful result so the user can see
            // exactly what came back without scrolling/clicking.
            if (
              !firstSuccessSeen &&
              autoExpandFirstSuccess &&
              (event.result.status === "ok" || event.result.status === "no_data")
            ) {
              firstSuccessSeen = true;
              setExpanded((prev) => ({ ...prev, [event.result.id]: true }));
            }
          } else if (event.type === "done") {
            // We're done; loop will exit once stream closes.
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setError("Discovery was cancelled.");
      } else {
        setError(e instanceof Error ? e.message : "Discovery failed");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const successResults = useMemo(
    () => results.filter((r) => r.status === "ok" || r.status === "no_data"),
    [results]
  );

  const groupedResults = useMemo(() => {
    const groups = new Map<string, { provider: string; providerLabel: string; results: ProbeResult[] }>();
    for (const r of results) {
      let g = groups.get(r.provider);
      if (!g) {
        g = { provider: r.provider, providerLabel: r.providerLabel, results: [] };
        groups.set(r.provider, g);
      }
      g.results.push(r);
    }
    // Sort results within each group: pending → ok/no_data → other (so users see live progress)
    const order: Record<ProbeStatus, number> = {
      pending: 0,
      ok: 1,
      no_data: 2,
      auth_failed: 3,
      not_found: 4,
      rate_limited: 5,
      skipped: 6,
      error: 7,
    };
    for (const g of groups.values()) {
      g.results.sort((a, b) => {
        const r = order[a.status] - order[b.status];
        if (r !== 0) return r;
        return a.endpointName.localeCompare(b.endpointName);
      });
    }
    return [...groups.values()];
  }, [results]);

  const summary = useMemo(() => {
    const counters = { ok: 0, noData: 0, authFailed: 0, notFound: 0, rateLimited: 0, skipped: 0, errored: 0, pending: 0 };
    for (const r of results) {
      switch (r.status) {
        case "ok": counters.ok++; break;
        case "no_data": counters.noData++; break;
        case "auth_failed": counters.authFailed++; break;
        case "not_found": counters.notFound++; break;
        case "rate_limited": counters.rateLimited++; break;
        case "skipped": counters.skipped++; break;
        case "error": counters.errored++; break;
        case "pending": counters.pending++; break;
      }
    }
    return counters;
  }, [results]);

  const handleExportAll = () => {
    if (!successResults.length) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      keyHint,
      schemas: successResults.map((r) => buildExportPayload(r)),
    };
    downloadJson(payload, `discovery-schemas-${Date.now()}.json`);
  };

  const handleSaveProvider = useCallback(
    async (result: ProbeResult, openMappingAfter: boolean) => {
      if (!result.internalProvider) return;
      setSavedProviders((prev) => ({ ...prev, [result.internalProvider!]: "saving" }));
      try {
        const label = `${result.providerLabel} · ${result.apiName}`;
        await api.addProvider(result.internalProvider, keyInput.trim(), label);
        setSavedProviders((prev) => ({ ...prev, [result.internalProvider!]: "saved" }));
        if (openMappingAfter) {
          setMappingProvider(result.internalProvider);
        }
      } catch (e) {
        setSavedProviders((prev) => ({
          ...prev,
          [result.internalProvider!]: e instanceof Error ? e.message : "Save failed",
        }));
      }
    },
    [keyInput]
  );

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Providers", href: "/dashboard/settings" },
          { label: "Discovery" },
        ]}
      />

      <Header
        title="API Discovery"
        description="Probe every supported provider endpoint with one key. Watch each one resolve live, inspect the exact response, and save successful matches straight to your providers."
      />

      <Card className="p-5">
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">API key (or service-account JSON)</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !running && keyInput.trim()) handleRun();
                }}
                type={showKey ? "text" : "password"}
                placeholder="sk-ant-… | sk-admin-… | AIza… | ghp_… | eyJ… (Entra ID JWT) | n8n token | { service-account JSON }"
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
            {running ? (
              <Button variant="secondary" onClick={handleStop}>
                <StopCircle className="h-3.5 w-3.5" />
                Stop
              </Button>
            ) : (
              <Button onClick={handleRun} disabled={!keyInput.trim()}>
                <Radar className="h-3.5 w-3.5" />
                Discover
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Settings2 className="h-3.5 w-3.5" />
            Endpoint context (GitHub org, n8n base URL, Vertex project)
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <Input label="GitHub org slug" placeholder="my-org" value={githubOrg} onChange={(e) => setGithubOrg(e.target.value)} />
              <Input label="GitHub enterprise slug" placeholder="my-enterprise" value={githubEnterprise} onChange={(e) => setGithubEnterprise(e.target.value)} />
              <Input label="n8n base URL" placeholder="https://n8n.example.com" value={n8nBaseUrl} onChange={(e) => setN8nBaseUrl(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Vertex project id" placeholder="my-gcp-project" value={vertexProjectId} onChange={(e) => setVertexProjectId(e.target.value)} />
                <Input label="Vertex location" placeholder="us-east5" value={vertexLocation} onChange={(e) => setVertexLocation(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
            <ShieldOff className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              <p className="font-medium">Ephemeral by design.</p>
              <p>
                The key is sent to your own server, used to probe every catalog endpoint in
                parallel, and discarded the moment the stream ends.
                {" "}
                When you save a successful provider via the Save &amp; map button, the key is
                encrypted and stored just like any other provider credential.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-destructive/50 bg-red-50">
          <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
        </Card>
      )}

      {(running || results.length > 0) && (
        <SummaryCard
          keyHint={keyHint}
          detectionHint={detectionHint}
          contextEcho={contextEcho}
          summary={summary}
          completed={completedCount}
          total={totalCount}
          running={running}
          onExportAll={handleExportAll}
          successCount={successResults.length}
        />
      )}

      <div className="space-y-5">
        {groupedResults.map((group) => (
          <ProviderGroup
            key={group.provider}
            providerLabel={group.providerLabel}
            results={group.results}
            expanded={expanded}
            onToggle={toggle}
            apiKey={keyInput.trim()}
            savedProviders={savedProviders}
            onSaveProvider={handleSaveProvider}
            requestedSet={requestedSet}
            onRequestIntegration={(r) => setPendingPrompt(r)}
          />
        ))}
      </div>

      {!running && successResults.length > 0 && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-4 w-4 text-emerald-700 mt-0.5" />
            <div className="text-xs text-emerald-900">
              <p className="font-medium">
                Hit a working endpoint? Use the Save &amp; map button on it to store the key
                and apply field mappings without leaving this page.
              </p>
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center gap-1 mt-1 font-medium underline"
              >
                <Plug className="h-3 w-3" /> Open Providers settings
              </Link>
            </div>
          </div>
        </Card>
      )}

      {mappingProvider && (
        <ProviderFieldMappingModal
          open={!!mappingProvider}
          onClose={() => setMappingProvider(null)}
          provider={mappingProvider}
        />
      )}

      {pendingPrompt && (
        <Modal
          open={!!pendingPrompt}
          onClose={() => setPendingPrompt(null)}
          title={`Add ${pendingPrompt.providerLabel}?`}
        >
          <div className="px-6 py-5 space-y-3 text-sm">
            <p>
              <span className="font-semibold">{pendingPrompt.providerLabel}</span> isn&apos;t one
              of the providers Tokenear can sync data from yet, so we can&apos;t store this
              credential as an active provider.
            </p>
            <p className="text-muted-foreground text-xs">
              We can add it to your <span className="font-medium">requested integrations</span>{" "}
              list and surface it on the Providers tab so you&apos;re ready to switch it on the
              moment adapter support lands. Your key is <span className="font-medium">never
              stored</span> as part of this request — only a redacted hint and the endpoint that
              worked.
            </p>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Provider: </span>
                <span className="font-medium">{pendingPrompt.providerLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">API: </span>
                <span className="font-medium">{pendingPrompt.apiName} · {pendingPrompt.endpointName}</span>
              </div>
              {keyHint && (
                <div>
                  <span className="text-muted-foreground">Key hint: </span>
                  <span className="font-mono">{keyHint}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setPendingPrompt(null)}>
                Not now
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  addRequested({
                    provider: pendingPrompt.provider,
                    providerLabel: pendingPrompt.providerLabel,
                    apiName: pendingPrompt.apiName,
                    endpointName: pendingPrompt.endpointName,
                    keyHint: keyHint ?? undefined,
                    requestedAt: new Date().toISOString(),
                  });
                  setPendingPrompt(null);
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Yes, add to my requests
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({
  keyHint,
  detectionHint,
  contextEcho,
  summary,
  completed,
  total,
  running,
  onExportAll,
  successCount,
}: {
  keyHint: string | null;
  detectionHint: string | null;
  contextEcho: Record<string, string | undefined>;
  summary: { ok: number; noData: number; authFailed: number; notFound: number; rateLimited: number; skipped: number; errored: number; pending: number };
  completed: number;
  total: number;
  running: boolean;
  onExportAll: () => void;
  successCount: number;
}) {
  const ctxBits = Object.entries(contextEcho)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Probed key</p>
          <p className="text-sm font-mono font-medium">{keyHint ?? "…"}</p>
          {detectionHint && <p className="text-xs text-muted-foreground mt-1">{detectionHint}</p>}
          {ctxBits && <p className="text-[10px] text-muted-foreground mt-1 font-mono">{ctxBits}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SummaryBadge label="OK" count={summary.ok} variant="success" />
          <SummaryBadge label="Empty" count={summary.noData} variant="info" />
          <SummaryBadge label="Auth failed" count={summary.authFailed} variant="error" />
          <SummaryBadge label="404" count={summary.notFound} variant="warning" />
          <SummaryBadge label="Rate limited" count={summary.rateLimited} variant="warning" />
          <SummaryBadge label="Skipped" count={summary.skipped} variant="outline" />
          <SummaryBadge label="Errored" count={summary.errored} variant="error" />
          {running && <SummaryBadge label="Pending" count={summary.pending} variant="info" />}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {running ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Probing
              </span>
            ) : (
              "Done"
            )}
            {" · "}
            {completed} / {total} endpoints
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

      {successCount > 0 && (
        <div className="flex items-center justify-end pt-3 mt-3 border-t border-border">
          <Button size="sm" variant="secondary" onClick={onExportAll}>
            <Download className="h-3.5 w-3.5" />
            Export all schemas ({successCount})
          </Button>
        </div>
      )}
    </Card>
  );
}

function SummaryBadge({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "success" | "warning" | "error" | "info" | "outline";
}) {
  return (
    <Badge variant={count > 0 ? variant : "outline"}>
      {label}: {count}
    </Badge>
  );
}

function ProviderGroup({
  providerLabel,
  results,
  expanded,
  onToggle,
  apiKey,
  savedProviders,
  onSaveProvider,
  requestedSet,
  onRequestIntegration,
}: {
  providerLabel: string;
  results: ProbeResult[];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  apiKey: string;
  savedProviders: Record<string, "saving" | "saved" | string>;
  onSaveProvider: (r: ProbeResult, openMappingAfter: boolean) => void;
  requestedSet: Set<string>;
  onRequestIntegration: (r: ProbeResult) => void;
}) {
  const finished = results.filter((r) => r.status !== "pending").length;
  const okCount = results.filter((r) => r.status === "ok" || r.status === "no_data").length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-foreground">
          {providerLabel}
          <span className="text-xs text-muted-foreground font-normal ml-2">
            {finished}/{results.length} probed · {okCount} responding
          </span>
        </h3>
      </div>
      <div className="space-y-2">
        {results.map((r) => (
          <ResultCard
            key={r.id}
            result={r}
            expanded={!!expanded[r.id]}
            onToggle={() => onToggle(r.id)}
            apiKey={apiKey}
            saveState={r.internalProvider ? savedProviders[r.internalProvider] : undefined}
            onSaveProvider={onSaveProvider}
            isRequested={requestedSet.has(r.provider)}
            onRequestIntegration={onRequestIntegration}
          />
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  result,
  expanded,
  onToggle,
  saveState,
  onSaveProvider,
  isRequested,
  onRequestIntegration,
}: {
  result: ProbeResult;
  expanded: boolean;
  onToggle: () => void;
  apiKey: string;
  saveState?: "saving" | "saved" | string;
  onSaveProvider: (r: ProbeResult, openMappingAfter: boolean) => void;
  isRequested: boolean;
  onRequestIntegration: (r: ProbeResult) => void;
}) {
  const isPending = result.status === "pending";
  const meta = isPending ? null : STATUS_META[result.status as Exclude<ProbeStatus, "pending">];
  const expandable =
    !!result.body || (result.fields?.length ?? 0) > 0 || !!result.message || !!result.skipReason;

  const handleExportSchema = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadJson(
      { generatedAt: new Date().toISOString(), ...buildExportPayload(result) },
      `${result.id}.schema.json`
    );
  };

  const isSuccess = result.status === "ok" || result.status === "no_data";
  const canSave = isSuccess && !!result.internalProvider;
  const canRequest = isSuccess && !result.internalProvider;
  const isSaved = saveState === "saved";
  const isSaving = saveState === "saving";
  const saveError = saveState && saveState !== "saved" && saveState !== "saving" ? saveState : null;

  return (
    <Card
      className={`overflow-hidden transition-colors ${
        isPending
          ? "border-border bg-muted/20"
          : result.status === "ok"
          ? "border-emerald-200 bg-emerald-50/30"
          : result.status === "no_data"
          ? "border-sky-200 bg-sky-50/30"
          : result.status === "auth_failed" || result.status === "error"
          ? "border-red-200 bg-red-50/20"
          : ""
      }`}
    >
      <button
        type="button"
        onClick={expandable ? onToggle : undefined}
        className={`w-full flex items-center justify-between gap-4 p-4 text-left ${
          expandable ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {expandable ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )
          ) : (
            <div className="w-4 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{result.endpointName}</p>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{result.apiName}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate font-mono">
              {result.method ?? "—"} {result.url ?? ""}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isPending ? (
                <span className="inline-flex items-center gap-1 text-foreground">
                  <Hourglass className="h-3 w-3" />
                  Waiting…
                </span>
              ) : (
                <>
                  {result.elapsedMs} ms
                  {result.httpStatus !== undefined && ` · HTTP ${result.httpStatus}`}
                  {result.rowCount !== undefined && ` · ${result.rowCount} rows`}
                  {result.fields && ` · ${result.fields.length} fields`}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canSave && !isSaved && !isSaving && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onSaveProvider(result, true);
              }}
            >
              <Save className="h-3.5 w-3.5" />
              Save &amp; map
            </Button>
          )}
          {canRequest && !isRequested && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onRequestIntegration(result);
              }}
              title="No built-in integration yet — request one"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Add provider?
            </Button>
          )}
          {canRequest && isRequested && (
            <Badge variant="info">
              <Sparkles className="h-3 w-3 mr-1" /> Requested
            </Badge>
          )}
          {isSaving && (
            <Badge variant="info">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving…
            </Badge>
          )}
          {isSaved && (
            <Badge variant="success">
              <CheckCircle className="h-3 w-3 mr-1" /> Saved
            </Badge>
          )}
          {isSuccess && (
            <Button size="sm" variant="ghost" onClick={handleExportSchema}>
              <FileJson className="h-3.5 w-3.5" />
              Schema
            </Button>
          )}
          {isPending || !meta ? (
            <Badge variant="outline">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Probing…
            </Badge>
          ) : (
            (() => {
              const Icon = meta.Icon;
              return (
                <Badge variant={meta.variant}>
                  <Icon className="h-3 w-3 mr-1" />
                  {meta.label}
                </Badge>
              );
            })()
          )}
        </div>
      </button>

      {expandable && expanded && (
        <div className="border-t border-border bg-muted/20 p-4 space-y-4">
          <p className="text-xs text-muted-foreground">{result.description}</p>
          {result.docsUrl && (
            <a href={result.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
              ↗ Provider docs
            </a>
          )}

          {result.skipReason && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-medium text-amber-900 mb-1">Skipped</p>
              <p className="text-xs text-amber-800">{result.skipReason}</p>
              {result.needs?.length ? (
                <p className="text-[11px] text-amber-700 mt-1">
                  Provide: <span className="font-mono">{result.needs.join(", ")}</span>
                </p>
              ) : null}
            </div>
          )}

          {result.message && result.status !== "ok" && result.status !== "no_data" && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-medium text-destructive mb-1">Error response</p>
              <pre className="text-[11px] text-red-900 font-mono whitespace-pre-wrap break-all">
                {result.message}
              </pre>
            </div>
          )}

          {saveError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-medium text-destructive mb-1">Couldn&apos;t save provider</p>
              <p className="text-xs text-red-900">{saveError}</p>
            </div>
          )}

          {canSave && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={isSaved ? "ghost" : "primary"}
                onClick={() => onSaveProvider(result, true)}
                disabled={isSaving}
              >
                <KeyRound className="h-3.5 w-3.5" />
                {isSaved ? "Saved · Re-map fields" : isSaving ? "Saving…" : `Save as “${result.internalProvider}” + map`}
              </Button>
              {!isSaved && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onSaveProvider(result, false)}
                  disabled={isSaving}
                >
                  Save without opening mapping
                </Button>
              )}
            </div>
          )}

          {canRequest && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 space-y-2">
              <p className="text-xs font-medium text-sky-900">
                {result.providerLabel} isn&apos;t in your provider list yet.
              </p>
              <p className="text-[11px] text-sky-800">
                Tokenear doesn&apos;t ship a built-in sync adapter for {result.providerLabel} —
                so we can&apos;t store this credential as a real provider yet. We can record
                that you want it though, and surface it on the Providers tab so it&apos;s ready
                when adapter support lands.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {isRequested ? (
                  <Badge variant="info">
                    <Sparkles className="h-3 w-3 mr-1" /> Already on your request list
                  </Badge>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => onRequestIntegration(result)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Yes, add {result.providerLabel}
                  </Button>
                )}
              </div>
            </div>
          )}

          {result.fields && result.fields.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">
                Discovered fields ({result.fields.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.fields.map((f) => (
                  <span key={f} className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-mono text-foreground">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.body !== undefined && result.body !== null && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Sample response</p>
              <div className="rounded-md border border-border bg-card max-h-96 overflow-auto">
                <pre className="text-[11px] font-mono p-3 whitespace-pre-wrap break-all">
                  {typeof result.body === "string"
                    ? result.body
                    : JSON.stringify(result.body, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function buildExportPayload(r: ProbeResult) {
  const schema = buildSchemaTemplate(r.body);
  const fields = r.fields ?? [];
  const fieldDetails = fields.map((path) => ({
    path,
    placeholder: lookupSchemaValue(schema, path),
  }));
  return {
    provider: r.provider,
    providerLabel: r.providerLabel,
    apiName: r.apiName,
    endpointName: r.endpointName,
    description: r.description,
    docsUrl: r.docsUrl,
    authHint: r.authHint,
    request: { method: r.method, url: r.url },
    response: {
      httpStatus: r.httpStatus,
      rowCount: r.rowCount,
      fieldCount: fields.length,
    },
    fields,
    fieldDetails,
    schema,
  };
}

function lookupSchemaValue(schema: unknown, path: string): unknown {
  const parts = path.split(".").flatMap((p) =>
    p.endsWith("[]") ? [p.slice(0, -2), "[]"] : [p]
  );
  let cur: unknown = schema;
  for (const part of parts) {
    if (cur === null || cur === undefined) return "{insertnamehere}";
    if (part === "[]") {
      if (Array.isArray(cur)) cur = cur[0];
      else return "{insertnamehere}";
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return "{insertnamehere}";
    }
  }
  return cur === undefined ? "{insertnamehere}" : cur;
}

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
