import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "csv";
  const departments = searchParams.getAll("department");
  const teams = searchParams.getAll("team");
  const providers = searchParams.getAll("provider");

  const customStart = searchParams.get("startDate");
  const customEnd = searchParams.get("endDate");
  const days = parseInt(searchParams.get("days") ?? "30", 10);

  let startDate: Date;
  let endDate: Date | null = null;

  if (customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
    endDate.setHours(23, 59, 59, 999);
  } else {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  const conditions: string[] = [
    `ur.org_id = '${orgId}'`,
    `ur.date >= '${startDate.toISOString()}'`,
  ];

  if (endDate) {
    conditions.push(`ur.date <= '${endDate.toISOString()}'`);
  }

  if (departments.length > 0) {
    const escaped = departments.map((d) => `'${d.replace(/'/g, "''")}'`).join(",");
    conditions.push(`u.department_id IN (${escaped})`);
  }

  if (teams.length > 0) {
    const escaped = teams.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
    conditions.push(`u.team_id IN (${escaped})`);
  }

  if (providers.length > 0) {
    const escaped = providers.map((p) => `'${p.replace(/'/g, "''")}'`).join(",");
    conditions.push(`ur.provider::text IN (${escaped})`);
  }

  const whereClause = conditions.join(" AND ");

  const query = `
    SELECT ur.date::text, u.name AS user_name, u.email,
           COALESCE(u.department, '') AS department, COALESCE(u.team, '') AS team,
           ur.provider, COALESCE(ur.model, '') AS model,
           ur.input_tokens, ur.output_tokens, ur.requests_count, ur.cost_usd::float
    FROM usage_records ur
    LEFT JOIN org_users u ON ur.user_id = u.id
    WHERE ${whereClause}
    ORDER BY ur.date DESC, cost_usd DESC
  `;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      date: string; user_name: string; email: string; department: string;
      team: string; provider: string; model: string; input_tokens: number;
      output_tokens: number; requests_count: number; cost_usd: number;
    }>
  >(query);

  if (format === "json") {
    return NextResponse.json({ rows });
  }

  const headers = ["Date", "User", "Email", "Department", "Team", "Provider", "Model", "Input Tokens", "Output Tokens", "Requests", "Cost (USD)"];
  const csvLines = [headers.join(",")];

  for (const r of rows) {
    csvLines.push([
      r.date, `"${r.user_name}"`, r.email, `"${r.department}"`, `"${r.team}"`,
      r.provider, `"${r.model}"`, r.input_tokens, r.output_tokens,
      r.requests_count, Number(r.cost_usd).toFixed(6),
    ].join(","));
  }

  return new NextResponse(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="agent-plutus-usage-${customStart && customEnd ? `${customStart}_${customEnd}` : `${days}d`}.csv"`,
    },
  });
}
