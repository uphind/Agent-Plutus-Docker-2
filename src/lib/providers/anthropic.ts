import { Provider } from "@/generated/prisma/client";
import {
  ProviderAdapter,
  ProviderFetchResult,
  ProviderSampleResult,
  NormalizedUsageRecord,
  RawSampleRow,
} from "./types";

const API_BASE = "https://api.anthropic.com/v1/organizations";

// --- Messages Usage Report types ---

interface AnthropicUsageBucket {
  starting_at: string;
  ending_at: string;
  results: Array<{
    model?: string;
    workspace_id?: string;
    api_key_id?: string;
    uncached_input_tokens: number;
    output_tokens: number;
    cache_creation?: {
      ephemeral_1h_input_tokens: number;
      ephemeral_5m_input_tokens: number;
    };
    cache_read_input_tokens?: number;
    context_window?: string;
    service_tier?: string;
    inference_geo?: string;
    server_tool_use?: { web_search_requests: number };
  }>;
}

interface AnthropicCostBucket {
  starting_at: string;
  ending_at: string;
  results: Array<{
    amount: string;
    cost_type?: string;
    currency?: string;
    description?: string;
    model?: string;
    service_tier?: string;
    token_type?: string;
    workspace_id?: string;
  }>;
}

// --- Claude Code Analytics types ---

interface ClaudeCodeActor {
  type: "user_actor" | "api_actor";
  email_address?: string;
  api_key_name?: string;
}

interface ClaudeCodeToolAction {
  accepted: number;
  rejected: number;
}

interface ClaudeCodeRecord {
  date: string;
  actor: ClaudeCodeActor;
  organization_id: string;
  customer_type: string;
  terminal_type: string;
  core_metrics: {
    num_sessions: number;
    lines_of_code: { added: number; removed: number };
    commits_by_claude_code: number;
    pull_requests_by_claude_code: number;
  };
  tool_actions: {
    edit_tool?: ClaudeCodeToolAction;
    multi_edit_tool?: ClaudeCodeToolAction;
    write_tool?: ClaudeCodeToolAction;
    notebook_edit_tool?: ClaudeCodeToolAction;
  };
  model_breakdown: Array<{
    model: string;
    tokens: {
      input: number;
      output: number;
      cache_read: number;
      cache_creation: number;
    };
    estimated_cost: {
      currency: string;
      amount: number;
    };
  }>;
}

interface ClaudeCodeResponse {
  data: ClaudeCodeRecord[];
  has_more: boolean;
  next_page: string | null;
}

// --- Shared fetch helper ---

async function anthropicFetch(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
      "User-Agent": "Agent-Plutus/1.0.0",
    },
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function formatDateUTC(d: Date): string {
  return d.toISOString().split("T")[0];
}

function flattenObj(
  obj: Record<string, unknown>,
  prefix = "",
  out: RawSampleRow = {}
): RawSampleRow {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flattenObj(v as Record<string, unknown>, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

// --- Claude Code Analytics fetcher ---

async function fetchClaudeCodeAnalytics(
  apiKey: string,
  startDate: Date,
  endDate: Date
): Promise<NormalizedUsageRecord[]> {
  const records: NormalizedUsageRecord[] = [];

  const current = new Date(startDate);
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);

  while (current <= end) {
    const dateStr = formatDateUTC(current);
    let page: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let url = `${API_BASE}/usage_report/claude_code?starting_at=${dateStr}&limit=1000`;
      if (page) url += `&page=${page}`;

      const data: ClaudeCodeResponse = await anthropicFetch(url, apiKey);

      for (const rec of data.data) {
        const userRef =
          rec.actor.type === "user_actor"
            ? rec.actor.email_address ?? null
            : rec.actor.api_key_name ?? null;

        const recordDate = new Date(rec.date);

        const allTools = Object.values(rec.tool_actions).filter(
          (t): t is ClaudeCodeToolAction => t != null
        );
        const totalAccepted = allTools.reduce((s, t) => s + t.accepted, 0);
        const totalRejected = allTools.reduce((s, t) => s + t.rejected, 0);
        const totalActions = totalAccepted + totalRejected;

        const productivity = {
          source: "claude_code" as const,
          terminal_type: rec.terminal_type,
          customer_type: rec.customer_type,
          num_sessions: rec.core_metrics.num_sessions,
          lines_added: rec.core_metrics.lines_of_code.added,
          lines_removed: rec.core_metrics.lines_of_code.removed,
          commits: rec.core_metrics.commits_by_claude_code,
          pull_requests: rec.core_metrics.pull_requests_by_claude_code,
          tool_actions: rec.tool_actions,
        };

        if (rec.model_breakdown.length > 0) {
          for (const mb of rec.model_breakdown) {
            records.push({
              provider: Provider.anthropic,
              userRef,
              model: mb.model,
              date: recordDate,
              inputTokens: mb.tokens.input,
              outputTokens: mb.tokens.output,
              cachedTokens: mb.tokens.cache_read + mb.tokens.cache_creation,
              requestsCount: rec.core_metrics.num_sessions,
              costUsd: mb.estimated_cost.amount / 100,
              linesAccepted: totalAccepted,
              linesSuggested: totalAccepted + totalRejected,
              acceptRate:
                totalActions > 0 ? totalAccepted / totalActions : undefined,
              metadata: {
                ...productivity,
                _raw: {
                  "actor.email_address": rec.actor.email_address,
                  "actor.api_key_name": rec.actor.api_key_name,
                  model: mb.model,
                  "model_breakdown.tokens.input": mb.tokens.input,
                  "model_breakdown.tokens.output": mb.tokens.output,
                  "model_breakdown.tokens.cache_read": mb.tokens.cache_read,
                  "model_breakdown.tokens.cache_creation": mb.tokens.cache_creation,
                  "model_breakdown.estimated_cost.amount": mb.estimated_cost.amount,
                  "core_metrics.num_sessions": rec.core_metrics.num_sessions,
                  "tool_actions.total_accepted": totalAccepted,
                  "tool_actions.total_actions": totalActions,
                },
              },
            });
          }
        } else {
          records.push({
            provider: Provider.anthropic,
            userRef,
            model: "claude-code",
            date: recordDate,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            requestsCount: rec.core_metrics.num_sessions,
            costUsd: 0,
            linesAccepted: totalAccepted,
            linesSuggested: totalAccepted + totalRejected,
            acceptRate:
              totalActions > 0 ? totalAccepted / totalActions : undefined,
            metadata: {
              ...productivity,
              _raw: {
                "actor.email_address": rec.actor.email_address,
                "actor.api_key_name": rec.actor.api_key_name,
                "core_metrics.num_sessions": rec.core_metrics.num_sessions,
                "tool_actions.total_accepted": totalAccepted,
                "tool_actions.total_actions": totalActions,
              },
            },
          });
        }
      }

      hasMore = data.has_more;
      page = data.next_page;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return records;
}

// --- Adapter ---

export const anthropicAdapter: ProviderAdapter = {
  provider: Provider.anthropic,

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const url = `${API_BASE}/usage_report/messages?starting_at=${yesterday.toISOString()}&ending_at=${now.toISOString()}&bucket_width=1d&limit=1`;
      await anthropicFetch(url, apiKey);
      return true;
    } catch {
      return false;
    }
  },

  async fetchSample(apiKey: string): Promise<ProviderSampleResult> {
    const rows: RawSampleRow[] = [];

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    // Messages usage — grab first page only
    try {
      const url = `${API_BASE}/usage_report/messages?starting_at=${weekAgo.toISOString()}&ending_at=${now.toISOString()}&bucket_width=1d&group_by[]=model&group_by[]=api_key_id&limit=5`;
      const data = await anthropicFetch(url, apiKey);
      for (const bucket of (data.data ?? []) as AnthropicUsageBucket[]) {
        for (const result of bucket.results ?? []) {
          rows.push(flattenObj({ starting_at: bucket.starting_at, ...result }));
        }
      }
    } catch { /* endpoint may not be available */ }

    // Claude Code — grab one day
    try {
      const dateStr = formatDateUTC(now);
      const url = `${API_BASE}/usage_report/claude_code?starting_at=${dateStr}&limit=3`;
      const data: { data: ClaudeCodeRecord[] } = await anthropicFetch(url, apiKey);
      for (const rec of data.data ?? []) {
        const flat = flattenObj({
          date: rec.date,
          actor: rec.actor,
          core_metrics: rec.core_metrics,
          tool_actions: rec.tool_actions,
        });
        if (rec.model_breakdown?.[0]) {
          Object.assign(flat, flattenObj(rec.model_breakdown[0], "model_breakdown"));
        }
        rows.push(flat);
      }
    } catch { /* Claude Code may not be available */ }

    // Cost report — single page
    try {
      const url = `${API_BASE}/cost_report?starting_at=${weekAgo.toISOString()}&ending_at=${now.toISOString()}&group_by[]=description&limit=5`;
      const data = await anthropicFetch(url, apiKey);
      for (const bucket of (data.data ?? []) as AnthropicCostBucket[]) {
        for (const result of bucket.results ?? []) {
          rows.push(flattenObj(result, "cost_report"));
        }
      }
    } catch { /* cost report supplementary */ }

    const fieldSet = new Set<string>();
    for (const row of rows) {
      for (const k of Object.keys(row)) fieldSet.add(k);
    }

    return { rows, availableFields: [...fieldSet].sort() };
  },

  async fetchUsage(
    apiKey: string,
    startDate: Date,
    endDate: Date
  ): Promise<ProviderFetchResult> {
    const records: ProviderFetchResult["records"] = [];

    // 1. Messages Usage Report (general API usage, keyed by api_key_id)
    let usagePage: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let url = `${API_BASE}/usage_report/messages?starting_at=${startDate.toISOString()}&ending_at=${endDate.toISOString()}&bucket_width=1d&group_by[]=model&group_by[]=api_key_id`;
      if (usagePage) url += `&page=${usagePage}`;

      const data = await anthropicFetch(url, apiKey);
      const buckets: AnthropicUsageBucket[] = data.data ?? [];

      for (const bucket of buckets) {
        const bucketDate = new Date(bucket.starting_at);
        for (const result of bucket.results ?? []) {
          const cacheCreationTokens =
            (result.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
            (result.cache_creation?.ephemeral_5m_input_tokens ?? 0);
          const cachedTokens =
            (result.cache_read_input_tokens ?? 0) + cacheCreationTokens;

          records.push({
            provider: Provider.anthropic,
            userRef: result.api_key_id ?? null,
            model: result.model ?? null,
            date: bucketDate,
            inputTokens: result.uncached_input_tokens ?? 0,
            outputTokens: result.output_tokens ?? 0,
            cachedTokens,
            requestsCount: 0,
            costUsd: 0,
            metadata: {
              source: "messages_api",
              workspace_id: result.workspace_id,
              api_key_id: result.api_key_id,
              service_tier: result.service_tier,
              context_window: result.context_window,
              _raw: {
                model: result.model,
                api_key_id: result.api_key_id,
                uncached_input_tokens: result.uncached_input_tokens ?? 0,
                output_tokens: result.output_tokens ?? 0,
                cache_read_input_tokens: result.cache_read_input_tokens ?? 0,
                "cache_creation.ephemeral_1h_input_tokens": result.cache_creation?.ephemeral_1h_input_tokens ?? 0,
                "cache_creation.ephemeral_5m_input_tokens": result.cache_creation?.ephemeral_5m_input_tokens ?? 0,
                workspace_id: result.workspace_id,
                service_tier: result.service_tier,
                context_window: result.context_window,
              },
            },
          });
        }
      }

      hasMore = data.has_more ?? false;
      usagePage = data.next_page ?? null;
    }

    // 2. Cost Report — merge into Messages records
    try {
      let costPage: string | null = null;
      let costHasMore = true;

      while (costHasMore) {
        let url = `${API_BASE}/cost_report?starting_at=${startDate.toISOString()}&ending_at=${endDate.toISOString()}&group_by[]=description`;
        if (costPage) url += `&page=${costPage}`;

        const costData = await anthropicFetch(url, apiKey);
        const costBuckets: AnthropicCostBucket[] = costData.data ?? [];

        for (const bucket of costBuckets) {
          const bucketDate = new Date(bucket.starting_at);
          for (const result of bucket.results ?? []) {
            const amountCents = parseFloat(result.amount) || 0;
            const amountUsd = amountCents / 100;

            const matchingRecord = records.find(
              (r) =>
                r.date.getTime() === bucketDate.getTime() &&
                r.model &&
                (result.model === r.model ||
                  result.description?.includes(r.model))
            );
            if (matchingRecord) {
              matchingRecord.costUsd += amountUsd;
              const raw = (matchingRecord.metadata as Record<string, unknown> | undefined)?._raw as Record<string, unknown> | undefined;
              if (raw) raw["cost_report.amount"] = (Number(raw["cost_report.amount"]) || 0) + amountUsd;
            }
          }
        }

        costHasMore = costData.has_more ?? false;
        costPage = costData.next_page ?? null;
      }
    } catch {
      // Cost data is supplementary
    }

    // 3. Claude Code Analytics (email-based user attribution + productivity)
    try {
      const claudeCodeRecords = await fetchClaudeCodeAnalytics(
        apiKey,
        startDate,
        endDate
      );
      records.push(...claudeCodeRecords);
    } catch {
      // Claude Code analytics may not be available for all orgs
    }

    return { records };
  },
};
