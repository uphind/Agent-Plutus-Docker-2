import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, NormalizedUsageRecord } from "./types";

const ANALYTICS_BASE = "https://api.cursor.com/analytics/team";
const ADMIN_BASE = "https://api.cursor.com";

interface CursorAgentEditsDay {
  event_date: string;
  total_suggested_diffs: number;
  total_accepted_diffs: number;
  total_rejected_diffs: number;
  total_green_lines_accepted: number;
  total_red_lines_accepted: number;
  total_lines_suggested: number;
  total_lines_accepted: number;
}

interface CursorModelDay {
  date: string;
  model_breakdown: Record<string, { messages: number; users: number }>;
}

interface CursorDailyUsageRow {
  userId: number;
  day: string;
  date: number;
  email: string;
  isActive?: boolean;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  acceptedLinesAdded: number;
  acceptedLinesDeleted: number;
  totalApplies: number;
  totalAccepts: number;
  totalRejects: number;
  totalTabsShown: number;
  totalTabsAccepted: number;
  composerRequests: number;
  chatRequests: number;
  agentRequests: number;
  cmdkUsages: number;
  subscriptionIncludedReqs: number;
  apiKeyReqs: number;
  usageBasedReqs: number;
  bugbotUsages: number;
  mostUsedModel: string | null;
  clientVersion: string | null;
}

interface CursorSpendMember {
  userId: number;
  spendCents: number;
  overallSpendCents: number;
  fastPremiumRequests: number;
  name: string;
  email: string;
  role: string;
  hardLimitOverrideDollars: number;
  monthlyLimitDollars: number | null;
}

function authHeader(apiKey: string) {
  return { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}` };
}

async function cursorGet(url: string, apiKey: string) {
  const res = await fetch(url, { headers: authHeader(apiKey) });
  if (!res.ok) {
    throw new Error(`Cursor API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function cursorPost(url: string, apiKey: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeader(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Cursor Admin API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function fetchDailyUsage(
  apiKey: string,
  startDate: Date,
  endDate: Date
): Promise<CursorDailyUsageRow[]> {
  const allRows: CursorDailyUsageRow[] = [];
  let page = 1;
  const pageSize = 500;

  while (true) {
    const data = await cursorPost(`${ADMIN_BASE}/teams/daily-usage-data`, apiKey, {
      startDate: startDate.getTime(),
      endDate: endDate.getTime(),
      page,
      pageSize,
    });

    const rows = (data.data ?? []) as CursorDailyUsageRow[];
    allRows.push(...rows);

    if (!data.pagination?.hasNextPage) break;
    page++;
  }

  return allRows;
}

async function fetchSpend(apiKey: string): Promise<Map<string, CursorSpendMember>> {
  const spendMap = new Map<string, CursorSpendMember>();
  let page = 1;
  const pageSize = 100;

  while (true) {
    const data = await cursorPost(`${ADMIN_BASE}/teams/spend`, apiKey, {
      page,
      pageSize,
      sortBy: "amount",
      sortDirection: "desc",
    });

    for (const member of (data.teamMemberSpend ?? []) as CursorSpendMember[]) {
      spendMap.set(member.email, member);
    }

    const totalPages = data.totalPages ?? 1;
    if (page >= totalPages) break;
    page++;
  }

  return spendMap;
}

export const cursorAdapter: ProviderAdapter = {
  provider: Provider.cursor,

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      await cursorGet(`${ANALYTICS_BASE}/dau?startDate=7d&endDate=today`, apiKey);
      return true;
    } catch {
      return false;
    }
  },

  async fetchUsage(
    apiKey: string,
    startDate: Date,
    endDate: Date
  ): Promise<NormalizedUsageRecord[]> {
    const records: NormalizedUsageRecord[] = [];
    const start = formatDate(startDate);
    const end = formatDate(endDate);

    // --- Analytics API: agent edits (team-level) ---
    try {
      const editsData = await cursorGet(
        `${ANALYTICS_BASE}/agent-edits?startDate=${start}&endDate=${end}`,
        apiKey
      );

      for (const day of (editsData.data ?? []) as CursorAgentEditsDay[]) {
        records.push({
          provider: Provider.cursor,
          userRef: null,
          model: "cursor-agent",
          date: new Date(day.event_date),
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          requestsCount: day.total_suggested_diffs,
          costUsd: 0,
          linesAccepted: day.total_lines_accepted,
          linesSuggested: day.total_lines_suggested,
          acceptRate:
            day.total_lines_suggested > 0
              ? day.total_lines_accepted / day.total_lines_suggested
              : 0,
          metadata: {
            accepted_diffs: day.total_accepted_diffs,
            rejected_diffs: day.total_rejected_diffs,
          },
        });
      }
    } catch {
      // Agent edits endpoint may not be available
    }

    // --- Analytics API: model usage (team-level) ---
    try {
      const modelsData = await cursorGet(
        `${ANALYTICS_BASE}/models?startDate=${start}&endDate=${end}`,
        apiKey
      );

      for (const day of (modelsData.data ?? []) as CursorModelDay[]) {
        for (const [modelName, stats] of Object.entries(day.model_breakdown)) {
          const existing = records.find(
            (r) =>
              r.date.getTime() === new Date(day.date).getTime() &&
              r.model === modelName
          );
          if (existing) {
            existing.requestsCount += stats.messages;
            existing.metadata = {
              ...(existing.metadata as Record<string, unknown>),
              unique_users: stats.users,
            };
          } else {
            records.push({
              provider: Provider.cursor,
              userRef: null,
              model: modelName,
              date: new Date(day.date),
              inputTokens: 0,
              outputTokens: 0,
              cachedTokens: 0,
              requestsCount: stats.messages,
              costUsd: 0,
              metadata: { unique_users: stats.users },
            });
          }
        }
      }
    } catch {
      // Model usage endpoint may not be available
    }

    // --- Admin API: per-user daily usage + spend ---
    try {
      const [dailyRows, spendMap] = await Promise.all([
        fetchDailyUsage(apiKey, startDate, endDate),
        fetchSpend(apiKey),
      ]);

      // Build per-user total usageBasedReqs across the period for cost distribution
      const userOverageTotal = new Map<string, number>();
      for (const row of dailyRows) {
        if (row.usageBasedReqs > 0) {
          userOverageTotal.set(
            row.email,
            (userOverageTotal.get(row.email) ?? 0) + row.usageBasedReqs
          );
        }
      }

      for (const row of dailyRows) {
        // Included usage record (per user, per day)
        if (row.subscriptionIncludedReqs > 0) {
          records.push({
            provider: Provider.cursor,
            userRef: row.email,
            model: "cursor-included",
            date: new Date(row.day),
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            requestsCount: row.subscriptionIncludedReqs,
            costUsd: 0,
            linesAccepted: row.acceptedLinesAdded + row.acceptedLinesDeleted,
            linesSuggested: row.totalLinesAdded + row.totalLinesDeleted,
            metadata: {
              composer_requests: row.composerRequests,
              chat_requests: row.chatRequests,
              agent_requests: row.agentRequests,
              cmdk_usages: row.cmdkUsages,
              tabs_shown: row.totalTabsShown,
              tabs_accepted: row.totalTabsAccepted,
              most_used_model: row.mostUsedModel,
              client_version: row.clientVersion,
            },
          });
        }

        // Usage-based (overage) record
        if (row.usageBasedReqs > 0) {
          const spend = spendMap.get(row.email);
          const userTotalOverage = userOverageTotal.get(row.email) ?? 1;
          // Distribute the user's total overage spend proportionally across days
          const dailyCostUsd = spend
            ? (spend.spendCents / 100) * (row.usageBasedReqs / userTotalOverage)
            : 0;

          records.push({
            provider: Provider.cursor,
            userRef: row.email,
            model: "cursor-usage-based",
            date: new Date(row.day),
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            requestsCount: row.usageBasedReqs,
            costUsd: dailyCostUsd,
            metadata: {
              composer_requests: row.composerRequests,
              chat_requests: row.chatRequests,
              agent_requests: row.agentRequests,
              spend_limit_dollars: spend?.monthlyLimitDollars ?? null,
              hard_limit_dollars: spend?.hardLimitOverrideDollars ?? null,
              overage_total_cents: spend?.spendCents ?? 0,
            },
          });
        }
      }
    } catch {
      // Admin API may not be available (non-enterprise teams)
    }

    return records;
  },
};
