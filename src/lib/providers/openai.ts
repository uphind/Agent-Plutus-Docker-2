import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, ProviderFetchResult } from "./types";

const API_BASE = "https://api.openai.com/v1/organization";

interface OpenAIUsageBucket {
  start_time: number;
  end_time: number;
  results?: Array<OpenAIUsageResult>;
  result?: Array<OpenAIUsageResult>;
}

interface OpenAIUsageResult {
  object: string;
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  input_audio_tokens?: number;
  output_audio_tokens?: number;
  num_model_requests?: number;
  model?: string;
  user_id?: string;
  project_id?: string;
  api_key_id?: string;
  batch?: boolean;
  service_tier?: string;
}

interface OpenAICostBucket {
  start_time: number;
  end_time: number;
  results?: Array<OpenAICostResult>;
  result?: Array<OpenAICostResult>;
}

interface OpenAICostResult {
  object: string;
  amount?: { value: number; currency: string };
  line_item?: string;
  project_id?: string;
}

async function openAIFetch(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export const openaiAdapter: ProviderAdapter = {
  provider: Provider.openai,

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const yesterday = now - 86400;
      const url = `${API_BASE}/usage/completions?start_time=${yesterday}&end_time=${now}&bucket_width=1d&limit=1`;
      await openAIFetch(url, apiKey);
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
    const startUnix = Math.floor(startDate.getTime() / 1000);
    const endUnix = Math.floor(endDate.getTime() / 1000);

    let page: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let url = `${API_BASE}/usage/completions?start_time=${startUnix}&end_time=${endUnix}&bucket_width=1d&group_by[]=model&group_by[]=user_id&group_by[]=api_key_id`;
      if (page) url += `&page=${page}`;

      const data = await openAIFetch(url, apiKey);
      const buckets: OpenAIUsageBucket[] = data.data ?? [];

      for (const bucket of buckets) {
        const bucketDate = new Date(bucket.start_time * 1000);
        const items = bucket.results ?? bucket.result ?? [];
        for (const result of items) {
          records.push({
            provider: Provider.openai,
            userRef: result.user_id ?? null,
            model: result.model ?? null,
            date: bucketDate,
            inputTokens: result.input_tokens ?? 0,
            outputTokens: result.output_tokens ?? 0,
            cachedTokens: result.input_cached_tokens ?? 0,
            requestsCount: result.num_model_requests ?? 0,
            costUsd: 0,
            apiKeyId: result.api_key_id ?? undefined,
            inputAudioTokens: result.input_audio_tokens ?? 0,
            outputAudioTokens: result.output_audio_tokens ?? 0,
            isBatch: result.batch ?? false,
          });
        }
      }

      hasMore = data.has_more ?? false;
      page = data.next_page ?? null;
    }

    try {
      let costPage: string | null = null;
      let costHasMore = true;

      while (costHasMore) {
        let url = `${API_BASE}/costs?start_time=${startUnix}&end_time=${endUnix}&bucket_width=1d&group_by[]=line_item`;
        if (costPage) url += `&page=${costPage}`;

        const costData = await openAIFetch(url, apiKey);
        const costBuckets: OpenAICostBucket[] = costData.data ?? [];

        for (const bucket of costBuckets) {
          const bucketDate = new Date(bucket.start_time * 1000);
          const costItems = bucket.results ?? bucket.result ?? [];
          for (const result of costItems) {
            if (result.amount?.value != null) {
              const matchingRecord = records.find(
                (r) =>
                  r.date.getTime() === bucketDate.getTime() &&
                  r.model &&
                  result.line_item?.includes(r.model)
              );
              if (matchingRecord) {
                matchingRecord.costUsd += result.amount.value;
              }
            }
          }
        }

        costHasMore = costData.has_more ?? false;
        costPage = costData.next_page ?? null;
      }
    } catch {
      // Cost data is supplementary
    }

    return { records };
  },
};
