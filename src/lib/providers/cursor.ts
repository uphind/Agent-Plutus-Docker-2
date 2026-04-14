import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, ProviderFetchResult, CursorDauRecord, ProviderSampleResult, RawSampleRow } from "./types";

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

  async fetchSample(apiKey: string): Promise<ProviderSampleResult> {
    const rows: RawSampleRow[] = [];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const start = formatDate(weekAgo);
    const end = formatDate(now);

    // Per-user daily usage — small page
    try {
      const data = await cursorPost(`${ADMIN_BASE}/teams/daily-usage-data`, apiKey, {
        startDate: weekAgo.getTime(),
        endDate: now.getTime(),
        page: 1,
        pageSize: 5,
      });
      for (const row of (data.data ?? []) as CursorDailyUsageRow[]) {
        rows.push(row as unknown as RawSampleRow);
      }
    } catch { /* admin API may not be available */ }

    // Agent edits
    try {
      const data = await cursorGet(
        `${ANALYTICS_BASE}/agent-edits?startDate=${start}&endDate=${end}`,
        apiKey
      );
      for (const day of (data.data ?? []).slice(0, 3) as CursorAgentEditsDay[]) {
        const flat: RawSampleRow = {};
        for (const [k, v] of Object.entries(day)) {
          flat[`agent_edits.${k}`] = v;
        }
        rows.push(flat);
      }
    } catch { /* endpoint may not be available */ }

    // Spend — first page
    try {
      const data = await cursorPost(`${ADMIN_BASE}/teams/spend`, apiKey, {
        page: 1,
        pageSize: 5,
        sortBy: "amount",
        sortDirection: "desc",
      });
      for (const member of (data.teamMemberSpend ?? []).slice(0, 3) as CursorSpendMember[]) {
        const flat: RawSampleRow = {};
        for (const [k, v] of Object.entries(member)) {
          flat[`spend.${k}`] = v;
        }
        rows.push(flat);
      }
    } catch { /* spend may not be available */ }

    // DAU
    try {
      const data = await cursorGet(
        `${ANALYTICS_BASE}/dau?startDate=${start}&endDate=${end}`,
        apiKey
      );
      for (const entry of (data.data ?? []).slice(0, 3) as Array<{ date: string; dau: number }>) {
        rows.push({ "dau.date": entry.date, "dau.dau": entry.dau });
      }
    } catch { /* DAU may not be available */ }

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
    const cursorDau: CursorDauRecord[] = [];
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
            _raw: {
              "agent_edits.total_lines_suggested": day.total_lines_suggested,
              "agent_edits.total_lines_accepted": day.total_lines_accepted,
              "agent_edits.total_suggested_diffs": day.total_suggested_diffs,
              "agent_edits.total_accepted_diffs": day.total_accepted_diffs,
              "agent_edits.total_rejected_diffs": day.total_rejected_diffs,
            },
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
              metadata: {
                unique_users: stats.users,
                _raw: { model: modelName },
              },
            });
          }
        }
      }
    } catch {
      // Model usage endpoint may not be available
    }

    // --- Analytics API: DAU ---
    try {
      const dauData = await cursorGet(
        `${ANALYTICS_BASE}/dau?startDate=${start}&endDate=${end}`,
        apiKey
      );
      for (const entry of (dauData.data ?? []) as Array<{ date: string; dau: number }>) {
        cursorDau.push({ date: new Date(entry.date), dauCount: entry.dau });
      }
    } catch {
      // DAU endpoint may not be available
    }

    // --- Admin API: per-user daily usage + spend ---
    try {
      const [dailyRows, spendMap] = await Promise.all([
        fetchDailyUsage(apiKey, startDate, endDate),
        fetchSpend(apiKey),
      ]);

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
        const spend = spendMap.get(row.email);
        const tabRequests = row.totalTabsShown;

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
              tab_requests: tabRequests,
              cmdk_usages: row.cmdkUsages,
              tabs_shown: row.totalTabsShown,
              tabs_accepted: row.totalTabsAccepted,
              fast_premium_requests: spend?.fastPremiumRequests ?? 0,
              most_used_model: row.mostUsedModel,
              client_version: row.clientVersion,
              _raw: {
                email: row.email,
                mostUsedModel: row.mostUsedModel,
                subscriptionIncludedReqs: row.subscriptionIncludedReqs,
                composerRequests: row.composerRequests,
                chatRequests: row.chatRequests,
                agentRequests: row.agentRequests,
                totalLinesAdded: row.totalLinesAdded,
                totalLinesDeleted: row.totalLinesDeleted,
                acceptedLinesAdded: row.acceptedLinesAdded,
                acceptedLinesDeleted: row.acceptedLinesDeleted,
                totalTabsShown: row.totalTabsShown,
                totalTabsAccepted: row.totalTabsAccepted,
                cmdkUsages: row.cmdkUsages,
                clientVersion: row.clientVersion,
                "spend.fastPremiumRequests": spend?.fastPremiumRequests ?? 0,
                "spend.monthlyLimitDollars": spend?.monthlyLimitDollars ?? null,
              },
            },
          });
        }

        if (row.usageBasedReqs > 0) {
          const userTotalOverage = userOverageTotal.get(row.email) ?? 1;
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
              tab_requests: tabRequests,
              fast_premium_requests: spend?.fastPremiumRequests ?? 0,
              spend_limit_dollars: spend?.monthlyLimitDollars ?? null,
              hard_limit_dollars: spend?.hardLimitOverrideDollars ?? null,
              overage_total_cents: spend?.spendCents ?? 0,
              _raw: {
                email: row.email,
                mostUsedModel: row.mostUsedModel,
                usageBasedReqs: row.usageBasedReqs,
                composerRequests: row.composerRequests,
                chatRequests: row.chatRequests,
                agentRequests: row.agentRequests,
                totalLinesAdded: row.totalLinesAdded,
                totalLinesDeleted: row.totalLinesDeleted,
                acceptedLinesAdded: row.acceptedLinesAdded,
                acceptedLinesDeleted: row.acceptedLinesDeleted,
                totalTabsShown: row.totalTabsShown,
                totalTabsAccepted: row.totalTabsAccepted,
                cmdkUsages: row.cmdkUsages,
                clientVersion: row.clientVersion,
                "spend.spendCents": spend?.spendCents ?? 0,
                "spend.fastPremiumRequests": spend?.fastPremiumRequests ?? 0,
                "spend.monthlyLimitDollars": spend?.monthlyLimitDollars ?? null,
              },
            },
          });
        }
      }
    } catch {
      // Admin API may not be available (non-enterprise teams)
    }

    return { records, cursorDau };
  },
};
