import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET() {
  const orgId = await getOrgId();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const departments = await prisma.department.findMany({
    where: { orgId: orgId },
    include: {
      teams: { select: { id: true, name: true, monthlyBudget: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });

  const spendByDept = await prisma.$queryRaw<
    Array<{ department_id: string; total_cost: number; total_tokens: number; total_requests: number }>
  >`
    SELECT u.department_id,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens,
           COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId}
      AND ur.date >= ${monthStart}
      AND u.department_id IS NOT NULL
    GROUP BY u.department_id
  `;

  const spendMap = new Map(spendByDept.map((s) => [s.department_id, s]));

  const result = departments.map((d) => {
    const spend = spendMap.get(d.id);
    const budget = d.monthlyBudget ? Number(d.monthlyBudget) : null;
    const spent = spend?.total_cost ?? 0;
    const pct = budget && budget > 0 ? (spent / budget) * 100 : null;

    return {
      id: d.id,
      name: d.name,
      monthlyBudget: budget,
      alertThreshold: d.alertThreshold,
      teamCount: d.teams.length,
      userCount: d._count.users,
      currentSpend: spent,
      totalTokens: Number(spend?.total_tokens ?? 0),
      totalRequests: Number(spend?.total_requests ?? 0),
      budgetUsedPct: pct ? Math.round(pct * 10) / 10 : null,
      status: pct === null ? "no_budget" : pct >= 100 ? "over_budget" : pct >= d.alertThreshold ? "warning" : "healthy",
    };
  });

  return NextResponse.json({ departments: result });
}
