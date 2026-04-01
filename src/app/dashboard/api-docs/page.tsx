"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type ProviderKey = "anthropic" | "openai" | "gemini" | "cursor";

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  headers: Record<string, string>;
  queryParams?: Array<{ name: string; description: string; required?: boolean }>;
  body?: string;
  response?: string;
  notes?: string;
  usedFor: string;
}

const PROVIDERS: Record<ProviderKey, {
  name: string;
  color: string;
  baseUrl: string;
  authDescription: string;
  authKeyFormat: string;
  description: string;
  docsUrl: string;
  limitations?: string;
  endpoints: ApiEndpoint[];
}> = {
  anthropic: {
    name: "Anthropic",
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    baseUrl: "https://api.anthropic.com",
    authDescription: "Admin API Key (provisioned via Console > Settings > Admin Keys)",
    authKeyFormat: "sk-ant-admin03-...",
    description: "Agent Plutus uses the Anthropic Admin API to fetch organization-wide token consumption and cost data. Requires an admin key — standard API keys cannot access these endpoints.",
    docsUrl: "https://docs.anthropic.com/en/api/admin-api/usage-cost/get-messages-usage-report",
    endpoints: [
      {
        method: "GET",
        path: "/v1/organizations/usage_report/messages",
        description: "Retrieve token usage data aggregated by time bucket, model, and API key",
        headers: {
          "x-api-key": "sk-ant-admin03-YOUR_ADMIN_KEY",
          "anthropic-version": "2023-06-01",
        },
        queryParams: [
          { name: "starting_at", description: "RFC 3339 timestamp (e.g. 2026-03-01T00:00:00Z)", required: true },
          { name: "ending_at", description: "RFC 3339 timestamp", required: true },
          { name: "bucket_width", description: '"1m", "1h", or "1d"' },
          { name: "group_by[]", description: "api_key_id, workspace_id, model, service_tier, context_window, inference_geo, speed" },
          { name: "models[]", description: "Filter by specific models" },
          { name: "api_key_ids[]", description: "Filter by API key IDs" },
          { name: "limit, page", description: "Pagination (max 1440 for 1m, 168 for 1h, 31 for 1d)" },
        ],
        response: JSON.stringify({
          data: [{
            starting_at: "2026-03-15T00:00:00Z",
            ending_at: "2026-03-16T00:00:00Z",
            results: [{
              model: "claude-sonnet-4-20250514",
              api_key_id: "sk-ant-api03-abc123",
              workspace_id: "wrkspc_01H...",
              uncached_input_tokens: 125000,
              output_tokens: 42000,
              cache_read_input_tokens: 18500,
              cache_creation: {
                ephemeral_1h_input_tokens: 3200,
                ephemeral_5m_input_tokens: 800
              },
              server_tool_use: { web_search_requests: 0 },
              service_tier: "standard",
              context_window: "200k"
            }]
          }],
          has_more: false
        }, null, 2),
        notes: "Agent Plutus calls this with group_by[]=model&group_by[]=api_key_id and bucket_width=1d. Data freshness ~5 minutes.",
        usedFor: "Token consumption per model and API key → maps to usage_records table",
      },
      {
        method: "GET",
        path: "/v1/organizations/cost_report",
        description: "Retrieve dollar-denominated cost breakdowns per model and workspace",
        headers: {
          "x-api-key": "sk-ant-admin03-YOUR_ADMIN_KEY",
          "anthropic-version": "2023-06-01",
        },
        queryParams: [
          { name: "starting_at", description: "RFC 3339 timestamp", required: true },
          { name: "ending_at", description: "RFC 3339 timestamp", required: true },
          { name: "bucket_width", description: 'Only "1d" supported' },
          { name: "group_by[]", description: "workspace_id, description" },
        ],
        response: JSON.stringify({
          data: [{
            starting_at: "2026-03-15T00:00:00Z",
            ending_at: "2026-03-16T00:00:00Z",
            results: [{
              amount: "4523.50",
              currency: "USD",
              cost_type: "tokens",
              token_type: "uncached_input_tokens",
              model: "claude-sonnet-4-20250514",
              service_tier: "standard",
              workspace_id: "wrkspc_01H..."
            }]
          }],
          has_more: false
        }, null, 2),
        notes: "Amount is in cents (e.g. \"4523.50\" = $45.24). Agent Plutus merges cost data with usage data to populate cost_usd per record.",
        usedFor: "Dollar costs per model → merged into usage_records.cost_usd",
      },
    ],
  },
  openai: {
    name: "OpenAI",
    color: "bg-green-500/10 text-green-600 border-green-500/20",
    baseUrl: "https://api.openai.com/v1",
    authDescription: "Admin API Key (created via admin API key endpoint, not standard project keys)",
    authKeyFormat: "sk-admin-...",
    description: "Agent Plutus uses the OpenAI Organization Usage API to pull per-user, per-model token consumption and cost data. Admin keys are separate from inference keys and cannot be used for chat completions.",
    docsUrl: "https://platform.openai.com/docs/api-reference/usage",
    endpoints: [
      {
        method: "GET",
        path: "/organization/usage/completions",
        description: "Get token usage for chat/text completions grouped by model, user, and API key",
        headers: {
          "Authorization": "Bearer sk-admin-YOUR_ADMIN_KEY",
        },
        queryParams: [
          { name: "start_time", description: "Unix timestamp in seconds (inclusive)", required: true },
          { name: "end_time", description: "Unix timestamp in seconds (exclusive)" },
          { name: "bucket_width", description: '"1m", "1h", or "1d" (default "1d")' },
          { name: "group_by[]", description: "project_id, user_id, api_key_id, model, batch, service_tier" },
          { name: "models[]", description: "Filter by model names" },
          { name: "user_ids[]", description: "Filter by user IDs" },
          { name: "limit, page", description: "Pagination (max 31 buckets for 1d)" },
        ],
        response: JSON.stringify({
          object: "page",
          data: [{
            start_time: 1742169600,
            end_time: 1742256000,
            results: [{
              object: "organization.usage.completions.result",
              input_tokens: 850000,
              output_tokens: 320000,
              input_cached_tokens: 45000,
              input_audio_tokens: 0,
              output_audio_tokens: 0,
              num_model_requests: 1250,
              model: "gpt-4o-2024-08-06",
              project_id: "proj_abc123",
              user_id: "user-abc123",
              api_key_id: "sk-proj-abc123",
              batch: false,
              service_tier: "default"
            }]
          }],
          has_more: false
        }, null, 2),
        notes: "Agent Plutus calls with group_by[]=model&group_by[]=user_id&group_by[]=api_key_id. Also available: /usage/embeddings, /usage/images, /usage/audio_speeches.",
        usedFor: "Per-user token usage, requests, batch status, audio tokens → usage_records table",
      },
      {
        method: "GET",
        path: "/organization/costs",
        description: "Get dollar-denominated cost data grouped by project and line item",
        headers: {
          "Authorization": "Bearer sk-admin-YOUR_ADMIN_KEY",
        },
        queryParams: [
          { name: "start_time", description: "Unix timestamp in seconds", required: true },
          { name: "end_time", description: "Unix timestamp in seconds" },
          { name: "bucket_width", description: 'Only "1d" supported' },
          { name: "group_by[]", description: "project_id, line_item" },
          { name: "limit", description: "1-180, default 7" },
        ],
        response: JSON.stringify({
          object: "page",
          data: [{
            start_time: 1742169600,
            end_time: 1742256000,
            results: [{
              object: "organization.costs.result",
              amount: { value: 15.20, currency: "usd" },
              line_item: "GPT-4o completions",
              project_id: "proj_abc123"
            }]
          }],
          has_more: false
        }, null, 2),
        notes: "Amount is in USD (not cents). Agent Plutus matches line_item to model names to merge costs with usage records.",
        usedFor: "Dollar costs per model → merged into usage_records.cost_usd",
      },
    ],
  },
  gemini: {
    name: "Google Vertex AI",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    baseUrl: "https://us-central1-aiplatform.googleapis.com",
    authDescription: "GCP Service Account JSON key with roles: Vertex AI User, Monitoring Viewer, BigQuery Data Viewer, Billing Account Viewer",
    authKeyFormat: '{"project_id": "...", "client_email": "...", "private_key": "..."}',
    description: "Agent Plutus connects to Vertex AI (Google Cloud's enterprise AI platform) using a GCP Service Account. Usage metrics come from Cloud Monitoring API, and cost/billing data comes from BigQuery billing export. This is the enterprise path — not Google AI Studio.",
    docsUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-observability",
    endpoints: [
      {
        method: "POST",
        path: "/v3/projects/{project}/timeSeries:query",
        description: "Query Cloud Monitoring for Vertex AI prediction metrics (requests, latency, token throughput)",
        headers: {
          "Authorization": "Bearer ya29.YOUR_SERVICE_ACCOUNT_TOKEN",
          "Content-Type": "application/json",
        },
        queryParams: [
          { name: "project", description: "GCP project ID from service account", required: true },
        ],
        body: JSON.stringify({
          query: `fetch aiplatform.googleapis.com/Endpoint
| metric 'aiplatform.googleapis.com/prediction/online/response_count'
| filter resource.labels.endpoint_id != ''
| align rate(1m)
| every 1d
| group_by [metric.model_display_name], [value_response_count_aggregate: aggregate(value.response_count)]`
        }, null, 2),
        response: JSON.stringify({
          timeSeriesData: [{
            labelValues: [{ stringValue: "gemini-2.5-pro" }],
            pointData: [{
              timeInterval: {
                startTime: "2026-03-15T00:00:00Z",
                endTime: "2026-03-16T00:00:00Z"
              },
              values: [{ int64Value: "1250" }]
            }]
          }]
        }, null, 2),
        notes: "Base URL is monitoring.googleapis.com/v3. Available metrics include prediction/online/response_count, prediction/online/prediction_latencies, prediction/online/error_count. Token-level usage requires BigQuery billing export.",
        usedFor: "Request counts, error rates, latency per model → operational health monitoring",
      },
      {
        method: "GET",
        path: "/v1/billingAccounts/{billing_account_id}/projects",
        description: "List projects under a billing account to discover Vertex AI usage",
        headers: {
          "Authorization": "Bearer ya29.YOUR_SERVICE_ACCOUNT_TOKEN",
        },
        queryParams: [
          { name: "billing_account_id", description: "GCP billing account ID (e.g. 01A2B3-C4D5E6-F7G8H9)", required: true },
        ],
        response: JSON.stringify({
          projectBillingInfo: [{
            name: "billingAccounts/01A2B3-C4D5E6-F7G8H9/projects/my-ai-project",
            projectId: "my-ai-project",
            billingAccountName: "billingAccounts/01A2B3-C4D5E6-F7G8H9",
            billingEnabled: true
          }]
        }, null, 2),
        notes: "Base URL is cloudbilling.googleapis.com. Agent Plutus uses this to discover which projects are linked to the billing account for cost attribution.",
        usedFor: "Project discovery for billing attribution",
      },
      {
        method: "SQL",
        path: "BigQuery: gcp_billing_export_v1_XXXXXX",
        description: "Query billing export for per-model token usage and dollar costs. This is the primary source for Gemini usage data.",
        headers: {
          "Authorization": "Bearer ya29.YOUR_SERVICE_ACCOUNT_TOKEN",
        },
        body: `SELECT
  sku.description AS model_sku,
  project.id AS project_id,
  labels.value AS user_label,
  SUM(usage.amount) AS total_tokens,
  usage.unit,
  SUM(cost) AS total_cost,
  SUM(IFNULL(
    (SELECT SUM(c.amount) FROM UNNEST(credits) c),
    0)) AS total_credits,
  currency,
  invoice.month
FROM \`project.dataset.gcp_billing_export_v1_XXXXXX\`
LEFT JOIN UNNEST(labels) AS labels
  ON labels.key = 'user'
WHERE service.description = 'Vertex AI API'
  AND sku.description LIKE '%Gemini%'
  AND usage_start_time >= '2026-03-01'
GROUP BY 1, 2, 3, 5, 8, 9
ORDER BY total_cost DESC`,
        response: JSON.stringify([
          {
            model_sku: "Gemini 2.5 Pro Online Prediction Input (text, image, video ≤ 200k tokens)",
            project_id: "my-ai-project",
            user_label: "team-platform",
            total_tokens: 15000000,
            unit: "count",
            total_cost: 18.75,
            total_credits: -2.50,
            currency: "USD",
            month: "202603"
          },
          {
            model_sku: "Gemini 2.5 Pro Online Prediction Output",
            project_id: "my-ai-project",
            user_label: "team-platform",
            total_tokens: 4200000,
            unit: "count",
            total_cost: 42.00,
            total_credits: 0,
            currency: "USD",
            month: "202603"
          },
          {
            model_sku: "Gemini 2.5 Flash Online Prediction Input (text, image, video)",
            project_id: "my-ai-project",
            user_label: "team-frontend",
            total_tokens: 28000000,
            unit: "count",
            total_cost: 7.00,
            total_credits: 0,
            currency: "USD",
            month: "202603"
          }
        ], null, 2),
        notes: "Requires Cloud Billing export to BigQuery (enable in Cloud Console > Billing > Billing export). SKU descriptions contain model names (e.g. 'Gemini 2.5 Pro') and distinguish Input vs Output tokens. GCP labels can be used for team/user attribution. Agent Plutus parses SKU descriptions to extract model name and token direction.",
        usedFor: "Per-model input/output token counts and dollar costs → usage_records table",
      },
    ],
  },
  cursor: {
    name: "Cursor",
    color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    baseUrl: "https://api.cursor.com",
    authDescription: "Admin API Key (created from cursor.com/dashboard > Settings > Advanced > Admin API Keys)",
    authKeyFormat: "Basic {base64(api_key + ':')}", 
    description: "Agent Plutus uses both the Cursor Analytics API (team-level metrics) and Admin API (per-user usage and spend). Enterprise plan required for most endpoints. Authentication uses HTTP Basic with the API key as username.",
    docsUrl: "https://cursor.com/docs/account/teams/admin-api",
    endpoints: [
      {
        method: "POST",
        path: "/teams/daily-usage-data",
        description: "Per-user daily productivity metrics aggregated hourly",
        headers: {
          "Authorization": "Basic {base64(YOUR_API_KEY + ':')}",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: 1709251200000,
          endDate: 1711929600000,
          page: 1,
          pageSize: 500
        }, null, 2),
        response: JSON.stringify({
          data: [{
            userId: 12345,
            day: "2026-03-15",
            date: 1742169600000,
            email: "alice.chen@demo-org.com",
            totalLinesAdded: 450,
            totalLinesDeleted: 120,
            acceptedLinesAdded: 310,
            acceptedLinesDeleted: 85,
            totalApplies: 42,
            totalAccepts: 38,
            totalRejects: 4,
            totalTabsShown: 85,
            totalTabsAccepted: 62,
            composerRequests: 12,
            chatRequests: 28,
            agentRequests: 5,
            cmdkUsages: 15,
            subscriptionIncludedReqs: 95,
            apiKeyReqs: 0,
            usageBasedReqs: 8,
            bugbotUsages: 2,
            mostUsedModel: "claude-sonnet-4",
            clientVersion: "0.46.1"
          }],
          pagination: { page: 1, hasNextPage: false }
        }, null, 2),
        notes: "Dates are epoch milliseconds. Agent Plutus maps this to usage_records with metadata for composer/chat/agent/tab breakdown.",
        usedFor: "Per-user lines accepted/suggested, request breakdown → usage_records + accept_rate",
      },
      {
        method: "POST",
        path: "/teams/spend",
        description: "Current billing cycle spending per user",
        headers: {
          "Authorization": "Basic {base64(YOUR_API_KEY + ':')}",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sortBy: "amount",
          sortDirection: "desc",
          page: 1,
          pageSize: 100
        }, null, 2),
        response: JSON.stringify({
          teamMemberSpend: [{
            userId: 12345,
            name: "Alice Chen",
            email: "alice.chen@demo-org.com",
            role: "member",
            spendCents: 1250,
            overallSpendCents: 4800,
            fastPremiumRequests: 3,
            hardLimitOverrideDollars: 50,
            monthlyLimitDollars: 40
          }],
          totalPages: 1
        }, null, 2),
        notes: "spendCents is the current billing cycle overage. Agent Plutus distributes this cost proportionally across a user's usage-based requests.",
        usedFor: "Per-user dollar costs for usage-based requests → usage_records.cost_usd",
      },
      {
        method: "GET",
        path: "/analytics/team/agent-edits",
        description: "Team-level AI code edit metrics (suggested/accepted diffs and lines)",
        headers: {
          "Authorization": "Basic {base64(YOUR_API_KEY + ':')}",
        },
        queryParams: [
          { name: "startDate", description: "YYYY-MM-DD format", required: true },
          { name: "endDate", description: "YYYY-MM-DD format", required: true },
        ],
        response: JSON.stringify({
          data: [{
            event_date: "2026-03-15",
            total_suggested_diffs: 180,
            total_accepted_diffs: 145,
            total_rejected_diffs: 35,
            total_green_lines_accepted: 520,
            total_red_lines_accepted: 140,
            total_lines_suggested: 890,
            total_lines_accepted: 660
          }]
        }, null, 2),
        notes: "Team-aggregate data (not per-user). Agent Plutus uses this for ROI calculation (lines accepted → hours saved).",
        usedFor: "Team-level lines accepted/suggested → ROI analytics",
      },
      {
        method: "GET",
        path: "/analytics/team/dau",
        description: "Daily active users across Cursor IDE, CLI, Cloud Agent, and BugBot",
        headers: {
          "Authorization": "Basic {base64(YOUR_API_KEY + ':')}",
        },
        queryParams: [
          { name: "startDate", description: "YYYY-MM-DD or relative (e.g. '7d')", required: true },
          { name: "endDate", description: "YYYY-MM-DD or 'today'", required: true },
        ],
        response: JSON.stringify({
          data: [{
            date: "2026-03-15",
            dau: 13,
            cli_dau: 4,
            cloud_agent_dau: 2,
            bugbot_dau: 1
          }]
        }, null, 2),
        notes: "Agent Plutus stores DAU in the cursor_dau table for seat optimization analysis.",
        usedFor: "Daily active user counts → cursor_dau table, seat optimization",
      },
      {
        method: "GET",
        path: "/analytics/team/models",
        description: "Model usage breakdown per day (messages and unique users per model)",
        headers: {
          "Authorization": "Basic {base64(YOUR_API_KEY + ':')}",
        },
        queryParams: [
          { name: "startDate", description: "YYYY-MM-DD format", required: true },
          { name: "endDate", description: "YYYY-MM-DD format", required: true },
        ],
        response: JSON.stringify({
          data: [{
            date: "2026-03-15",
            model_breakdown: {
              "claude-sonnet-4": { messages: 245, users: 8 },
              "gpt-4o": { messages: 120, users: 5 },
              "gemini-2.5-pro": { messages: 45, users: 3 }
            }
          }]
        }, null, 2),
        notes: "Agent Plutus merges model breakdown data with per-user usage to attribute requests per model.",
        usedFor: "Per-model request counts and user counts → usage_records",
      },
    ],
  },
};

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    SQL: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0", colors[method] ?? "bg-gray-100 text-gray-700")}>
      {method}
    </span>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      {label && (
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      )}
      <div className="bg-gray-950 rounded-lg overflow-hidden">
        <pre className="p-4 text-[13px] leading-relaxed text-gray-300 overflow-x-auto font-mono">
          <code>{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-white text-xs"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function ParamsTable({ params }: { params: Array<{ name: string; description: string; required?: boolean }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">Parameter</th>
            <th className="text-left py-1.5 font-medium text-muted-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-b border-border/50">
              <td className="py-1.5 pr-4">
                <code className="text-xs font-mono">{p.name}</code>
                {p.required && <span className="ml-1 text-red-400 text-[10px]">*</span>}
              </td>
              <td className="py-1.5 text-muted-foreground">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCard({ endpoint, baseUrl }: { endpoint: ApiEndpoint; baseUrl: string }) {
  const [expanded, setExpanded] = useState(false);

  const curlParts = [
    `curl -X ${endpoint.method === "SQL" ? "POST" : endpoint.method} "${endpoint.method === "SQL" ? "BigQuery API" : baseUrl + endpoint.path}"`,
    ...Object.entries(endpoint.headers).map(([k, v]) => `  -H "${k}: ${v}"`),
    ...(endpoint.body && endpoint.method !== "SQL" ? [`  -d '${endpoint.body}'`] : []),
  ];
  const curlCmd = curlParts.join(" \\\n");

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
      >
        <MethodBadge method={endpoint.method} />
        <code className="text-sm font-mono text-foreground flex-1 truncate">{endpoint.path}</code>
        <span className="text-[11px] text-muted-foreground hidden lg:block max-w-[200px] truncate">{endpoint.usedFor}</span>
        <svg className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", expanded && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/30">
          <p className="text-sm text-muted-foreground">{endpoint.description}</p>

          <div className="flex gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <svg className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Used for:</span> {endpoint.usedFor}</p>
          </div>

          {endpoint.queryParams && (
            <div>
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Query Parameters</div>
              <ParamsTable params={endpoint.queryParams} />
            </div>
          )}

          {endpoint.method !== "SQL" && <CodeBlock code={curlCmd} label="cURL Example" />}

          {endpoint.body && endpoint.method === "SQL" && (
            <CodeBlock code={endpoint.body} label="BigQuery SQL" />
          )}

          {endpoint.body && endpoint.method !== "SQL" && (
            <CodeBlock code={endpoint.body} label="Request Body" />
          )}

          {endpoint.response && (
            <CodeBlock code={endpoint.response} label="Response" />
          )}

          {endpoint.notes && (
            <div className="flex gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <svg className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-muted-foreground">{endpoint.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiDocsPage() {
  const [activeProvider, setActiveProvider] = useState<ProviderKey>("anthropic");
  const provider = PROVIDERS[activeProvider];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Enterprise admin API endpoints used by Agent Plutus to sync organization usage and cost data.
        </p>
      </div>

      {/* Provider tabs */}
      <div className="flex gap-2 flex-wrap">
        {(Object.entries(PROVIDERS) as [ProviderKey, typeof PROVIDERS[ProviderKey]][]).map(([key, p]) => (
          <button
            key={key}
            onClick={() => setActiveProvider(key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
              activeProvider === key
                ? p.color
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Provider detail */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{provider.name} Admin API</h2>
            <p className="text-sm text-muted-foreground mt-1">{provider.description}</p>
          </div>
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:text-blue-400 flex items-center gap-1 shrink-0"
          >
            Official Docs
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        {/* Connection info */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Base URL</div>
            <code className="text-sm font-mono">{provider.baseUrl}</code>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Auth</div>
            <code className="text-sm font-mono">{provider.authKeyFormat}</code>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-muted/50">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Authentication</div>
          <p className="text-sm text-muted-foreground">{provider.authDescription}</p>
        </div>

        {provider.limitations && (
          <div className="flex gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <svg className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-xs text-muted-foreground">{provider.limitations}</p>
          </div>
        )}

        {/* Endpoints */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Endpoints</h3>
          {provider.endpoints.map((ep, i) => (
            <EndpointCard key={i} endpoint={ep} baseUrl={provider.baseUrl} />
          ))}
        </div>

        {/* Source reference */}
        <div className="border-t border-border pt-4">
          <p className="text-[11px] text-muted-foreground">
            Source: <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{provider.docsUrl}</a>
          </p>
        </div>
      </div>

      {/* Data flow summary */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">How Agent Plutus Syncs Data</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { step: "1", title: "Admin Keys", desc: "Enterprise admin API keys are configured in Settings. Keys are AES-256 encrypted at rest. These are separate from inference keys." },
            { step: "2", title: "Periodic Sync", desc: "The sync engine calls each provider's admin usage API on a configurable schedule (default: every 6 hours) with retry logic and rate limit handling." },
            { step: "3", title: "User Attribution", desc: "Usage is attributed to org users by matching API key IDs, user IDs, or email addresses from the provider response to the org directory." },
            { step: "4", title: "Normalization", desc: "Token counts, costs, and metadata are normalized into a unified schema across all providers for consistent analytics and reporting." },
          ].map((s) => (
            <div key={s.step} className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{s.step}</span>
                <span className="text-sm font-medium">{s.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
