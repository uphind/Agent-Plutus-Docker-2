import type { RawUsageRow, AggregatedUserModel } from "./types";
import { getModelTier } from "./pricing";

interface AccumulatorBucket {
  user_email: string;
  user_name: string;
  department: string;
  team: string;
  provider: string;
  model: string;
  total_requests: number;
  total_input: number;
  total_output: number;
  total_cached: number;
  total_cost: number;
  dates: Set<string>;
  web_search_requests: number;
  tool_turns: number;
  row_count: number;
}

export function aggregateByUserModel(rows: RawUsageRow[]): AggregatedUserModel[] {
  const buckets = new Map<string, AccumulatorBucket>();

  for (const row of rows) {
    const email = row.user_email ?? "";
    const model = row.model ?? "unknown";
    const key = `${email}||${model}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        user_email: email,
        user_name: row.user_name ?? email,
        department: row.department ?? "",
        team: row.team ?? "",
        provider: row.provider ?? "",
        model,
        total_requests: 0,
        total_input: 0,
        total_output: 0,
        total_cached: 0,
        total_cost: 0,
        dates: new Set(),
        web_search_requests: 0,
        tool_turns: 0,
        row_count: 0,
      };
      buckets.set(key, bucket);
    }

    const reqCount = row.requests_count ?? 1;
    bucket.total_requests += reqCount;
    bucket.total_input += row.input_tokens ?? 0;
    bucket.total_output += row.output_tokens ?? 0;
    bucket.total_cached += row.cached_tokens ?? 0;
    bucket.total_cost += row.cost_usd ?? 0;
    bucket.web_search_requests += row.web_search_requests ?? 0;
    bucket.tool_turns += row.tool_turns ?? 0;
    bucket.row_count += 1;

    if (row.user_name && !bucket.user_name) bucket.user_name = row.user_name;
    if (row.department && !bucket.department) bucket.department = row.department;
    if (row.team && !bucket.team) bucket.team = row.team;
    if (row.provider && !bucket.provider) bucket.provider = row.provider;

    if (row.date) {
      bucket.dates.add(row.date.slice(0, 10));
    }
  }

  const results: AggregatedUserModel[] = [];
  for (const b of buckets.values()) {
    const activeDays = b.dates.size > 0 ? b.dates.size : Math.max(1, b.row_count);
    const totalRequests = Math.max(1, b.total_requests);
    const totalInput = b.total_input;
    const totalOutput = b.total_output;
    const ratio = totalInput > 0 ? totalOutput / totalInput : 1.0;
    const avgInput = totalInput / totalRequests;
    const avgOutput = totalOutput / totalRequests;
    const requestsPerDay = totalRequests / Math.max(1, activeDays);
    const cacheRate = totalInput > 0 ? b.total_cached / totalInput : 0;

    results.push({
      user_email: b.user_email,
      user_name: b.user_name,
      department: b.department,
      team: b.team,
      provider: b.provider,
      model: b.model,
      total_requests: b.total_requests,
      total_input: totalInput,
      total_output: totalOutput,
      total_cached: b.total_cached,
      total_cost_usd: b.total_cost,
      active_days: activeDays,
      requests_per_day: Math.round(requestsPerDay * 10000) / 10000,
      avg_input: Math.round(avgInput * 100) / 100,
      avg_output: Math.round(avgOutput * 100) / 100,
      ratio: Math.round(ratio * 10000) / 10000,
      model_tier: getModelTier(b.model),
      cache_rate: Math.round(cacheRate * 10000) / 10000,
      web_search_requests: b.web_search_requests,
      tool_turns: b.tool_turns,
    });
  }

  return results;
}
