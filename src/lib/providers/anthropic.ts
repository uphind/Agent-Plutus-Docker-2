import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, ProviderFetchResult } from "./types";

const API_BASE = "https://api.anthropic.com/v1/organizations";

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

  async fetchUsage(
    apiKey: string,
    startDate: Date,
    endDate: Date
  ): Promise<ProviderFetchResult> {
    const records: ProviderFetchResult["records"] = [];

    // Fetch usage data
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
              workspace_id: result.workspace_id,
              api_key_id: result.api_key_id,
              service_tier: result.service_tier,
              context_window: result.context_window,
            },
          });
        }
      }

      hasMore = data.has_more ?? false;
      usagePage = data.next_page ?? null;
    }

    // Fetch cost data and merge
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
            // amount is a string in cents (e.g. "123.45" = $1.2345)
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
            }
          }
        }

        costHasMore = costData.has_more ?? false;
        costPage = costData.next_page ?? null;
      }
    } catch {
      // Cost data is supplementary -- don't fail if unavailable
    }

    return { records };
  },
};
