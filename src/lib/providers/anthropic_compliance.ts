import { Provider } from "@/generated/prisma/client";
import {
  ProviderAdapter,
  ProviderFetchResult,
  ProviderSampleResult,
  NormalizedUsageRecord,
  RawSampleRow,
} from "./types";

const API_BASE = "https://api.anthropic.com/v1/organizations";

interface ComplianceActor {
  type?: "user_actor" | "api_actor";
  email_address?: string;
  user_id?: string;
  api_key_name?: string;
  ip_address?: string;
  user_agent?: string;
}

interface ComplianceActivity {
  id: string;
  created_at: string;
  organization_id?: string;
  organization_uuid?: string;
  type?: string;
  actor?: ComplianceActor;
  claude_chat_id?: string;
  claude_project_id?: string;
  [key: string]: unknown;
}

interface ComplianceResponse {
  data?: ComplianceActivity[];
  has_more?: boolean;
  next_page?: string | null;
}

async function complianceFetch(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
      "User-Agent": "Agent-Plutus/1.0.0",
    },
  });
  if (!res.ok) {
    throw new Error(`Anthropic Compliance API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function dateKey(iso: string): string {
  return iso.split("T")[0];
}

function buildKey(date: string, userRef: string): string {
  return `${date}|${userRef}`;
}

export const anthropicComplianceAdapter: ProviderAdapter = {
  provider: Provider.anthropic_compliance,

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      // Fetch a tiny window of activity to verify the key works
      const since = new Date(Date.now() - 86400000).toISOString();
      const url = `${API_BASE}/compliance/activities?created_at.gte=${encodeURIComponent(since)}&limit=1`;
      await complianceFetch(url, apiKey);
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
    const records: NormalizedUsageRecord[] = [];

    // Aggregate per (date, userRef) — counting activity events
    const buckets = new Map<
      string,
      {
        date: Date;
        userRef: string;
        requestsCount: number;
        activityTypes: Record<string, number>;
        ipAddresses: Set<string>;
      }
    >();

    let url: string | null =
      `${API_BASE}/compliance/activities?created_at.gte=${encodeURIComponent(startDate.toISOString())}&created_at.lt=${encodeURIComponent(endDate.toISOString())}&limit=1000`;

    while (url) {
      const data: ComplianceResponse = await complianceFetch(url, apiKey);
      const events = data.data ?? [];

      for (const event of events) {
        const userRef =
          event.actor?.email_address ??
          event.actor?.user_id ??
          event.actor?.api_key_name ??
          "unknown";
        const eventDate = dateKey(event.created_at);
        const key = buildKey(eventDate, userRef);

        const bucket =
          buckets.get(key) ??
          {
            date: new Date(eventDate),
            userRef,
            requestsCount: 0,
            activityTypes: {},
            ipAddresses: new Set<string>(),
          };

        bucket.requestsCount += 1;
        if (event.type) {
          bucket.activityTypes[event.type] = (bucket.activityTypes[event.type] ?? 0) + 1;
        }
        if (event.actor?.ip_address) {
          bucket.ipAddresses.add(event.actor.ip_address);
        }
        buckets.set(key, bucket);
      }

      url = data.next_page ?? null;
      if (!data.has_more) break;
    }

    for (const bucket of buckets.values()) {
      records.push({
        provider: Provider.anthropic_compliance,
        userRef: bucket.userRef,
        model: null,
        date: bucket.date,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        requestsCount: bucket.requestsCount,
        costUsd: 0,
        metadata: {
          source: "compliance_api",
          activity_types: bucket.activityTypes,
          ip_addresses: Array.from(bucket.ipAddresses),
        },
      });
    }

    return { records };
  },

  async fetchSample(apiKey: string): Promise<ProviderSampleResult> {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const url = `${API_BASE}/compliance/activities?created_at.gte=${encodeURIComponent(since)}&limit=5`;
    const data: ComplianceResponse = await complianceFetch(url, apiKey);

    const rows: RawSampleRow[] = (data.data ?? []).map((event) => flatten(event as unknown as Record<string, unknown>));
    const availableFields = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row)))
    );

    return { rows, availableFields };
  },
};

function flatten(
  obj: Record<string, unknown>,
  prefix = "",
  out: Record<string, unknown> = {}
): Record<string, unknown> {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}
