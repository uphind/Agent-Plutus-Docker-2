import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const where: Record<string, unknown> = { orgId: orgId };
  if (departmentId) where.departmentId = departmentId;

  const teams = await prisma.team.findMany({
    where,
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });

  const spendByTeam = await prisma.$queryRaw<
    Array<{ team_id: string; total_cost: number; total_tokens: number; total_requests: number }>
  >`
    SELECT u.team_id,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens,
           COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId}
      AND ur.date >= ${monthStart}
      AND u.team_id IS NOT NULL
    GROUP BY u.team_id
  `;
  const spendMap = new Map(spendByTeam.map((s) => [s.team_id, s]));

  const result = teams.map((t) => {
    const spend = spendMap.get(t.id);
    const budget = t.monthlyBudget ? Number(t.monthlyBudget) : null;
    const spent = spend?.total_cost ?? 0;
    const pct = budget && budget > 0 ? (spent / budget) * 100 : null;

    return {
      id: t.id,
      name: t.name,
      department: t.department,
      monthlyBudget: budget,
      alertThreshold: t.alertThreshold,
      userCount: t._count.users,
      currentSpend: spent,
      totalTokens: Number(spend?.total_tokens ?? 0),
      totalRequests: Number(spend?.total_requests ?? 0),
      budgetUsedPct: pct ? Math.round(pct * 10) / 10 : null,
      status: pct === null ? "no_budget" : pct >= 100 ? "over_budget" : pct >= t.alertThreshold ? "warning" : "healthy",
    };
  });

  return NextResponse.json({ teams: result });
}
