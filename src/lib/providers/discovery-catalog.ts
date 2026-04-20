/**
 * Discovery endpoint catalog.
 *
 * A central, declarative registry of every public API endpoint we know how to
 * probe across our supported providers. The Discovery feature hits every
 * endpoint with the supplied key (and optional supplemental context like a
 * GitHub org or n8n base URL) so we can:
 *
 *   1. Identify which provider the key belongs to (it might match more than one).
 *   2. Discover the full set of fields each endpoint returns.
 *   3. See sample data shape per endpoint, even when the key only has access to
 *      a subset of endpoints.
 *
 * Endpoints are intentionally probed in parallel and we DO NOT short-circuit
 * after the first success. Every endpoint reports its own status independently.
 */

export type DiscoveryProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "vertex"
  | "cursor"
  | "lovable"
  | "copilot"
  | "microsoft_copilot"
  | "n8n";

export interface DiscoveryContext {
  apiKey: string;
  /** Extra context the user can supply for endpoints that need it. */
  githubOrg?: string;
  githubEnterprise?: string;
  n8nBaseUrl?: string;
  vertexProjectId?: string;
  vertexLocation?: string;
}

export interface DiscoveryRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface DiscoverySkip {
  /** Human-readable reason why this endpoint cannot be probed right now. */
  skip: string;
  /** Optional list of context fields that, if supplied, would unblock it. */
  needs?: Array<keyof DiscoveryContext>;
}

/** The set of internal Provider enum values we can save credentials against. */
export type InternalProviderId =
  | "anthropic"
  | "anthropic_compliance"
  | "anthropic_analytics"
  | "openai"
  | "gemini"
  | "cursor"
  | "vertex";

export interface DiscoveryEndpoint {
  id: string;
  provider: DiscoveryProviderId;
  providerLabel: string;
  apiName: string;
  endpointName: string;
  description: string;
  docsUrl?: string;
  /** Hint about which key shape this endpoint expects. */
  authHint: string;
  /**
   * If a successful probe of this endpoint means the same key can be saved as
   * one of our supported internal providers, this names which one. Used by
   * the Discovery UI to surface a "Save & map" shortcut.
   */
  internalProvider?: InternalProviderId;
  build: (ctx: DiscoveryContext) => DiscoveryRequest | DiscoverySkip;
}

const ANTHROPIC_VERSION = "2023-06-01";

function isoNow(): string {
  return new Date().toISOString();
}
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}
function unixDaysAgo(days: number): number {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}
function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}
function dateOnlyDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().split("T")[0];
}

function bearer(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` };
}

function anthropicHeaders(key: string, betas?: string[]): Record<string, string> {
  const h: Record<string, string> = {
    "x-api-key": key,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (betas?.length) h["anthropic-beta"] = betas.join(",");
  return h;
}

function looksLikeAnthropic(k: string): boolean {
  return k.startsWith("sk-ant-");
}
function looksLikeOpenAI(k: string): boolean {
  return k.startsWith("sk-");
}
function looksLikeGemini(k: string): boolean {
  return k.startsWith("AIza");
}
function looksLikeJson(k: string): boolean {
  const t = k.trim();
  return t.startsWith("{") && t.endsWith("}");
}
function looksLikeGithub(k: string): boolean {
  return /^(ghp_|gho_|ghu_|ghs_|github_pat_)/.test(k);
}
function looksLikeAzureAdJwt(k: string): boolean {
  // Azure AD / Entra ID access tokens are JWTs: three base64url segments
  // separated by dots, the first segment always decodes to {"alg":...}.
  return /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTHROPIC
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "anthropic.admin.usage_messages",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Usage & Cost",
    endpointName: "Messages Usage Report",
    description: "Token usage broken down by model, workspace, and API key.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/usage-cost/messages-usage-report",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.anthropic.com/v1/organizations/usage_report/messages` +
        `?starting_at=${encodeURIComponent(isoDaysAgo(2))}` +
        `&ending_at=${encodeURIComponent(isoNow())}` +
        `&bucket_width=1d&limit=1`,
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.admin.cost_report",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Usage & Cost",
    endpointName: "Cost Report",
    description: "Per-bucket cost in USD broken down by model, token type, etc.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/usage-cost/cost-report",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.anthropic.com/v1/organizations/cost_report` +
        `?starting_at=${encodeURIComponent(isoDaysAgo(2))}` +
        `&ending_at=${encodeURIComponent(isoNow())}` +
        `&bucket_width=1d&limit=1`,
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.admin.claude_code_analytics",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Claude Code",
    endpointName: "Claude Code Analytics",
    description: "Per-actor Claude Code activity (sessions, lines, tools).",
    docsUrl: "https://docs.claude.com/en/api/admin-api/claude-code/get-claude-code-analytics",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.anthropic.com/v1/organizations/usage_report/claude_code` +
        `?starting_at=${encodeURIComponent(isoDaysAgo(2))}` +
        `&ending_at=${encodeURIComponent(isoNow())}` +
        `&bucket_width=1d&limit=1`,
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.admin.workspaces",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Organization",
    endpointName: "List Workspaces",
    description: "All workspaces the org owns.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/workspaces/list-workspaces",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.anthropic.com/v1/organizations/workspaces?limit=5",
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.admin.api_keys",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Organization",
    endpointName: "List API Keys",
    description: "All API keys belonging to the org.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/api-keys/list-api-keys",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.anthropic.com/v1/organizations/api_keys?limit=5",
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.admin.users",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Organization",
    endpointName: "List Users",
    description: "All members of the org.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/users/list-users",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.anthropic.com/v1/organizations/users?limit=5",
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.admin.invites",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Organization",
    endpointName: "List Invites",
    description: "Outstanding org invites.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/invites/list-invites",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.anthropic.com/v1/organizations/invites?limit=5",
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.compliance.audit_logs",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic_compliance",
    apiName: "Compliance API",
    endpointName: "Audit-based User Activity",
    description: "User activity derived from compliance audit log scope.",
    docsUrl: "https://support.claude.com/en/articles/13703965",
    authHint: "sk-ant-compliance-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.anthropic.com/v1/organizations/audit_logs` +
        `?starting_at=${encodeURIComponent(isoDaysAgo(2))}` +
        `&ending_at=${encodeURIComponent(isoNow())}&limit=5`,
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.analytics.claude_code_engagement",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic_analytics",
    apiName: "Enterprise Analytics API",
    endpointName: "Per-User Engagement",
    description: "Per-user engagement metrics via the read:analytics scope.",
    docsUrl: "https://support.claude.com/en/articles/13703965",
    authHint: "sk-ant-analytics-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.anthropic.com/v1/organizations/analytics/claude_code` +
        `?starting_at=${encodeURIComponent(isoDaysAgo(2))}` +
        `&ending_at=${encodeURIComponent(isoNow())}` +
        `&bucket_width=1d&limit=5`,
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.messages.models",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Messages API",
    endpointName: "List Models",
    description: "All Claude models the API key can call.",
    docsUrl: "https://docs.claude.com/en/api/models-list",
    authHint: "sk-ant-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.anthropic.com/v1/models?limit=5",
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.files.list",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Files API (beta)",
    endpointName: "List Files",
    description: "Files uploaded for use with the Messages API.",
    docsUrl: "https://docs.claude.com/en/api/files-list",
    authHint: "sk-ant-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.anthropic.com/v1/files?limit=5",
      headers: anthropicHeaders(apiKey, ["files-api-2025-04-14"]),
    }),
  },
  {
    id: "anthropic.batches.list",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Message Batches API",
    endpointName: "List Message Batches",
    description: "Async message batch jobs.",
    docsUrl: "https://docs.claude.com/en/api/messages-batch-list",
    authHint: "sk-ant-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.anthropic.com/v1/messages/batches?limit=5",
      headers: anthropicHeaders(apiKey),
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OPENAI
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_USAGE_KINDS = [
  "completions",
  "embeddings",
  "moderations",
  "images",
  "audio_speeches",
  "audio_transcriptions",
  "vector_stores",
  "code_interpreter_sessions",
];

const OPENAI_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "openai.api.models",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Models",
    endpointName: "List Models",
    description: "Models the key can access.",
    docsUrl: "https://platform.openai.com/docs/api-reference/models/list",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/models",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.org.users",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Admin API · Organization",
    endpointName: "List Users",
    description: "Members of the OpenAI organization.",
    docsUrl: "https://platform.openai.com/docs/api-reference/users/list",
    authHint: "sk-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/organization/users?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.org.projects",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Admin API · Organization",
    endpointName: "List Projects",
    description: "All projects in the org.",
    docsUrl: "https://platform.openai.com/docs/api-reference/projects/list",
    authHint: "sk-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/organization/projects?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.org.audit_logs",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Admin API · Audit Logs",
    endpointName: "List Audit Logs",
    description: "Org-level audit events.",
    docsUrl: "https://platform.openai.com/docs/api-reference/audit-logs",
    authHint: "sk-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/organization/audit_logs?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.org.admin_api_keys",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Admin API · Organization",
    endpointName: "List Admin API Keys",
    description: "Admin keys issued for the org.",
    docsUrl: "https://platform.openai.com/docs/api-reference/admin-api-keys/list",
    authHint: "sk-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/organization/admin_api_keys?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.org.invites",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Admin API · Organization",
    endpointName: "List Invites",
    description: "Pending org invites.",
    docsUrl: "https://platform.openai.com/docs/api-reference/invites/list",
    authHint: "sk-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/organization/invites?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.org.costs",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Admin API · Usage & Cost",
    endpointName: "Costs",
    description: "Bucketed cost data in USD.",
    docsUrl: "https://platform.openai.com/docs/api-reference/usage/costs",
    authHint: "sk-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.openai.com/v1/organization/costs` +
        `?start_time=${unixDaysAgo(2)}&end_time=${unixNow()}&bucket_width=1d&limit=1`,
      headers: bearer(apiKey),
    }),
  },
  ...OPENAI_USAGE_KINDS.map<DiscoveryEndpoint>((kind) => ({
    id: `openai.org.usage.${kind}`,
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Admin API · Usage",
    endpointName: `Usage · ${kind.replace(/_/g, " ")}`,
    description: `Per-bucket usage stats for ${kind}.`,
    docsUrl: `https://platform.openai.com/docs/api-reference/usage/${kind}`,
    authHint: "sk-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.openai.com/v1/organization/usage/${kind}` +
        `?start_time=${unixDaysAgo(2)}&end_time=${unixNow()}&bucket_width=1d&limit=1`,
      headers: bearer(apiKey),
    }),
  })),
  {
    id: "openai.legacy.usage",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Legacy Dashboard",
    endpointName: "Daily Usage (legacy)",
    description: "Old per-day usage endpoint that powered the original dashboard.",
    authHint: "sk-… (admin or session)",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://api.openai.com/v1/usage?date=${dateOnlyDaysAgo(1)}`,
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.legacy.billing_usage",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Legacy Dashboard",
    endpointName: "Billing Usage (legacy)",
    description: "Deprecated dashboard billing range endpoint — often 401 on new keys.",
    authHint: "sk-… (legacy only)",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.openai.com/dashboard/billing/usage` +
        `?start_date=${dateOnlyDaysAgo(7)}&end_date=${dateOnlyDaysAgo(0)}`,
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.legacy.subscription",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Legacy Dashboard",
    endpointName: "Billing Subscription (legacy)",
    description: "Deprecated subscription/limit endpoint.",
    authHint: "sk-… (legacy only)",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/dashboard/billing/subscription",
      headers: bearer(apiKey),
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE GEMINI (AI Studio)
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "gemini.v1.models",
    provider: "gemini",
    providerLabel: "Google Gemini",
    internalProvider: "gemini",
    apiName: "Generative Language API",
    endpointName: "List Models (v1)",
    description: "Stable v1 models endpoint.",
    docsUrl: "https://ai.google.dev/api/models#method:-models.list",
    authHint: "AIza…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}&pageSize=5`,
    }),
  },
  {
    id: "gemini.v1beta.models",
    provider: "gemini",
    providerLabel: "Google Gemini",
    internalProvider: "gemini",
    apiName: "Generative Language API",
    endpointName: "List Models (v1beta)",
    description: "Beta channel models, includes preview snapshots.",
    docsUrl: "https://ai.google.dev/api/models",
    authHint: "AIza…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=5`,
    }),
  },
  {
    id: "gemini.v1beta.tuned_models",
    provider: "gemini",
    providerLabel: "Google Gemini",
    internalProvider: "gemini",
    apiName: "Generative Language API",
    endpointName: "List Tuned Models",
    description: "Tuned model snapshots accessible to this key.",
    docsUrl: "https://ai.google.dev/api/tuning",
    authHint: "AIza…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://generativelanguage.googleapis.com/v1beta/tunedModels?key=${encodeURIComponent(apiKey)}&pageSize=5`,
    }),
  },
  {
    id: "gemini.v1beta.cached_contents",
    provider: "gemini",
    providerLabel: "Google Gemini",
    internalProvider: "gemini",
    apiName: "Generative Language API",
    endpointName: "List Cached Contents",
    description: "Cached prompt content the key can reuse.",
    docsUrl: "https://ai.google.dev/api/caching",
    authHint: "AIza…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(apiKey)}&pageSize=5`,
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// VERTEX AI (requires GCP service account JSON; we surface a helpful skip)
// ─────────────────────────────────────────────────────────────────────────────

const VERTEX_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "vertex.aiplatform.publishers.models",
    provider: "vertex",
    providerLabel: "Vertex AI",
    internalProvider: "vertex",
    apiName: "Vertex AI · Publisher Models",
    endpointName: "List Anthropic Publisher Models",
    description: "Lists the Anthropic publisher models available in your region. Requires GCP service-account JSON.",
    docsUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude",
    authHint: "GCP service-account JSON",
    build: ({ apiKey, vertexProjectId, vertexLocation }) => {
      if (!looksLikeJson(apiKey)) {
        return {
          skip: "Vertex AI requires a GCP service-account JSON, not a flat string key. Paste the JSON contents to probe.",
          needs: ["vertexProjectId", "vertexLocation"],
        };
      }
      if (!vertexProjectId || !vertexLocation) {
        return {
          skip: "Provide a Vertex project id and region (e.g. us-east5) to probe this endpoint.",
          needs: ["vertexProjectId", "vertexLocation"],
        };
      }
      // The actual request will be built by the route after exchanging the SA
      // for an OAuth access token. We return a placeholder URL that the route
      // detects via a `vertex:` scheme to trigger that flow.
      return {
        method: "GET",
        url:
          `vertex://${vertexLocation}/projects/${vertexProjectId}/locations/${vertexLocation}/publishers/anthropic/models`,
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CURSOR
// ─────────────────────────────────────────────────────────────────────────────

function cursorAuth(apiKey: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}` };
}

const CURSOR_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "cursor.admin.team_members",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Admin API · Team",
    endpointName: "Team Members",
    description: "All members of the Cursor team.",
    docsUrl: "https://docs.cursor.com/account/teams/admin-api",
    authHint: "Cursor admin token",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.cursor.com/teams/members",
      headers: cursorAuth(apiKey),
    }),
  },
  {
    id: "cursor.admin.daily_usage",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Admin API · Team",
    endpointName: "Daily Usage Data",
    description: "Per-user daily activity and request counts.",
    docsUrl: "https://docs.cursor.com/account/teams/admin-api",
    authHint: "Cursor admin token",
    build: ({ apiKey }) => ({
      method: "POST",
      url: "https://api.cursor.com/teams/daily-usage-data",
      headers: { ...cursorAuth(apiKey), "Content-Type": "application/json" },
      body: {
        startDate: Date.now() - 2 * 86400_000,
        endDate: Date.now(),
        page: 1,
        pageSize: 5,
      },
    }),
  },
  {
    id: "cursor.admin.spend",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Admin API · Team",
    endpointName: "Spend",
    description: "Per-member spend in USD cents.",
    docsUrl: "https://docs.cursor.com/account/teams/admin-api",
    authHint: "Cursor admin token",
    build: ({ apiKey }) => ({
      method: "POST",
      url: "https://api.cursor.com/teams/spend",
      headers: { ...cursorAuth(apiKey), "Content-Type": "application/json" },
      body: {
        startDate: Date.now() - 2 * 86400_000,
        endDate: Date.now(),
        page: 1,
        pageSize: 5,
      },
    }),
  },
  {
    id: "cursor.admin.filtered_usage_events",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Admin API · Team",
    endpointName: "Filtered Usage Events",
    description: "Granular usage events (per request).",
    docsUrl: "https://docs.cursor.com/account/teams/admin-api",
    authHint: "Cursor admin token",
    build: ({ apiKey }) => ({
      method: "POST",
      url: "https://api.cursor.com/teams/filtered-usage-events",
      headers: { ...cursorAuth(apiKey), "Content-Type": "application/json" },
      body: {
        startDate: Date.now() - 2 * 86400_000,
        endDate: Date.now(),
        page: 1,
        pageSize: 5,
      },
    }),
  },
  {
    id: "cursor.analytics.dau",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Analytics API · Team",
    endpointName: "DAU",
    description: "Daily active users (requires read:analytics).",
    docsUrl: "https://docs.cursor.com/account/teams/admin-api",
    authHint: "Cursor analytics token",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.cursor.com/analytics/team/dau?startDate=7d&endDate=today",
      headers: cursorAuth(apiKey),
    }),
  },
  {
    id: "cursor.analytics.agent_edits",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Analytics API · Team",
    endpointName: "Agent Edits",
    description: "Suggested vs. accepted lines from the agent.",
    authHint: "Cursor analytics token",
    build: ({ apiKey }) => {
      const start = dateOnlyDaysAgo(7);
      const end = dateOnlyDaysAgo(0);
      return {
        method: "GET",
        url: `https://api.cursor.com/analytics/team/agent-edits?startDate=${start}&endDate=${end}`,
        headers: cursorAuth(apiKey),
      };
    },
  },
  {
    id: "cursor.analytics.models",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Analytics API · Team",
    endpointName: "Model Breakdown",
    description: "Messages and active users per model.",
    authHint: "Cursor analytics token",
    build: ({ apiKey }) => {
      const start = dateOnlyDaysAgo(7);
      const end = dateOnlyDaysAgo(0);
      return {
        method: "GET",
        url: `https://api.cursor.com/analytics/team/models?startDate=${start}&endDate=${end}`,
        headers: cursorAuth(apiKey),
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LOVABLE — best-effort, public surface is small.
// ─────────────────────────────────────────────────────────────────────────────

const LOVABLE_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "lovable.api.me",
    provider: "lovable",
    providerLabel: "Lovable",
    apiName: "Lovable API",
    endpointName: "Current User / Workspace",
    description: "Best-effort identity probe against Lovable's API surface.",
    authHint: "Lovable token",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.lovable.dev/v1/me",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "lovable.api.projects",
    provider: "lovable",
    providerLabel: "Lovable",
    apiName: "Lovable API",
    endpointName: "List Projects",
    description: "Projects accessible to this token.",
    authHint: "Lovable token",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.lovable.dev/v1/projects",
      headers: bearer(apiKey),
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB COPILOT
// ─────────────────────────────────────────────────────────────────────────────

const COPILOT_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "github.user",
    provider: "copilot",
    providerLabel: "GitHub Copilot",
    apiName: "GitHub API",
    endpointName: "Authenticated User",
    description: "Validates the token and reports the calling user.",
    docsUrl: "https://docs.github.com/en/rest/users/users",
    authHint: "ghp_… / github_pat_…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.github.com/user",
      headers: { ...bearer(apiKey), Accept: "application/vnd.github+json" },
    }),
  },
  {
    id: "copilot.org.billing",
    provider: "copilot",
    providerLabel: "GitHub Copilot",
    apiName: "Copilot Billing API",
    endpointName: "Org Copilot Billing",
    description: "Seat counts and plan info for an org's Copilot subscription.",
    docsUrl: "https://docs.github.com/en/rest/copilot/copilot-user-management",
    authHint: "ghp_… (with manage_billing:copilot)",
    build: ({ apiKey, githubOrg }) => {
      if (!githubOrg) {
        return { skip: "Provide a GitHub org slug to probe Copilot billing.", needs: ["githubOrg"] };
      }
      return {
        method: "GET",
        url: `https://api.github.com/orgs/${encodeURIComponent(githubOrg)}/copilot/billing`,
        headers: { ...bearer(apiKey), Accept: "application/vnd.github+json" },
      };
    },
  },
  {
    id: "copilot.org.billing_seats",
    provider: "copilot",
    providerLabel: "GitHub Copilot",
    apiName: "Copilot Billing API",
    endpointName: "Org Copilot Seats",
    description: "Per-seat assignment + last activity for the org.",
    docsUrl: "https://docs.github.com/en/rest/copilot/copilot-user-management",
    authHint: "ghp_… (with manage_billing:copilot)",
    build: ({ apiKey, githubOrg }) => {
      if (!githubOrg) {
        return { skip: "Provide a GitHub org slug to probe Copilot seats.", needs: ["githubOrg"] };
      }
      return {
        method: "GET",
        url: `https://api.github.com/orgs/${encodeURIComponent(githubOrg)}/copilot/billing/seats?per_page=5`,
        headers: { ...bearer(apiKey), Accept: "application/vnd.github+json" },
      };
    },
  },
  {
    id: "copilot.org.usage_metrics",
    provider: "copilot",
    providerLabel: "GitHub Copilot",
    apiName: "Copilot Metrics API",
    endpointName: "Org Copilot Metrics",
    description: "Daily aggregated Copilot usage metrics for an org.",
    docsUrl: "https://docs.github.com/en/rest/copilot/copilot-metrics",
    authHint: "ghp_… (with manage_billing:copilot)",
    build: ({ apiKey, githubOrg }) => {
      if (!githubOrg) {
        return { skip: "Provide a GitHub org slug to probe Copilot metrics.", needs: ["githubOrg"] };
      }
      return {
        method: "GET",
        url: `https://api.github.com/orgs/${encodeURIComponent(githubOrg)}/copilot/metrics`,
        headers: { ...bearer(apiKey), Accept: "application/vnd.github+json" },
      };
    },
  },
  {
    id: "copilot.enterprise.billing",
    provider: "copilot",
    providerLabel: "GitHub Copilot",
    apiName: "Copilot Billing API",
    endpointName: "Enterprise Copilot Billing",
    description: "Enterprise-wide Copilot seat info.",
    docsUrl: "https://docs.github.com/en/enterprise-cloud@latest/rest/copilot/copilot-user-management",
    authHint: "ghp_… (enterprise admin)",
    build: ({ apiKey, githubEnterprise }) => {
      if (!githubEnterprise) {
        return { skip: "Provide a GitHub enterprise slug to probe enterprise billing.", needs: ["githubEnterprise"] };
      }
      return {
        method: "GET",
        url: `https://api.github.com/enterprises/${encodeURIComponent(githubEnterprise)}/copilot/billing`,
        headers: { ...bearer(apiKey), Accept: "application/vnd.github+json" },
      };
    },
  },
  {
    id: "copilot.enterprise.usage_metrics",
    provider: "copilot",
    providerLabel: "GitHub Copilot",
    apiName: "Copilot Metrics API",
    endpointName: "Enterprise Copilot Metrics",
    description: "Daily Copilot metrics rolled up across the enterprise.",
    docsUrl: "https://docs.github.com/en/enterprise-cloud@latest/rest/copilot/copilot-metrics",
    authHint: "ghp_… (enterprise admin)",
    build: ({ apiKey, githubEnterprise }) => {
      if (!githubEnterprise) {
        return { skip: "Provide a GitHub enterprise slug to probe enterprise metrics.", needs: ["githubEnterprise"] };
      }
      return {
        method: "GET",
        url: `https://api.github.com/enterprises/${encodeURIComponent(githubEnterprise)}/copilot/metrics`,
        headers: { ...bearer(apiKey), Accept: "application/vnd.github+json" },
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MICROSOFT 365 COPILOT (Microsoft Graph)
// ─────────────────────────────────────────────────────────────────────────────
//
// All Microsoft Graph endpoints take a Bearer access token issued by Entra ID
// (Azure AD). For Copilot usage reports the token needs at least
// `Reports.Read.All` (delegated or app-only). The Copilot interaction history
// endpoints additionally require `AiEnterpriseInteraction.Read.All`.
//
// We probe a few baseline Graph endpoints first (so the user can confirm the
// token is alive at all) and then the Copilot-specific reports.

function graphHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ConsistencyLevel: "eventual",
  };
}

const MICROSOFT_COPILOT_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "msgraph.me",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Identity",
    endpointName: "Authenticated Identity (/me)",
    description: "Cheapest possible probe — confirms the Entra ID token is live.",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/user-get",
    authHint: "Entra ID access token (eyJ…)",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://graph.microsoft.com/v1.0/me",
      headers: graphHeaders(apiKey),
    }),
  },
  {
    id: "msgraph.organization",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Identity",
    endpointName: "Tenant Organization",
    description: "Confirms the tenant the token is scoped to.",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/organization-list",
    authHint: "Entra ID access token (eyJ…)",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://graph.microsoft.com/v1.0/organization",
      headers: graphHeaders(apiKey),
    }),
  },
  {
    id: "msgraph.users.list",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Identity",
    endpointName: "List Users (top 5)",
    description: "Validates User.Read.All / Directory.Read.All scope.",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/user-list",
    authHint: "Entra ID access token (eyJ…)",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://graph.microsoft.com/v1.0/users?$top=5",
      headers: graphHeaders(apiKey),
    }),
  },
  {
    id: "msgraph.copilot.usage_user_count_summary",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Copilot Reports",
    endpointName: "Copilot Usage · User Count Summary",
    description: "High-level summary of Copilot enabled / active users for the period.",
    docsUrl:
      "https://learn.microsoft.com/en-us/graph/api/reportroot-getmicrosoft365copilotusageusercountsummary",
    authHint: "Entra ID access token (Reports.Read.All)",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        "https://graph.microsoft.com/v1.0/reports/getMicrosoft365CopilotUsageUserCountSummary(period='D7')",
      headers: { ...graphHeaders(apiKey), Accept: "application/json" },
    }),
  },
  {
    id: "msgraph.copilot.usage_user_counts",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Copilot Reports",
    endpointName: "Copilot Usage · User Counts (per day)",
    description: "Per-day enabled vs. active Copilot users across surfaces (Teams, Outlook, Word, etc.).",
    docsUrl:
      "https://learn.microsoft.com/en-us/graph/api/reportroot-getmicrosoft365copilotusageusercounts",
    authHint: "Entra ID access token (Reports.Read.All)",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        "https://graph.microsoft.com/v1.0/reports/getMicrosoft365CopilotUsageUserCounts(period='D7')",
      headers: { ...graphHeaders(apiKey), Accept: "application/json" },
    }),
  },
  {
    id: "msgraph.copilot.usage_user_detail",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Copilot Reports",
    endpointName: "Copilot Usage · Per-User Detail",
    description: "Per-user last-activity timestamps across each Copilot surface.",
    docsUrl:
      "https://learn.microsoft.com/en-us/graph/api/reportroot-getmicrosoft365copilotusageuserdetail",
    authHint: "Entra ID access token (Reports.Read.All)",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        "https://graph.microsoft.com/v1.0/reports/getMicrosoft365CopilotUsageUserDetail(period='D7')",
      headers: { ...graphHeaders(apiKey), Accept: "application/json" },
    }),
  },
  {
    id: "msgraph.copilot.interaction_history.user",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Copilot Interactions",
    endpointName: "User Copilot Interaction History",
    description:
      "Returns the calling user's Copilot prompt/response history. Requires AiEnterpriseInteraction.Read.All (beta).",
    docsUrl:
      "https://learn.microsoft.com/en-us/graph/api/aiuser-list-interactionhistory",
    authHint: "Entra ID access token (AiEnterpriseInteraction.Read.All)",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        "https://graph.microsoft.com/beta/copilot/users/me/interactionHistory/getAllEnterpriseInteractions?$top=5",
      headers: graphHeaders(apiKey),
    }),
  },
  {
    id: "msgraph.copilot.interaction_history.tenant",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Copilot Interactions",
    endpointName: "Tenant-wide Copilot Interaction History",
    description:
      "Returns Copilot interactions across the entire tenant (app-only with AiEnterpriseInteraction.Read.All).",
    docsUrl:
      "https://learn.microsoft.com/en-us/graph/api/aiinteractionhistory-getallenterpriseinteractions",
    authHint: "App-only Entra ID token (AiEnterpriseInteraction.Read.All)",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        "https://graph.microsoft.com/beta/copilot/interactionHistory/getAllEnterpriseInteractions?$top=5",
      headers: graphHeaders(apiKey),
    }),
  },
  {
    id: "msgraph.subscribed_skus",
    provider: "microsoft_copilot",
    providerLabel: "Microsoft 365 Copilot",
    apiName: "Microsoft Graph · Licensing",
    endpointName: "Subscribed SKUs (incl. Copilot license)",
    description:
      "Lists the tenant's purchased SKUs — useful to confirm Microsoft 365 Copilot license assignment counts.",
    docsUrl:
      "https://learn.microsoft.com/en-us/graph/api/subscribedsku-list",
    authHint: "Entra ID access token (Organization.Read.All)",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://graph.microsoft.com/v1.0/subscribedSkus",
      headers: graphHeaders(apiKey),
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// n8n
// ─────────────────────────────────────────────────────────────────────────────

function normalizeBaseUrl(u: string): string {
  return u.replace(/\/+$/, "");
}

const N8N_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "n8n.api.workflows",
    provider: "n8n",
    providerLabel: "n8n",
    apiName: "Public REST API",
    endpointName: "List Workflows",
    description: "All workflows visible to the API key.",
    docsUrl: "https://docs.n8n.io/api/api-reference/",
    authHint: "n8n API key + base URL",
    build: ({ apiKey, n8nBaseUrl }) => {
      if (!n8nBaseUrl) {
        return { skip: "Provide your n8n base URL (e.g. https://your-n8n.example.com) to probe.", needs: ["n8nBaseUrl"] };
      }
      return {
        method: "GET",
        url: `${normalizeBaseUrl(n8nBaseUrl)}/api/v1/workflows?limit=5`,
        headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
      };
    },
  },
  {
    id: "n8n.api.executions",
    provider: "n8n",
    providerLabel: "n8n",
    apiName: "Public REST API",
    endpointName: "List Executions",
    description: "Recent workflow executions.",
    docsUrl: "https://docs.n8n.io/api/api-reference/",
    authHint: "n8n API key + base URL",
    build: ({ apiKey, n8nBaseUrl }) => {
      if (!n8nBaseUrl) {
        return { skip: "Provide your n8n base URL to probe.", needs: ["n8nBaseUrl"] };
      }
      return {
        method: "GET",
        url: `${normalizeBaseUrl(n8nBaseUrl)}/api/v1/executions?limit=5`,
        headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
      };
    },
  },
  {
    id: "n8n.api.users",
    provider: "n8n",
    providerLabel: "n8n",
    apiName: "Public REST API",
    endpointName: "List Users",
    description: "Tenant users (Cloud / SSO instances).",
    docsUrl: "https://docs.n8n.io/api/api-reference/",
    authHint: "n8n API key + base URL",
    build: ({ apiKey, n8nBaseUrl }) => {
      if (!n8nBaseUrl) {
        return { skip: "Provide your n8n base URL to probe.", needs: ["n8nBaseUrl"] };
      }
      return {
        method: "GET",
        url: `${normalizeBaseUrl(n8nBaseUrl)}/api/v1/users?limit=5`,
        headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
      };
    },
  },
  {
    id: "n8n.api.credentials",
    provider: "n8n",
    providerLabel: "n8n",
    apiName: "Public REST API",
    endpointName: "List Credentials",
    description: "Credential metadata (no secrets).",
    docsUrl: "https://docs.n8n.io/api/api-reference/",
    authHint: "n8n API key + base URL",
    build: ({ apiKey, n8nBaseUrl }) => {
      if (!n8nBaseUrl) {
        return { skip: "Provide your n8n base URL to probe.", needs: ["n8nBaseUrl"] };
      }
      return {
        method: "GET",
        url: `${normalizeBaseUrl(n8nBaseUrl)}/api/v1/credentials?limit=5`,
        headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public registry
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA ENDPOINTS — broader product surface coverage per provider.
//
// These are layered on top of the main per-provider blocks above and exist
// because most of these companies expose dozens of small product APIs that
// don't fit cleanly under "usage / cost / admin" but ARE worth probing during
// discovery so we know what a key can reach.
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_EXTRA_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "openai.api.files",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Files",
    endpointName: "List Files",
    description: "Files uploaded for fine-tunes, batches, and assistants.",
    docsUrl: "https://platform.openai.com/docs/api-reference/files/list",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/files?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.api.batches",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Batches",
    endpointName: "List Batches",
    description: "Async batch jobs (Chat / Embeddings / Completions).",
    docsUrl: "https://platform.openai.com/docs/api-reference/batch/list",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/batches?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.api.fine_tuning_jobs",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Fine-tuning",
    endpointName: "List Fine-tuning Jobs",
    description: "All fine-tuning jobs the key can see.",
    docsUrl: "https://platform.openai.com/docs/api-reference/fine-tuning/list",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/fine_tuning/jobs?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.api.assistants",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Assistants",
    endpointName: "List Assistants",
    description: "Assistants registered via the Assistants API.",
    docsUrl: "https://platform.openai.com/docs/api-reference/assistants/listAssistants",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/assistants?limit=5",
      headers: { ...bearer(apiKey), "OpenAI-Beta": "assistants=v2" },
    }),
  },
  {
    id: "openai.api.vector_stores",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Vector Stores",
    endpointName: "List Vector Stores",
    description: "Vector stores attached to assistants / file search.",
    docsUrl: "https://platform.openai.com/docs/api-reference/vector-stores/list",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/vector_stores?limit=5",
      headers: { ...bearer(apiKey), "OpenAI-Beta": "assistants=v2" },
    }),
  },
  {
    id: "openai.api.responses_v1",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Responses",
    endpointName: "List Responses (head)",
    description: "Stored responses created via the Responses API.",
    docsUrl: "https://platform.openai.com/docs/api-reference/responses",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/responses?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.api.evals",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Evals",
    endpointName: "List Evals",
    description: "Eval definitions stored under the Evals API.",
    docsUrl: "https://platform.openai.com/docs/api-reference/evals",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/evals?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.api.containers",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Containers",
    endpointName: "List Code Interpreter Containers",
    description: "Sandboxed Code Interpreter containers.",
    docsUrl: "https://platform.openai.com/docs/api-reference/containers",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/containers?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.api.uploads",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "API · Uploads",
    endpointName: "List Uploads (head)",
    description: "Multi-part upload sessions.",
    docsUrl: "https://platform.openai.com/docs/api-reference/uploads",
    authHint: "sk-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/uploads?limit=5",
      headers: bearer(apiKey),
    }),
  },
  {
    id: "openai.org.certificates",
    provider: "openai",
    providerLabel: "OpenAI",
    internalProvider: "openai",
    apiName: "Admin API · Certificates",
    endpointName: "List Certificates",
    description: "Org-level mTLS certificates uploaded to OpenAI.",
    docsUrl: "https://platform.openai.com/docs/api-reference/certificates",
    authHint: "sk-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.openai.com/v1/organization/certificates?limit=5",
      headers: bearer(apiKey),
    }),
  },
];

const ANTHROPIC_EXTRA_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "anthropic.admin.cost_summary",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Usage & Cost",
    endpointName: "Cost Report (no bucketing)",
    description: "Total cost for a window without bucket dimensions — useful as a smoke test.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/usage-cost/cost-report",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.anthropic.com/v1/organizations/cost_report` +
        `?starting_at=${encodeURIComponent(isoDaysAgo(7))}` +
        `&ending_at=${encodeURIComponent(isoNow())}` +
        `&group_by[]=model&limit=1`,
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.admin.usage_messages_grouped",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Usage & Cost",
    endpointName: "Messages Usage by Workspace",
    description: "Variant grouping by workspace_id rather than the default dimensions.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/usage-cost/messages-usage-report",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url:
        `https://api.anthropic.com/v1/organizations/usage_report/messages` +
        `?starting_at=${encodeURIComponent(isoDaysAgo(2))}` +
        `&ending_at=${encodeURIComponent(isoNow())}` +
        `&bucket_width=1d&group_by[]=workspace_id&limit=1`,
      headers: anthropicHeaders(apiKey),
    }),
  },
  {
    id: "anthropic.beta.message_count_tokens",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Messages API · Token Counting",
    endpointName: "Count Message Tokens",
    description: "POST helper that returns the token count of a hypothetical message.",
    docsUrl: "https://docs.claude.com/en/api/messages-count-tokens",
    authHint: "sk-ant-…",
    build: ({ apiKey }) => ({
      method: "POST",
      url: "https://api.anthropic.com/v1/messages/count_tokens",
      headers: { ...anthropicHeaders(apiKey), "content-type": "application/json" },
      body: {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello, world." }],
      },
    }),
  },
  {
    id: "anthropic.organization.root",
    provider: "anthropic",
    providerLabel: "Anthropic",
    internalProvider: "anthropic",
    apiName: "Admin API · Organization",
    endpointName: "Org Self-Description",
    description: "Returns metadata about the organization the key belongs to.",
    docsUrl: "https://docs.claude.com/en/api/admin-api/organizations",
    authHint: "sk-ant-admin-…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.anthropic.com/v1/organizations/me",
      headers: anthropicHeaders(apiKey),
    }),
  },
];

const GEMINI_EXTRA_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "gemini.v1beta.files",
    provider: "gemini",
    providerLabel: "Google Gemini",
    internalProvider: "gemini",
    apiName: "Generative Language API · Files",
    endpointName: "List Files",
    description: "User-uploaded files used for grounding / multi-modal generation.",
    docsUrl: "https://ai.google.dev/api/files",
    authHint: "AIza…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://generativelanguage.googleapis.com/v1beta/files?key=${encodeURIComponent(apiKey)}&pageSize=5`,
    }),
  },
  {
    id: "gemini.v1beta.batches",
    provider: "gemini",
    providerLabel: "Google Gemini",
    internalProvider: "gemini",
    apiName: "Generative Language API · Batches",
    endpointName: "List Batches",
    description: "Async batch generation jobs (preview).",
    docsUrl: "https://ai.google.dev/api/batch",
    authHint: "AIza…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://generativelanguage.googleapis.com/v1beta/batches?key=${encodeURIComponent(apiKey)}&pageSize=5`,
    }),
  },
  {
    id: "gemini.v1beta.corpora",
    provider: "gemini",
    providerLabel: "Google Gemini",
    internalProvider: "gemini",
    apiName: "Generative Language API · Semantic Retrieval",
    endpointName: "List Corpora",
    description: "Semantic retrieval corpora — only OAuth keys typically have access.",
    docsUrl: "https://ai.google.dev/api/semantic-retrieval/corpora",
    authHint: "AIza… (or OAuth)",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://generativelanguage.googleapis.com/v1beta/corpora?key=${encodeURIComponent(apiKey)}&pageSize=5`,
    }),
  },
  {
    id: "gemini.v1beta.tunedModels.operations",
    provider: "gemini",
    providerLabel: "Google Gemini",
    internalProvider: "gemini",
    apiName: "Generative Language API · Tuning",
    endpointName: "List Tuning Operations",
    description: "In-flight tuning long-running operations.",
    docsUrl: "https://ai.google.dev/api/tuning",
    authHint: "AIza…",
    build: ({ apiKey }) => ({
      method: "GET",
      url: `https://generativelanguage.googleapis.com/v1beta/tunedModels/operations?key=${encodeURIComponent(apiKey)}&pageSize=5`,
    }),
  },
];

const CURSOR_EXTRA_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "cursor.admin.team_subscription",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Admin API · Team",
    endpointName: "Team Subscription",
    description: "Plan / billing summary for the Cursor team (when supported).",
    authHint: "Cursor admin token",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.cursor.com/teams/subscription",
      headers: cursorAuth(apiKey),
    }),
  },
  {
    id: "cursor.admin.team_settings",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Admin API · Team",
    endpointName: "Team Settings",
    description: "Team-level configuration flags.",
    authHint: "Cursor admin token",
    build: ({ apiKey }) => ({
      method: "GET",
      url: "https://api.cursor.com/teams/settings",
      headers: cursorAuth(apiKey),
    }),
  },
  {
    id: "cursor.analytics.editor_metrics",
    provider: "cursor",
    providerLabel: "Cursor",
    internalProvider: "cursor",
    apiName: "Analytics API · Team",
    endpointName: "Editor Metrics",
    description: "Composer / Tab / Inline edit acceptance metrics.",
    authHint: "Cursor analytics token",
    build: ({ apiKey }) => {
      const start = dateOnlyDaysAgo(7);
      const end = dateOnlyDaysAgo(0);
      return {
        method: "GET",
        url: `https://api.cursor.com/analytics/team/editor-metrics?startDate=${start}&endDate=${end}`,
        headers: cursorAuth(apiKey),
      };
    },
  },
];

const VERTEX_EXTRA_ENDPOINTS: DiscoveryEndpoint[] = [
  {
    id: "vertex.publishers.google.models",
    provider: "vertex",
    providerLabel: "Vertex AI",
    internalProvider: "vertex",
    apiName: "Vertex AI · Publisher Models",
    endpointName: "List Google Publisher Models",
    description: "Lists Google's first-party models (Gemini family) available in your region.",
    docsUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models",
    authHint: "GCP service-account JSON",
    build: ({ apiKey, vertexProjectId, vertexLocation }) => {
      if (!looksLikeJson(apiKey)) {
        return {
          skip: "Vertex AI requires a GCP service-account JSON. Paste the JSON contents to probe.",
          needs: ["vertexProjectId", "vertexLocation"],
        };
      }
      if (!vertexProjectId || !vertexLocation) {
        return {
          skip: "Provide a Vertex project id and region (e.g. us-east5) to probe this endpoint.",
          needs: ["vertexProjectId", "vertexLocation"],
        };
      }
      return {
        method: "GET",
        url: `vertex://${vertexLocation}/projects/${vertexProjectId}/locations/${vertexLocation}/publishers/google/models`,
      };
    },
  },
  {
    id: "vertex.publishers.meta.models",
    provider: "vertex",
    providerLabel: "Vertex AI",
    internalProvider: "vertex",
    apiName: "Vertex AI · Publisher Models",
    endpointName: "List Meta Publisher Models",
    description: "Llama family models hosted on Vertex.",
    docsUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-llama",
    authHint: "GCP service-account JSON",
    build: ({ apiKey, vertexProjectId, vertexLocation }) => {
      if (!looksLikeJson(apiKey) || !vertexProjectId || !vertexLocation) {
        return {
          skip: "Requires SA JSON + project id + location.",
          needs: ["vertexProjectId", "vertexLocation"],
        };
      }
      return {
        method: "GET",
        url: `vertex://${vertexLocation}/projects/${vertexProjectId}/locations/${vertexLocation}/publishers/meta/models`,
      };
    },
  },
  {
    id: "vertex.publishers.mistral.models",
    provider: "vertex",
    providerLabel: "Vertex AI",
    internalProvider: "vertex",
    apiName: "Vertex AI · Publisher Models",
    endpointName: "List Mistral Publisher Models",
    description: "Mistral family models hosted on Vertex.",
    docsUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-mistral",
    authHint: "GCP service-account JSON",
    build: ({ apiKey, vertexProjectId, vertexLocation }) => {
      if (!looksLikeJson(apiKey) || !vertexProjectId || !vertexLocation) {
        return {
          skip: "Requires SA JSON + project id + location.",
          needs: ["vertexProjectId", "vertexLocation"],
        };
      }
      return {
        method: "GET",
        url: `vertex://${vertexLocation}/projects/${vertexProjectId}/locations/${vertexLocation}/publishers/mistralai/models`,
      };
    },
  },
];

export const DISCOVERY_CATALOG: DiscoveryEndpoint[] = [
  ...ANTHROPIC_ENDPOINTS,
  ...ANTHROPIC_EXTRA_ENDPOINTS,
  ...OPENAI_ENDPOINTS,
  ...OPENAI_EXTRA_ENDPOINTS,
  ...GEMINI_ENDPOINTS,
  ...GEMINI_EXTRA_ENDPOINTS,
  ...VERTEX_ENDPOINTS,
  ...VERTEX_EXTRA_ENDPOINTS,
  ...CURSOR_ENDPOINTS,
  ...CURSOR_EXTRA_ENDPOINTS,
  ...LOVABLE_ENDPOINTS,
  ...COPILOT_ENDPOINTS,
  ...MICROSOFT_COPILOT_ENDPOINTS,
  ...N8N_ENDPOINTS,
];

export const DISCOVERY_PROVIDERS: Array<{ id: DiscoveryProviderId; label: string }> = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Google Gemini" },
  { id: "vertex", label: "Vertex AI" },
  { id: "cursor", label: "Cursor" },
  { id: "lovable", label: "Lovable" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "microsoft_copilot", label: "Microsoft 365 Copilot" },
  { id: "n8n", label: "n8n" },
];

/** Heuristic key-shape detection used purely for the UI hint banner. */
export function detectKeyShape(rawKey: string): {
  hint: string;
  likelyProviders: DiscoveryProviderId[];
} {
  const k = rawKey.trim();
  if (!k) return { hint: "Empty input", likelyProviders: [] };
  if (looksLikeJson(k)) {
    return {
      hint: "GCP service-account JSON detected — Vertex AI flows can be probed.",
      likelyProviders: ["vertex"],
    };
  }
  if (looksLikeAzureAdJwt(k)) {
    return {
      hint: "Entra ID / Azure AD access token (JWT). Probing Microsoft 365 Copilot endpoints.",
      likelyProviders: ["microsoft_copilot"],
    };
  }
  if (looksLikeAnthropic(k)) {
    return {
      hint: "Anthropic key (sk-ant-…). Probing Anthropic endpoints first.",
      likelyProviders: ["anthropic"],
    };
  }
  if (k.startsWith("sk-admin-") || k.startsWith("sk-proj-") || k.startsWith("sk-svcacct-")) {
    return {
      hint: "OpenAI admin/project/service-account key.",
      likelyProviders: ["openai"],
    };
  }
  if (looksLikeGemini(k)) {
    return { hint: "Google AI Studio key (AIza…).", likelyProviders: ["gemini"] };
  }
  if (looksLikeOpenAI(k)) {
    return { hint: "OpenAI-style key (sk-…).", likelyProviders: ["openai"] };
  }
  if (looksLikeGithub(k)) {
    return {
      hint: "GitHub token (ghp_…/github_pat_…). Probing Copilot endpoints.",
      likelyProviders: ["copilot"],
    };
  }
  return {
    hint: "Unrecognised key format — probing every endpoint to discover what answers.",
    likelyProviders: [],
  };
}

export function redactKey(rawKey: string): string {
  const key = rawKey.trim();
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-3)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field/schema helpers
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FIELD_DEPTH = 5;

/**
 * Walks the parsed response and returns ONLY leaf field paths — i.e. paths
 * that resolve to a primitive, null, an empty array, or an empty object.
 *
 * Why leaves only? Earlier versions also emitted intermediate container paths
 * (e.g. `data`, `data[].results`) which are useful for understanding the
 * shape but inflate the field count and don't represent values you'd map to
 * an internal target column. The full nested structure is still recoverable
 * from the schema template returned by `buildSchemaTemplate`.
 */
export function extractFields(value: unknown, prefix = "", depth = 0, out: Set<string> = new Set()): string[] {
  if (depth > MAX_FIELD_DEPTH) {
    if (prefix) out.add(prefix);
    return [...out];
  }
  if (value === null || value === undefined) {
    if (prefix) out.add(prefix);
    return [...out];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      if (prefix) out.add(`${prefix}[]`);
    } else {
      extractFields(value[0], `${prefix}[]`, depth + 1, out);
    }
    return [...out];
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      // Empty object — treat as a leaf so it shows up in the field list.
      if (prefix) out.add(prefix);
      return [...out];
    }
    for (const [k, v] of entries) {
      const next = prefix ? `${prefix}.${k}` : k;
      extractFields(v, next, depth + 1, out);
    }
    return [...out];
  }
  if (prefix) out.add(prefix);
  return [...out];
}

export function buildSchemaTemplate(value: unknown, depth = 0): unknown {
  if (depth > MAX_FIELD_DEPTH) return "{insertnamehere}";
  if (value === null) return "{null}";
  if (value === undefined) return "{insertnamehere}";
  if (Array.isArray(value)) {
    return value.length > 0 ? [buildSchemaTemplate(value[0], depth + 1)] : ["{insertnamehere}"];
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = buildSchemaTemplate(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "number") return "{number}";
  if (typeof value === "boolean") return "{boolean}";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return "{iso-datetime}";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "{date}";
    return "{string}";
  }
  return "{insertnamehere}";
}
