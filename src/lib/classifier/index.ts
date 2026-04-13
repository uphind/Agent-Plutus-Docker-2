import type { RawUsageRow, RecommendedRow, ClassifySummary } from "./types";
import { aggregateByUserModel } from "./aggregator";
import { classifyAll } from "./classifier";
import { recommendAll } from "./recommender";

export type { RawUsageRow, RecommendedRow, ClassifySummary } from "./types";
export type { AggregatedUserModel, ClassifiedRow, CategoryName } from "./types";
export { getModelTier, getModelPricing, getVendor, PRICING_TABLE, MODEL_TIERS } from "./pricing";
export { classify, classifyAll } from "./classifier";
export { recommendDual, recommendAll } from "./recommender";
export { aggregateByUserModel } from "./aggregator";

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "");
}

function normalizeRow(raw: Record<string, unknown>): RawUsageRow {
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    norm[normalizeKey(k)] = v;
  }

  return {
    user_email: String(norm.user_email ?? norm.email ?? ""),
    input_tokens: Number(norm.input_tokens ?? 0),
    output_tokens: Number(norm.output_tokens ?? 0),
    user_name: norm.user_name != null ? String(norm.user_name) : undefined,
    date: norm.date != null ? String(norm.date) : undefined,
    model: norm.model != null ? String(norm.model) : undefined,
    provider: norm.provider != null ? String(norm.provider) : undefined,
    department: norm.department != null ? String(norm.department) : undefined,
    team: norm.team != null ? String(norm.team) : undefined,
    requests_count: norm.requests_count != null ? Number(norm.requests_count) : undefined,
    cached_tokens: norm.cached_tokens != null ? Number(norm.cached_tokens) : undefined,
    cost_usd: norm.cost_usd != null ? Number(norm.cost_usd) : undefined,
    web_search_requests: norm.web_search_requests != null ? Number(norm.web_search_requests) : undefined,
    tool_turns: norm.tool_turns != null ? Number(norm.tool_turns) : undefined,
    lines_accepted: norm.lines_accepted != null ? Number(norm.lines_accepted) : undefined,
    lines_suggested: norm.lines_suggested != null ? Number(norm.lines_suggested) : undefined,
  };
}

function unwrapArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["data", "rows", "records", "results"]) {
      const val = (data as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val;
    }
  }
  throw new Error("Input must be a JSON array or an object with a data/rows/records/results array");
}

export function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const val = values[j] ?? "";
      const num = Number(val);
      row[headers[j]] = val !== "" && !isNaN(num) ? num : val;
    }
    rows.push(row);
  }
  return rows;
}

export function processUsageData(rawInput: unknown): {
  rows: RecommendedRow[];
  summary: ClassifySummary;
} {
  const rawArray = unwrapArray(rawInput);
  const normalized = rawArray.map((r) => normalizeRow(r as Record<string, unknown>));
  const aggregated = aggregateByUserModel(normalized);
  const classified = classifyAll(aggregated);
  const recommended = recommendAll(classified);

  const totalCost = recommended.reduce((s, r) => s + r.total_cost_usd, 0);
  const estSavingsGlobal = recommended.reduce(
    (s, r) => s + (r.is_cheaper_global ? (r.est_savings_global_usd ?? 0) : 0),
    0
  );
  const estSavingsSameVendor = recommended.reduce(
    (s, r) => s + (r.is_cheaper_same_vendor ? (r.est_savings_same_vendor_usd ?? 0) : 0),
    0
  );

  const vendorsDetected = [...new Set(recommended.map((r) => r.provider).filter(Boolean))];
  const modelsDetected = [...new Set(recommended.map((r) => r.model).filter(Boolean))];

  const categoryCounts: Record<string, number> = {};
  for (const r of recommended) {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
  }

  return {
    rows: recommended,
    summary: {
      totalRows: recommended.length,
      totalCost: Math.round(totalCost * 100) / 100,
      estSavingsGlobal: Math.round(estSavingsGlobal * 100) / 100,
      estSavingsSameVendor: Math.round(estSavingsSameVendor * 100) / 100,
      forecastCostGlobal: Math.round((totalCost - estSavingsGlobal) * 100) / 100,
      savingPctGlobal: totalCost > 0 ? Math.round((estSavingsGlobal / totalCost) * 10000) / 100 : 0,
      vendorsDetected,
      modelsDetected,
      categoryCounts,
    },
  };
}

/**
 * Process pre-aggregated rows (already one row per user×model).
 * Skips the aggregation step — useful when data comes from a DB query
 * that has already rolled up by user and model.
 */
export function processPreAggregated(
  rows: Array<Record<string, unknown>>
): { rows: RecommendedRow[]; summary: ClassifySummary } {
  const normalized = rows.map((r) => normalizeRow(r));
  const aggregated = aggregateByUserModel(normalized);
  const classified = classifyAll(aggregated);
  const recommended = recommendAll(classified);

  const totalCost = recommended.reduce((s, r) => s + r.total_cost_usd, 0);
  const estSavingsGlobal = recommended.reduce(
    (s, r) => s + (r.is_cheaper_global ? (r.est_savings_global_usd ?? 0) : 0),
    0
  );
  const estSavingsSameVendor = recommended.reduce(
    (s, r) => s + (r.is_cheaper_same_vendor ? (r.est_savings_same_vendor_usd ?? 0) : 0),
    0
  );

  const vendorsDetected = [...new Set(recommended.map((r) => r.provider).filter(Boolean))];
  const modelsDetected = [...new Set(recommended.map((r) => r.model).filter(Boolean))];

  const categoryCounts: Record<string, number> = {};
  for (const r of recommended) {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
  }

  return {
    rows: recommended,
    summary: {
      totalRows: recommended.length,
      totalCost: Math.round(totalCost * 100) / 100,
      estSavingsGlobal: Math.round(estSavingsGlobal * 100) / 100,
      estSavingsSameVendor: Math.round(estSavingsSameVendor * 100) / 100,
      forecastCostGlobal: Math.round((totalCost - estSavingsGlobal) * 100) / 100,
      savingPctGlobal: totalCost > 0 ? Math.round((estSavingsGlobal / totalCost) * 10000) / 100 : 0,
      vendorsDetected,
      modelsDetected,
      categoryCounts,
    },
  };
}
