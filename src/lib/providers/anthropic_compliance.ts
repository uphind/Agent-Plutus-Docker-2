import { Provider } from "@/generated/prisma/client";
import {
  ProviderAdapter,
  ProviderFetchResult,
  ProviderSampleResult,
  NormalizedUsageRecord,
  RawSampleRow,
} from "./types";

const API_BASE = "https://api.anthropic.com/v1/organizations";

// Actor variants per the Compliance API spec (Rev I).
// All variants share ip_address / user_agent on authenticated requests, but
// the identifying field differs per actor type.
interface ComplianceActor {
  type?:
    | "user_actor"
    | "api_actor"
    | "admin_api_key_actor"
    | "unauthenticated_user_actor"
    | "anthropic_actor"
    | "scim_directory_sync_actor";
  // user_actor
  email_address?: string | null;
  user_id?: string;
  // api_actor
  api_key_id?: string;
  // admin_api_key_actor
  admin_api_key_id?: string;
  // unauthenticated_user_actor
  unauthenticated_email_address?: string;
  // scim_directory_sync_actor
  workos_event_id?: string;
  directory_id?: string;
  idp_connection_type?: string | null;
  // common
  ip_address?: string;
  user_agent?: string;
}

interface ComplianceActivity {
  id: string;
  created_at: string;
  organization_id?: string | null;
  organization_uuid?: string | null;
  type?: string;
  actor?: ComplianceActor;
  // Common type-specific fields we surface today; the spec defines many more
  // per activity type (claude_file_id, filename, api_key_id, workspace_id, …)
  // but we only need a handful for the dashboard.
  claude_chat_id?: string;
  claude_project_id?: string;
  [key: string]: unknown;
}

interface ComplianceResponse {
  data?: ComplianceActivity[];
  has_more?: boolean;
  // Activities endpoint uses cursor pagination via after_id/before_id;
  // first_id/last_id are returned for the caller to use as the next cursor.
  first_id?: string | null;
  last_id?: string | null;
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

// Activities endpoint max per request is 5,000 (Rev F+).
const ACTIVITIES_PAGE_SIZE = 5000;

function extractUserRef(actor: ComplianceActor | undefined): string {
  if (!actor) return "unknown";
  switch (actor.type) {
    case "user_actor":
      return actor.email_address ?? actor.user_id ?? "unknown";
    case "api_actor":
      return actor.api_key_id ?? "unknown";
    case "admin_api_key_actor":
      return actor.admin_api_key_id ?? "unknown";
    case "unauthenticated_user_actor":
      return actor.unauthenticated_email_address ?? "unknown";
    case "scim_directory_sync_actor":
      return actor.directory_id ?? "scim";
    case "anthropic_actor":
      return "anthropic";
    default:
      // Fall back across any field we recognise so we never silently drop events
      return (
        actor.email_address ??
        actor.user_id ??
        actor.api_key_id ??
        actor.admin_api_key_id ??
        actor.unauthenticated_email_address ??
        "unknown"
      );
  }
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
        actorTypes: Record<string, number>;
        activityTypes: Record<string, number>;
        ipAddresses: Set<string>;
        userAgents: Set<string>;
        organizationUuids: Set<string>;
      }
    >();

    // Cursor pagination per the Compliance API spec: append &after_id=<last_id>
    // to walk backwards in time. Activities are returned newest-first.
    const baseUrl =
      `${API_BASE}/compliance/activities` +
      `?created_at.gte=${encodeURIComponent(startDate.toISOString())}` +
      `&created_at.lt=${encodeURIComponent(endDate.toISOString())}` +
      `&limit=${ACTIVITIES_PAGE_SIZE}`;

    let afterId: string | null = null;

    while (true) {
      const url = afterId
        ? `${baseUrl}&after_id=${encodeURIComponent(afterId)}`
        : baseUrl;
      const data: ComplianceResponse = await complianceFetch(url, apiKey);
      const events = data.data ?? [];

      for (const event of events) {
        const userRef = extractUserRef(event.actor);
        const eventDate = dateKey(event.created_at);
        const key = buildKey(eventDate, userRef);

        const bucket =
          buckets.get(key) ??
          {
            date: new Date(eventDate),
            userRef,
            requestsCount: 0,
            actorTypes: {},
            activityTypes: {},
            ipAddresses: new Set<string>(),
            userAgents: new Set<string>(),
            organizationUuids: new Set<string>(),
          };

        bucket.requestsCount += 1;
        if (event.type) {
          bucket.activityTypes[event.type] = (bucket.activityTypes[event.type] ?? 0) + 1;
        }
        if (event.actor?.type) {
          bucket.actorTypes[event.actor.type] =
            (bucket.actorTypes[event.actor.type] ?? 0) + 1;
        }
        if (event.actor?.ip_address) {
          bucket.ipAddresses.add(event.actor.ip_address);
        }
        if (event.actor?.user_agent) {
          bucket.userAgents.add(event.actor.user_agent);
        }
        if (event.organization_uuid) {
          bucket.organizationUuids.add(event.organization_uuid);
        }
        buckets.set(key, bucket);
      }

      if (!data.has_more || !data.last_id) break;
      afterId = data.last_id;
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
          actor_types: bucket.actorTypes,
          activity_types: bucket.activityTypes,
          ip_addresses: Array.from(bucket.ipAddresses),
          user_agents: Array.from(bucket.userAgents),
          organization_uuids: Array.from(bucket.organizationUuids),
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
