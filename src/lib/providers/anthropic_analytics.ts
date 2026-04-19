import { Provider } from "@/generated/prisma/client";
import {
  ProviderAdapter,
  ProviderFetchResult,
  ProviderSampleResult,
  NormalizedUsageRecord,
  RawSampleRow,
} from "./types";

// Claude Enterprise Analytics API (separate from the Admin Usage/Cost API).
// Docs: https://support.claude.com/en/articles/13703965
// Base URL is fixed by Anthropic. Auth is x-api-key with `read:analytics` scope.
const API_BASE = "https://api.anthropic.com/v1/organizations/analytics";

// Anthropic only finalizes the daily aggregate ~3 days after the day closes.
// We pad an extra day for safety so we don't accidentally hit 400s on the edge.
const AVAILABILITY_LAG_DAYS = 4;

// --- API response types ---

interface ToolAction {
  accepted: number;
  rejected: number;
}

interface OfficeProductMetrics {
  distinct_session_count: number;
  message_count: number;
  skills_used_count: number;
  distinct_skills_used_count: number;
  connectors_used_count: number;
  distinct_connectors_used_count: number;
}

interface CoworkMetrics {
  distinct_session_count: number;
  message_count: number;
  action_count: number;
  dispatch_turn_count: number;
  skills_used_count: number;
  distinct_skills_used_count: number;
  connectors_used_count: number;
  distinct_connectors_used_count: number;
}

interface AnalyticsUserRecord {
  user: {
    id: string;
    email_address: string;
  };
  chat_metrics: {
    distinct_conversation_count: number;
    message_count: number;
    distinct_projects_created_count: number;
    distinct_projects_used_count: number;
    distinct_files_uploaded_count: number;
    distinct_artifacts_created_count: number;
    thinking_message_count: number;
    distinct_skills_used_count: number;
    connectors_used_count: number;
  };
  claude_code_metrics: {
    core_metrics: {
      commit_count: number;
      pull_request_count: number;
      lines_of_code: { added_count: number; removed_count: number };
      distinct_session_count: number;
    };
    tool_actions: {
      edit_tool?: ToolAction;
      multi_edit_tool?: ToolAction;
      write_tool?: ToolAction;
      notebook_edit_tool?: ToolAction;
    };
  };
  office_metrics: {
    excel: OfficeProductMetrics;
    powerpoint: OfficeProductMetrics;
  };
  cowork_metrics: CoworkMetrics;
  web_search_count: number;
}

interface PaginatedResponse<T> {
  data?: T[];
  // The /summaries endpoint returns the list directly without pagination.
  // We coerce both shapes through the same wrapper.
  next_page?: string | null;
}

interface AnalyticsSummaryRecord {
  starting_date: string;
  ending_date: string;
  daily_active_user_count: number;
  weekly_active_user_count: number;
  monthly_active_user_count: number;
  assigned_seat_count: number;
  pending_invite_count: number;
  cowork_daily_active_user_count: number;
  cowork_weekly_active_user_count: number;
  cowork_monthly_active_user_count: number;
}

// --- Helpers ---

async function analyticsFetch(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      "User-Agent": "Agent-Plutus/1.0.0",
    },
  });
  if (!res.ok) {
    throw new Error(
      `Anthropic Analytics API error: ${res.status} ${await res.text()}`
    );
  }
  return res.json();
}

function formatDateUTC(d: Date): string {
  return d.toISOString().split("T")[0];
}

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function mostRecentAvailableDate(): Date {
  const d = startOfUtcDay(new Date());
  d.setUTCDate(d.getUTCDate() - AVAILABILITY_LAG_DAYS);
  return d;
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

function sumToolActions(actions: AnalyticsUserRecord["claude_code_metrics"]["tool_actions"]) {
  let accepted = 0;
  let rejected = 0;
  for (const a of Object.values(actions)) {
    if (!a) continue;
    accepted += a.accepted ?? 0;
    rejected += a.rejected ?? 0;
  }
  return { accepted, rejected, total: accepted + rejected };
}

function recordHasSignal(values: number[]): boolean {
  return values.some((v) => (v ?? 0) > 0);
}

// --- Per-day fetcher ---

async function fetchUsersForDate(
  apiKey: string,
  date: string
): Promise<AnalyticsUserRecord[]> {
  const all: AnalyticsUserRecord[] = [];
  let page: string | null = null;

  do {
    let url = `${API_BASE}/users?date=${date}&limit=1000`;
    if (page) url += `&page=${encodeURIComponent(page)}`;
    const data: PaginatedResponse<AnalyticsUserRecord> = await analyticsFetch(
      url,
      apiKey
    );
    if (data.data) all.push(...data.data);
    page = data.next_page ?? null;
  } while (page);

  return all;
}

// --- Record materializer ---

function recordsFromUser(
  user: AnalyticsUserRecord,
  date: Date
): NormalizedUsageRecord[] {
  const out: NormalizedUsageRecord[] = [];
  const userRef = user.user.email_address;

  const tool = sumToolActions(user.claude_code_metrics.tool_actions);
  const code = user.claude_code_metrics.core_metrics;
  const chat = user.chat_metrics;
  const excel = user.office_metrics.excel;
  const ppt = user.office_metrics.powerpoint;
  const cw = user.cowork_metrics;

  const baseRaw = {
    "user.id": user.user.id,
    "user.email_address": user.user.email_address,
    web_search_count: user.web_search_count,
  };

  // Claude.ai chat
  if (
    recordHasSignal([
      chat.message_count,
      chat.distinct_conversation_count,
      chat.distinct_skills_used_count,
      chat.connectors_used_count,
    ])
  ) {
    out.push({
      provider: Provider.anthropic_analytics,
      userRef,
      model: "claude-chat",
      date,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      requestsCount: chat.message_count,
      costUsd: 0,
      metadata: {
        source: "analytics_api",
        surface: "chat",
        ...chat,
        web_search_count: user.web_search_count,
        _raw: {
          ...baseRaw,
          ...flattenObj(chat as unknown as Record<string, unknown>, "chat_metrics"),
        },
      },
    });
  }

  // Claude Code
  if (
    recordHasSignal([
      code.distinct_session_count,
      code.commit_count,
      code.pull_request_count,
      code.lines_of_code.added_count,
      tool.total,
    ])
  ) {
    out.push({
      provider: Provider.anthropic_analytics,
      userRef,
      model: "claude-code",
      date,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      requestsCount: code.distinct_session_count,
      costUsd: 0,
      linesAccepted: tool.accepted,
      linesSuggested: tool.total,
      acceptRate: tool.total > 0 ? tool.accepted / tool.total : undefined,
      metadata: {
        source: "analytics_api",
        surface: "claude_code",
        commits: code.commit_count,
        pull_requests: code.pull_request_count,
        lines_added: code.lines_of_code.added_count,
        lines_removed: code.lines_of_code.removed_count,
        sessions: code.distinct_session_count,
        tool_actions: user.claude_code_metrics.tool_actions,
        _raw: {
          ...baseRaw,
          "claude_code_metrics.core_metrics.commit_count": code.commit_count,
          "claude_code_metrics.core_metrics.pull_request_count": code.pull_request_count,
          "claude_code_metrics.core_metrics.lines_of_code.added_count":
            code.lines_of_code.added_count,
          "claude_code_metrics.core_metrics.lines_of_code.removed_count":
            code.lines_of_code.removed_count,
          "claude_code_metrics.core_metrics.distinct_session_count":
            code.distinct_session_count,
          "claude_code_metrics.tool_actions.total_accepted": tool.accepted,
          "claude_code_metrics.tool_actions.total_rejected": tool.rejected,
          "claude_code_metrics.tool_actions.total_actions": tool.total,
        },
      },
    });
  }

  // Office Agent — Excel
  if (
    recordHasSignal([
      excel.distinct_session_count,
      excel.message_count,
      excel.skills_used_count,
      excel.connectors_used_count,
    ])
  ) {
    out.push({
      provider: Provider.anthropic_analytics,
      userRef,
      model: "office-excel",
      date,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      requestsCount: excel.message_count,
      costUsd: 0,
      metadata: {
        source: "analytics_api",
        surface: "office_excel",
        ...excel,
        _raw: {
          ...baseRaw,
          ...flattenObj(
            excel as unknown as Record<string, unknown>,
            "office_metrics.excel"
          ),
        },
      },
    });
  }

  // Office Agent — PowerPoint
  if (
    recordHasSignal([
      ppt.distinct_session_count,
      ppt.message_count,
      ppt.skills_used_count,
      ppt.connectors_used_count,
    ])
  ) {
    out.push({
      provider: Provider.anthropic_analytics,
      userRef,
      model: "office-powerpoint",
      date,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      requestsCount: ppt.message_count,
      costUsd: 0,
      metadata: {
        source: "analytics_api",
        surface: "office_powerpoint",
        ...ppt,
        _raw: {
          ...baseRaw,
          ...flattenObj(
            ppt as unknown as Record<string, unknown>,
            "office_metrics.powerpoint"
          ),
        },
      },
    });
  }

  // Cowork
  if (
    recordHasSignal([
      cw.distinct_session_count,
      cw.message_count,
      cw.action_count,
      cw.dispatch_turn_count,
    ])
  ) {
    out.push({
      provider: Provider.anthropic_analytics,
      userRef,
      model: "claude-cowork",
      date,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      requestsCount: cw.message_count,
      costUsd: 0,
      metadata: {
        source: "analytics_api",
        surface: "cowork",
        ...cw,
        _raw: {
          ...baseRaw,
          ...flattenObj(
            cw as unknown as Record<string, unknown>,
            "cowork_metrics"
          ),
        },
      },
    });
  }

  return out;
}

// --- Adapter ---

export const anthropicAnalyticsAdapter: ProviderAdapter = {
  provider: Provider.anthropic_analytics,

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const date = formatDateUTC(mostRecentAvailableDate());
      // The summaries endpoint is the cheapest probe — single record per call.
      const url = `${API_BASE}/summaries?starting_date=${date}`;
      await analyticsFetch(url, apiKey);
      return true;
    } catch {
      return false;
    }
  },

  async fetchSample(apiKey: string): Promise<ProviderSampleResult> {
    const rows: RawSampleRow[] = [];
    const SAMPLE_TARGET_ROWS = 25;

    // Walk back day-by-day until we find a day with users (org may have had
    // gaps) — capped at 7 days so we don't blow the rate limit on empty orgs.
    const probe = mostRecentAvailableDate();
    for (let i = 0; i < 7 && rows.length < SAMPLE_TARGET_ROWS; i++) {
      const dateStr = formatDateUTC(probe);
      try {
        const url = `${API_BASE}/users?date=${dateStr}&limit=20`;
        const data: PaginatedResponse<AnalyticsUserRecord> =
          await analyticsFetch(url, apiKey);
        for (const user of data.data ?? []) {
          rows.push(
            flattenObj({ date: dateStr, ...(user as unknown as Record<string, unknown>) })
          );
          if (rows.length >= SAMPLE_TARGET_ROWS) break;
        }
      } catch {
        // Day might not be available yet — keep walking back.
      }
      probe.setUTCDate(probe.getUTCDate() - 1);
    }

    // Also pull a recent summary — useful for showing the org-level fields
    // (active user counts, seats) in the field-mapping picker.
    try {
      const date = formatDateUTC(mostRecentAvailableDate());
      const url = `${API_BASE}/summaries?starting_date=${date}`;
      const data = await analyticsFetch(url, apiKey);
      const list: AnalyticsSummaryRecord[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];
      for (const s of list) {
        rows.push(flattenObj(s as unknown as Record<string, unknown>, "summary"));
      }
    } catch {
      // Summary is supplementary.
    }

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
    const records: NormalizedUsageRecord[] = [];

    // The endpoint refuses dates within the 3-day availability lag.
    const cap = mostRecentAvailableDate();
    const start = startOfUtcDay(startDate);
    let end = startOfUtcDay(endDate);
    if (end > cap) end = cap;

    if (start > end) {
      return { records };
    }

    const cursor = new Date(start);
    while (cursor <= end) {
      const dateStr = formatDateUTC(cursor);
      try {
        const users = await fetchUsersForDate(apiKey, dateStr);
        const dayDate = new Date(cursor);
        for (const user of users) {
          records.push(...recordsFromUser(user, dayDate));
        }
      } catch (err) {
        // Continue past per-day failures (e.g. transient 503) so a single bad
        // day doesn't poison the entire backfill window.
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes(" 400 ") && !message.includes(" 503 ")) {
          throw err;
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return { records };
  },
};
