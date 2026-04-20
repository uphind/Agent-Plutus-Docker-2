import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DISCOVERY_CATALOG,
  DiscoveryContext,
  DiscoveryEndpoint,
  detectKeyShape,
  extractFields,
  redactKey,
} from "@/lib/providers/discovery-catalog";

// Per-endpoint timeout — each probe is hit concurrently and bounded.
const PER_PROBE_TIMEOUT_MS = 20_000;
// Cap each response body before we ship it back to the client. Real responses
// can be very large (e.g. 90 days of usage); we only need a sample.
const MAX_RAW_BYTES = 200_000;

type ProbeStatus =
  | "ok"
  | "no_data"
  | "auth_failed"
  | "not_found"
  | "rate_limited"
  | "skipped"
  | "error";

interface ProbeResult {
  id: string;
  provider: string;
  providerLabel: string;
  apiName: string;
  endpointName: string;
  description: string;
  docsUrl?: string;
  authHint: string;
  internalProvider?: string;
  status: ProbeStatus;
  httpStatus?: number;
  elapsedMs: number;
  url?: string;
  method?: string;
  body?: unknown;
  fields?: string[];
  rowCount?: number;
  message?: string;
  skipReason?: string;
  needs?: string[];
}

const bodySchema = z.object({
  api_key: z.string().min(1, "api_key is required"),
  github_org: z.string().optional().nullable(),
  github_enterprise: z.string().optional().nullable(),
  n8n_base_url: z.string().optional().nullable(),
  vertex_project_id: z.string().optional().nullable(),
  vertex_location: z.string().optional().nullable(),
  /**
   * Optional filter — only probe endpoints whose top-level discovery
   * provider id matches one of these values (e.g. ["anthropic", "openai"]).
   */
  providers: z.array(z.string()).optional(),
  /**
   * Optional filter — only probe endpoints whose internalProvider matches
   * one of these values (e.g. ["anthropic_compliance"]). Combined with
   * `providers` via OR — an endpoint passes if EITHER filter matches.
   */
  internal_providers: z.array(z.string()).optional(),
});

function classifyHttpStatus(status: number): ProbeStatus {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "error";
}

function rowCountOf(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  if (Array.isArray(body)) return body.length;
  const obj = body as Record<string, unknown>;
  for (const k of ["data", "results", "items", "models", "users", "providers", "buckets", "members"]) {
    const v = obj[k];
    if (Array.isArray(v)) return v.length;
  }
  return undefined;
}

function truncateBody(text: string): string {
  if (text.length <= MAX_RAW_BYTES) return text;
  return text.slice(0, MAX_RAW_BYTES) + `\n…[truncated ${text.length - MAX_RAW_BYTES} bytes]`;
}

async function executeRequest(
  endpoint: DiscoveryEndpoint,
  ctx: DiscoveryContext
): Promise<ProbeResult> {
  const started = Date.now();
  const built = endpoint.build(ctx);

  const base = {
    id: endpoint.id,
    provider: endpoint.provider,
    providerLabel: endpoint.providerLabel,
    apiName: endpoint.apiName,
    endpointName: endpoint.endpointName,
    description: endpoint.description,
    docsUrl: endpoint.docsUrl,
    authHint: endpoint.authHint,
    internalProvider: endpoint.internalProvider,
  };

  if ("skip" in built) {
    return {
      ...base,
      status: "skipped",
      elapsedMs: Date.now() - started,
      skipReason: built.skip,
      needs: built.needs as string[] | undefined,
    };
  }

  if (built.url.startsWith("vertex://")) {
    return {
      ...base,
      status: "skipped",
      elapsedMs: Date.now() - started,
      url: built.url,
      method: built.method,
      skipReason:
        "Vertex requires a signed-JWT → OAuth token exchange that this probe doesn't perform. Use the Vertex provider in Settings → Providers to test it end-to-end.",
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(built.url, {
      method: built.method,
      headers: built.headers,
      body: built.body !== undefined ? JSON.stringify(built.body) : undefined,
      signal: ctrl.signal,
    });
    const elapsedMs = Date.now() - started;
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Leave as text for non-JSON responses.
    }
    const truncated = typeof parsed === "string" ? truncateBody(parsed) : parsed;
    let status: ProbeStatus = classifyHttpStatus(res.status);
    const fields = parsed && typeof parsed === "object" ? extractFields(parsed) : undefined;
    const rows = rowCountOf(parsed);
    if (status === "ok" && rows === 0) status = "no_data";
    return {
      ...base,
      status,
      httpStatus: res.status,
      elapsedMs,
      url: built.url,
      method: built.method,
      body: truncated,
      fields,
      rowCount: rows,
      message: res.ok
        ? undefined
        : typeof parsed === "object" && parsed !== null
        ? (parsed as { error?: { message?: string }; message?: string }).error?.message ??
          (parsed as { message?: string }).message ??
          `HTTP ${res.status}`
        : `HTTP ${res.status}: ${typeof parsed === "string" ? parsed.slice(0, 200) : ""}`,
    };
  } catch (err) {
    const elapsedMs = Date.now() - started;
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timed out after ${PER_PROBE_TIMEOUT_MS}ms`
          : err.message
        : String(err);
    return {
      ...base,
      status: "error",
      elapsedMs,
      url: built.url,
      method: built.method,
      message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streaming POST handler. Emits NDJSON events:
 *
 *   {"type":"init","keyHint":"sk-ant-…","detection":{...},"endpoints":[...]}
 *   {"type":"result","result":{...}}        <-- one per endpoint, as it finishes
 *   {"type":"done","summary":{...}}
 *
 * Probes still run in parallel server-side; the only change vs. a buffered
 * JSON response is that each result is flushed to the client the moment it
 * resolves, so the UI can render live progress.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const apiKey = parsed.data.api_key.trim();
  const ctx: DiscoveryContext = {
    apiKey,
    githubOrg: parsed.data.github_org?.trim() || undefined,
    githubEnterprise: parsed.data.github_enterprise?.trim() || undefined,
    n8nBaseUrl: parsed.data.n8n_base_url?.trim() || undefined,
    vertexProjectId: parsed.data.vertex_project_id?.trim() || undefined,
    vertexLocation: parsed.data.vertex_location?.trim() || undefined,
  };

  const detection = detectKeyShape(apiKey);
  const keyHint = redactKey(apiKey);

  // Apply optional provider filters — empty / missing means "probe everything"
  // exactly as before (preserves the unfiltered behavior the standalone
  // Discovery page relies on).
  const providerFilter = parsed.data.providers && parsed.data.providers.length > 0
    ? new Set(parsed.data.providers)
    : null;
  const internalFilter = parsed.data.internal_providers && parsed.data.internal_providers.length > 0
    ? new Set(parsed.data.internal_providers)
    : null;
  const filteredCatalog = providerFilter || internalFilter
    ? DISCOVERY_CATALOG.filter(
        (e) =>
          (providerFilter ? providerFilter.has(e.provider) : false) ||
          (internalFilter && e.internalProvider ? internalFilter.has(e.internalProvider) : false)
      )
    : DISCOVERY_CATALOG;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      // 1. Tell the client about the entire catalog up-front so it can render
      //    every endpoint as "pending" before any probe finishes.
      enqueue({
        type: "init",
        keyHint,
        detection,
        context: {
          githubOrg: ctx.githubOrg,
          githubEnterprise: ctx.githubEnterprise,
          n8nBaseUrl: ctx.n8nBaseUrl,
          vertexProjectId: ctx.vertexProjectId,
          vertexLocation: ctx.vertexLocation,
        },
        endpoints: filteredCatalog.map((e) => ({
          id: e.id,
          provider: e.provider,
          providerLabel: e.providerLabel,
          apiName: e.apiName,
          endpointName: e.endpointName,
          description: e.description,
          docsUrl: e.docsUrl,
          authHint: e.authHint,
          internalProvider: e.internalProvider,
        })),
      });

      // 2. Fire all probes in parallel; emit each result as soon as it lands.
      const counters = {
        ok: 0,
        noData: 0,
        authFailed: 0,
        notFound: 0,
        rateLimited: 0,
        skipped: 0,
        errored: 0,
      };
      await Promise.all(
        filteredCatalog.map(async (endpoint) => {
          const result = await executeRequest(endpoint, ctx);
          switch (result.status) {
            case "ok": counters.ok++; break;
            case "no_data": counters.noData++; break;
            case "auth_failed": counters.authFailed++; break;
            case "not_found": counters.notFound++; break;
            case "rate_limited": counters.rateLimited++; break;
            case "skipped": counters.skipped++; break;
            case "error": counters.errored++; break;
          }
          enqueue({ type: "result", result });
        })
      );

      // 3. Final summary so the UI can stop the spinner / show totals.
      enqueue({
        type: "done",
        summary: { attempted: filteredCatalog.length, ...counters },
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Prevents some proxies (e.g. Cloudflare, nginx) from buffering the response.
      "X-Accel-Buffering": "no",
    },
  });
}
