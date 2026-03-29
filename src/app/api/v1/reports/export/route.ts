import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const rows = await prisma.$queryRaw<
    Array<{
      date: string; user_name: string; email: string; department: string;
      team: string; provider: string; model: string; input_tokens: number;
      output_tokens: number; requests_count: number; cost_usd: number;
    }>
  >`
    SELECT ur.date::text, u.name AS user_name, u.email,
           COALESCE(u.department, '') AS department, COALESCE(u.team, '') AS team,
           ur.provider, COALESCE(ur.model, '') AS model,
           ur.input_tokens, ur.output_tokens, ur.requests_count, ur.cost_usd::float
    FROM usage_records ur
    LEFT JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND ur.date >= ${startDate}
    ORDER BY ur.date DESC, cost_usd DESC
  `;

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
      "Content-Disposition": `attachment; filename="agent-plutus-usage-${days}d.csv"`,
    },
  });
}
