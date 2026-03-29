import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const granularity = searchParams.get("granularity") ?? "daily";
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const providerRaw = searchParams.get("provider");
  const ALLOWED_PROVIDERS = ["openai", "anthropic", "gemini", "cursor", "vertex"];
  const provider = providerRaw && ALLOWED_PROVIDERS.includes(providerRaw) ? providerRaw : null;

  const validDays = isFinite(days) && days > 0 ? days : 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - validDays);

  const providerFilter = provider ? `AND ur.provider = $3` : "";
  const queryParams: unknown[] = provider ? [orgId, startDate, provider] : [orgId, startDate];

  // Date truncation based on granularity
  let dateTrunc: string;
  switch (granularity) {
    case "weekly":
      dateTrunc = "date_trunc('week', ur.date)";
      break;
    case "monthly":
      dateTrunc = "date_trunc('month', ur.date)";
      break;
    case "yearly":
      dateTrunc = "date_trunc('year', ur.date)";
      break;
    default:
      dateTrunc = "ur.date";
  }

  // Time-series by model
  const timeSeries = await prisma.$queryRawUnsafe<
    Array<{
      period: string;
      model: string;
      provider: string;
      total_cost: number;
      total_tokens: number;
      input_tokens: number;
      output_tokens: number;
      total_requests: number;
    }>
  >(
    `SELECT ${dateTrunc}::text AS period,
            COALESCE(ur.model, 'unknown') AS model,
            ur.provider,
            COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
            COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens,
            COALESCE(SUM(ur.input_tokens), 0)::bigint AS input_tokens,
            COALESCE(SUM(ur.output_tokens), 0)::bigint AS output_tokens,
            COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests
     FROM usage_records ur
     WHERE ur.org_id = $1
       AND ur.date >= $2
       ${providerFilter}
     GROUP BY period, ur.model, ur.provider
     ORDER BY period ASC, total_cost DESC`,
    ...queryParams
  );

  // Model totals for the period (for summary cards and rankings)
  const modelTotals = await prisma.$queryRawUnsafe<
    Array<{
      model: string;
      provider: string;
      total_cost: number;
      total_tokens: number;
      total_requests: number;
      first_seen: string;
      last_seen: string;
      active_days: number;
    }>
  >(
    `SELECT COALESCE(ur.model, 'unknown') AS model,
            ur.provider,
            COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
            COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens,
            COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests,
            MIN(ur.date)::text AS first_seen,
            MAX(ur.date)::text AS last_seen,
            COUNT(DISTINCT ur.date)::int AS active_days
     FROM usage_records ur
     WHERE ur.org_id = $1
       AND ur.date >= $2
       ${providerFilter}
     GROUP BY ur.model, ur.provider
     ORDER BY total_cost DESC`,
    ...queryParams
  );

  // Model share over time (for stacked area / percentage view)
  const periodTotals = await prisma.$queryRawUnsafe<
    Array<{ period: string; total_cost: number; total_requests: number }>
  >(
    `SELECT ${dateTrunc}::text AS period,
            COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
            COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests
     FROM usage_records ur
     WHERE ur.org_id = $1
       AND ur.date >= $2
       ${providerFilter}
     GROUP BY period
     ORDER BY period ASC`,
    ...queryParams
  );

  // Cost efficiency trends (avg cost per request by model over time)
  const efficiencyTrends = await prisma.$queryRawUnsafe<
    Array<{
      period: string;
      model: string;
      provider: string;
      avg_cost_per_request: number;
      avg_tokens_per_request: number;
    }>
  >(
    `SELECT ${dateTrunc}::text AS period,
            COALESCE(ur.model, 'unknown') AS model,
            ur.provider,
            CASE WHEN SUM(ur.requests_count) > 0
                 THEN (SUM(ur.cost_usd) / SUM(ur.requests_count))::float
                 ELSE 0 END AS avg_cost_per_request,
            CASE WHEN SUM(ur.requests_count) > 0
                 THEN (SUM(ur.input_tokens + ur.output_tokens)::float / SUM(ur.requests_count))
                 ELSE 0 END AS avg_tokens_per_request
     FROM usage_records ur
     WHERE ur.org_id = $1
       AND ur.date >= $2
       ${providerFilter}
     GROUP BY period, ur.model, ur.provider
     ORDER BY period ASC`,
    ...queryParams
  );

  return NextResponse.json({
    granularity,
    days,
    timeSeries: timeSeries.map((r) => ({
      ...r,
      total_tokens: Number(r.total_tokens),
      input_tokens: Number(r.input_tokens),
      output_tokens: Number(r.output_tokens),
      total_requests: Number(r.total_requests),
    })),
    modelTotals: modelTotals.map((m) => ({
      ...m,
      total_tokens: Number(m.total_tokens),
      total_requests: Number(m.total_requests),
    })),
    periodTotals: periodTotals.map((p) => ({
      ...p,
      total_requests: Number(p.total_requests),
    })),
    efficiencyTrends,
  });
}
