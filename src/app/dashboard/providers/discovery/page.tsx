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
  useDiscoveryHistory,
  formatKeyHint,
  describeSessionSuccess,
  type DiscoverySession,
} from "@/lib/discovery-history";
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
  History as HistoryIcon,
  Trash2,
  Filter,
  X,
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

  // Providers that already have a saved credential in the database. We fetch
  // this on mount so the UI can offer "Just map" instead of "Save & map" when
  // the user restored a session from history (raw key is never stored, so a
  // re-save would fail with a validation error).
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    api
      .getProviders()
      .then((data: { providers?: Array<{ provider: string; isActive: boolean }> }) => {
        if (cancelled) return;
        const active = (data.providers ?? []).filter((p) => p.isActive).map((p) => p.provider);
        setConfiguredProviders(new Set(active));
      })
      .catch(() => {
        // Non-fatal — user can still discover; Save & map will just behave
        // as if the provider isn't already configured.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [pendingPrompt, setPendingPrompt] = useState<ProbeResult | null>(null);
  const { items: requestedItems, add: addRequested } = useRequestedIntegrations();
  const requestedSet = useMemo(
    () => new Set(requestedItems.map((r) => r.provider)),
    [requestedItems]
  );

  // Recent-searches history. Auto-restored on mount; updated when a stream
  // completes; manipulated via the right-hand sidebar.
  const { sessions, save: saveSession, remove: removeSession, clearAll: clearHistory } =
    useDiscoveryHistory();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Status filter — clicking a summary badge narrows the result list to that
  // status. "all" means no filter.
  type StatusFilter = ProbeStatus | "all";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const abortRef = useRef<AbortController | null>(null);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Make sure we abort the stream if the user navigates away mid-discovery.
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Load a previously-stored session into the page so the user can review or
   * re-export results without re-running discovery. Mappings/credentials in
   * the database are NOT touched — this is purely UI state restoration.
   */
  const restoreSession = useCallback((session: DiscoverySession) => {
    setRunning(false);
    setError(null);
    setKeyHint(session.keyHint);
    setDetectionHint(session.detectionHint);
    setContextEcho({ ...(session.context ?? {}) } as Record<string, string | undefined>);
    setResults(session.results as ProbeResult[]);
    setTotalCount(session.totalCount);
    setCompletedCount(session.completedCount);
    setActiveSessionId(session.id);
    setExpanded({});
    setStatusFilter("all");
    setAutoExpandFirstSuccess(false);
    setSavedProviders({});
  }, []);

  // On first paint, auto-restore the most recent saved session — that's what
  // makes "leave and come back" work without forcing the user to re-enter
  // their key. We only do this once, and only if results haven't already
  // been populated (e.g. by a fresh run).
  const hasAutoRestoredRef = useRef(false);
  useEffect(() => {
    if (hasAutoRestoredRef.current) return;
    if (running || results.length > 0) {
      hasAutoRestoredRef.current = true;
      return;
    }
    if (sessions.length > 0) {
      hasAutoRestoredRef.current = true;
      restoreSession(sessions[0]);
    }
  }, [sessions, running, results.length, restoreSession]);

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
    setStatusFilter("all");

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    setActiveSessionId(sessionId);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Capturing detection hint outside of the try block so the finally clause
    // (where we persist the session) can read it after the stream finishes.
    let detectionHintForSave = "";

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
            detectionHintForSave = event.detection.hint;
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
      // Snapshot the just-finished session into history. We use the functional
      // setResults below to capture the latest results array atomically (state
      // updates above were async); persist the session and re-emit the same
      // results unchanged so the UI doesn't flicker.
      setResults((finalResults) => {
        if (finalResults.length === 0) return finalResults;
        const session: DiscoverySession = {
          id: sessionId,
          keyHint: formatKeyHint(keyInput.trim()),
          detectionHint: detectionHintForSave,
          context: {
            githubOrg: githubOrg.trim() || undefined,
            githubEnterprise: githubEnterprise.trim() || undefined,
            n8nBaseUrl: n8nBaseUrl.trim() || undefined,
            vertexProjectId: vertexProjectId.trim() || undefined,
            vertexLocation: vertexLocation.trim() || undefined,
          },
          summary: {
            attempted: finalResults.length,
            ok: finalResults.filter((r) => r.status === "ok").length,
            noData: finalResults.filter((r) => r.status === "no_data").length,
            authFailed: finalResults.filter((r) => r.status === "auth_failed").length,
            notFound: finalResults.filter((r) => r.status === "not_found").length,
            rateLimited: finalResults.filter((r) => r.status === "rate_limited").length,
            skipped: finalResults.filter((r) => r.status === "skipped").length,
            errored: finalResults.filter((r) => r.status === "error").length,
          },
          results: finalResults.map((r) => ({ ...r })) as DiscoverySession["results"],
          totalCount: finalResults.length,
          completedCount: finalResults.filter((r) => r.status !== "pending").length,
          startedAt,
          completedAt: new Date().toISOString(),
        };
        // Defer the save out of the setState callback so we never run into
        // "setState during render" warnings.
        setTimeout(() => saveSession(session), 0);
        return finalResults;
      });
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const successResults = useMemo(
    () => results.filter((r) => r.status === "ok" || r.status === "no_data"),
    [results]
  );

  // Apply the status filter (clicking a summary badge narrows to that status).
  const filteredResults = useMemo(() => {
    if (statusFilter === "all") return results;
    return results.filter((r) => r.status === statusFilter);
  }, [results, statusFilter]);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, { provider: string; providerLabel: string; results: ProbeResult[] }>();
    for (const r of filteredResults) {
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
  }, [filteredResults]);

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

  /**
   * Handle the row's primary CTA. Behavior depends on what we have:
   *
   *   1. No internalProvider → no-op (button shouldn't be visible).
   *
   *   2. Key field is empty (likely because the user restored a session from
   *      history — we never store raw keys) → skip the save, just open the
   *      mapping modal. If the provider isn't yet configured we surface a
   *      short-lived "Key not stored — paste it again to save" hint.
   *
   *   3. Key present → upsert the credential as before. If the upsert fails
   *      (e.g. validation, network) AND the provider was already configured,
   *      we still open the mapping modal so the user isn't blocked.
   */
  const handleSaveProvider = useCallback(
    async (result: ProbeResult, openMappingAfter: boolean) => {
      const internalProvider = result.internalProvider;
      if (!internalProvider) return;

      const hasKey = keyInput.trim().length > 0;
      const alreadyConfigured = configuredProviders.has(internalProvider);

      // Case 2 — no key in the input box.
      if (!hasKey) {
        if (openMappingAfter) {
          setMappingProvider(internalProvider);
        }
        if (!alreadyConfigured) {
          setSavedProviders((prev) => ({
            ...prev,
            [internalProvider]: "Key field is empty — paste your API key above to save the credential.",
          }));
        }
        return;
      }

      // Case 3 — try to upsert.
      setSavedProviders((prev) => ({ ...prev, [internalProvider]: "saving" }));
      try {
        const label = `${result.providerLabel} · ${result.apiName}`;
        await api.addProvider(internalProvider, keyInput.trim(), label);
        setSavedProviders((prev) => ({ ...prev, [internalProvider]: "saved" }));
        setConfiguredProviders((prev) => {
          const next = new Set(prev);
          next.add(internalProvider);
          return next;
        });
        if (openMappingAfter) {
          setMappingProvider(internalProvider);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Save failed";
        setSavedProviders((prev) => ({ ...prev, [internalProvider]: message }));
        // Even on save failure, if the provider was already configured the
        // user almost certainly just wants to map fields — open the modal
        // so they're not stuck.
        if (openMappingAfter && alreadyConfigured) {
          setMappingProvider(internalProvider);
        }
      }
    },
    [keyInput, configuredProviders]
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Main column: summary + filter banner + results */}
        <div className="space-y-5 min-w-0">
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
              successResults={successResults}
              statusFilter={statusFilter}
              onSetStatusFilter={setStatusFilter}
            />
          )}

          {statusFilter !== "all" && (
            <Card className="px-4 py-3 flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2 text-xs">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  Filtering by{" "}
                  <span className="font-semibold">{STATUS_META[statusFilter as Exclude<ProbeStatus, "pending">]?.label ?? statusFilter}</span>
                  {" "}— showing {filteredResults.length} of {results.length} endpoints.
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStatusFilter("all")}>
                <X className="h-3.5 w-3.5" /> Clear filter
              </Button>
            </Card>
          )}

          {results.length > 0 && filteredResults.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No endpoints match the current filter.
            </Card>
          )}

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
              configuredSet={configuredProviders}
            />
          ))}
        </div>

        {/* Right rail: recent searches history */}
        <aside className="lg:sticky lg:top-4">
          <HistorySidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onPick={restoreSession}
            onDelete={removeSession}
            onClearAll={clearHistory}
          />
        </aside>
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
          discoveredEndpoints={successResults
            .filter((r) => r.internalProvider === mappingProvider && r.fields && r.fields.length > 0)
            .map((r) => ({
              id: r.id,
              apiName: r.apiName,
              endpointName: r.endpointName,
              fields: r.fields ?? [],
              body: r.body,
            }))}
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
  successResults,
  statusFilter,
  onSetStatusFilter,
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
  successResults: ProbeResult[];
  statusFilter: ProbeStatus | "all";
  onSetStatusFilter: (next: ProbeStatus | "all") => void;
}) {
  const toggleFilter = (status: ProbeStatus) => {
    onSetStatusFilter(statusFilter === status ? "all" : status);
  };
  // Group successful results by provider so the summary can show
  // "Anthropic — Admin API · Cost Report, Admin API · Workspaces, …".
  const successByProvider = useMemo(() => {
    const groups = new Map<string, { providerLabel: string; entries: ProbeResult[] }>();
    for (const r of successResults) {
      let g = groups.get(r.provider);
      if (!g) {
        g = { providerLabel: r.providerLabel, entries: [] };
        groups.set(r.provider, g);
      }
      g.entries.push(r);
    }
    return [...groups.values()];
  }, [successResults]);
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
          <SummaryBadge label="OK" count={summary.ok} variant="success" active={statusFilter === "ok"} onClick={() => toggleFilter("ok")} />
          <SummaryBadge label="Empty" count={summary.noData} variant="info" active={statusFilter === "no_data"} onClick={() => toggleFilter("no_data")} />
          <SummaryBadge label="Auth failed" count={summary.authFailed} variant="error" active={statusFilter === "auth_failed"} onClick={() => toggleFilter("auth_failed")} />
          <SummaryBadge label="404" count={summary.notFound} variant="warning" active={statusFilter === "not_found"} onClick={() => toggleFilter("not_found")} />
          <SummaryBadge label="Rate limited" count={summary.rateLimited} variant="warning" active={statusFilter === "rate_limited"} onClick={() => toggleFilter("rate_limited")} />
          <SummaryBadge label="Skipped" count={summary.skipped} variant="outline" active={statusFilter === "skipped"} onClick={() => toggleFilter("skipped")} />
          <SummaryBadge label="Errored" count={summary.errored} variant="error" active={statusFilter === "error"} onClick={() => toggleFilter("error")} />
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

      {successByProvider.length > 0 && (
        <div className="pt-3 mt-3 border-t border-border space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Successful endpoints
          </p>
          <div className="space-y-2">
            {successByProvider.map((group) => (
              <div key={group.providerLabel} className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-900 mb-1.5">
                  {group.providerLabel}
                  <span className="text-emerald-700 font-normal ml-1.5">
                    ({group.entries.length} endpoint{group.entries.length === 1 ? "" : "s"})
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.entries.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-card px-2 py-0.5 text-[11px]"
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
            ))}
          </div>
        </div>
      )}

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
  active,
  onClick,
}: {
  label: string;
  count: number;
  variant: "success" | "warning" | "error" | "info" | "outline";
  active?: boolean;
  onClick?: () => void;
}) {
  const effectiveVariant = count > 0 ? variant : "outline";
  if (!onClick) {
    return <Badge variant={effectiveVariant}>{label}: {count}</Badge>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className={`focus:outline-none focus:ring-2 focus:ring-ring rounded-full transition-all ${
        count === 0 ? "cursor-not-allowed opacity-60" : "hover:scale-[1.03]"
      } ${active ? "ring-2 ring-foreground/40 ring-offset-1" : ""}`}
      title={count > 0 ? `Filter to ${label}` : `No ${label.toLowerCase()} results`}
      aria-pressed={!!active}
    >
      <Badge variant={effectiveVariant}>{label}: {count}</Badge>
    </button>
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
  configuredSet,
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
  configuredSet: Set<string>;
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
            isAlreadyConfigured={r.internalProvider ? configuredSet.has(r.internalProvider) : false}
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
  apiKey,
  saveState,
  onSaveProvider,
  isRequested,
  onRequestIntegration,
  isAlreadyConfigured,
}: {
  result: ProbeResult;
  expanded: boolean;
  onToggle: () => void;
  apiKey: string;
  saveState?: "saving" | "saved" | string;
  onSaveProvider: (r: ProbeResult, openMappingAfter: boolean) => void;
  isRequested: boolean;
  onRequestIntegration: (r: ProbeResult) => void;
  isAlreadyConfigured: boolean;
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

  // What the row's primary CTA should look like depends on (a) whether the
  // user has a key in the input box right now and (b) whether the matching
  // internalProvider is already configured server-side.
  const hasKeyInInput = apiKey.trim().length > 0;
  const ctaCompact = isAlreadyConfigured
    ? hasKeyInInput
      ? { label: "Update key & map", short: "Update & map" }
      : { label: "Map fields", short: "Map" }
    : hasKeyInInput
    ? { label: "Save & map", short: "Save & map" }
    : { label: "Map fields", short: "Map" };

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
              title={ctaCompact.label}
            >
              <Save className="h-3.5 w-3.5" />
              {ctaCompact.short}
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
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={isSaved ? "ghost" : "primary"}
                  onClick={() => onSaveProvider(result, true)}
                  disabled={isSaving}
                  title={ctaCompact.label}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {isSaved
                    ? "Saved · Re-map fields"
                    : isSaving
                    ? "Saving…"
                    : isAlreadyConfigured
                    ? hasKeyInInput
                      ? `Update “${result.internalProvider}” + map`
                      : `Map “${result.internalProvider}” fields`
                    : hasKeyInInput
                    ? `Save as “${result.internalProvider}” + map`
                    : `Map “${result.internalProvider}” fields`}
                </Button>
                {hasKeyInInput && !isSaved && (
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
              {!hasKeyInInput && (
                <p className="text-[11px] text-muted-foreground">
                  {isAlreadyConfigured
                    ? "Using your previously-saved credential — the mapping modal will open without re-saving."
                    : "Paste your API key in the box above to save the credential. The mapping modal can still be opened with the live discovered fields."}
                </p>
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

function HistorySidebar({
  sessions,
  activeSessionId,
  onPick,
  onDelete,
  onClearAll,
}: {
  sessions: DiscoverySession[];
  activeSessionId: string | null;
  onPick: (s: DiscoverySession) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent searches</h3>
        </div>
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
            title="Clear all (saved provider mappings stay intact)"
          >
            Clear all
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Past discovery runs will appear here. They&apos;re stored locally in your browser
          (key hint only — never the raw key) and survive across reloads.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            const subtitle = describeSessionSuccess(s);
            const successCount = s.summary.ok + s.summary.noData;
            return (
              <div
                key={s.id}
                className={`group rounded-lg border transition-all ${
                  isActive
                    ? "border-brand bg-brand/5 ring-1 ring-brand/40"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="w-full text-left px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-medium truncate">{s.keyHint || "(empty)"}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={subtitle}>
                        {subtitle}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {successCount > 0 && (
                          <span className="text-emerald-700 font-medium">
                            {successCount} responding
                          </span>
                        )}
                        {successCount > 0 && " · "}
                        {new Date(s.completedAt ?? s.startedAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(s.id);
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 -m-1 opacity-0 group-hover:opacity-100"
                      title="Delete from history (saved provider mappings stay intact)"
                      aria-label="Delete from history"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Deleting a search only removes it from this list. Provider credentials
        and field mappings you saved on the Providers tab stay intact until you
        explicitly remove them or save a different mapping.
      </p>
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
