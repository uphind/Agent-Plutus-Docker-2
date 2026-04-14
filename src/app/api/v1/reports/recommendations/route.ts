import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { processPreAggregated } from "@/lib/classifier";
import { generateExcelReport } from "@/lib/classifier/excel-report";

export async function GET() {
  const orgId = await getOrgId();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const raw = await prisma.$queryRaw<
    Array<{
      user_email: string; user_name: string; department: string; team: string;
      provider: string; model: string;
      total_requests: number; total_input: number; total_output: number;
      total_cached: number; total_cost: number; active_days: number;
    }>
  >`
    SELECT u.email AS user_email, u.name AS user_name,
           COALESCE(u.department, '') AS department, COALESCE(u.team, '') AS team,
           ur.provider::text AS provider, COALESCE(ur.model, 'unknown') AS model,
           SUM(ur.requests_count)::int AS total_requests,
           SUM(ur.input_tokens)::float AS total_input,
           SUM(ur.output_tokens)::float AS total_output,
           SUM(ur.cached_tokens)::float AS total_cached,
           SUM(ur.cost_usd)::float AS total_cost,
           COUNT(DISTINCT ur.date)::int AS active_days
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND ur.date >= ${thirtyDaysAgo} AND ur.model IS NOT NULL
    GROUP BY u.email, u.name, u.department, u.team, ur.provider, ur.model
    HAVING SUM(ur.cost_usd)::float > 1
  `;

  if (raw.length === 0) {
    return NextResponse.json(
      { error: "No usage data available for the last 30 days" },
      { status: 404 }
    );
  }

  const classifierInput = raw.map((r) => ({
    user_email: r.user_email,
    user_name: r.user_name,
    department: r.department,
    team: r.team,
    provider: r.provider,
    model: r.model,
    input_tokens: r.total_input,
    output_tokens: r.total_output,
    cached_tokens: r.total_cached,
    cost_usd: r.total_cost,
    requests_count: r.total_requests,
    date: undefined,
  }));

  const { rows, summary } = processPreAggregated(
    classifierInput as unknown as Array<Record<string, unknown>>
  );

  const buffer = await generateExcelReport(rows, summary);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cost-optimization-report-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
