import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = await getOrgId();
  const { id } = await params;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      teams: {
        include: { _count: { select: { users: true } } },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!department || department.orgId !== orgId) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  // Spend by team this month
  const teamSpend = await prisma.$queryRaw<
    Array<{ team_id: string; total_cost: number; total_tokens: number; total_requests: number }>
  >`
    SELECT u.team_id,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens,
           COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId}
      AND u.department_id = ${id}
      AND ur.date >= ${monthStart}
      AND u.team_id IS NOT NULL
    GROUP BY u.team_id
  `;
  const teamSpendMap = new Map(teamSpend.map((s) => [s.team_id, s]));

  // Users in department
  const users = await prisma.$queryRaw<
    Array<{ user_id: string; name: string; email: string; team: string | null; team_id: string | null; total_cost: number; total_tokens: number }>
  >`
    SELECT u.id AS user_id, u.name, u.email, u.team, u.team_id,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${monthStart}
    WHERE u.org_id = ${orgId} AND u.department_id = ${id} AND u.status = 'active'
    GROUP BY u.id, u.name, u.email, u.team, u.team_id
    ORDER BY total_cost DESC
  `;

  // Daily spend for chart
  const dailySpend = await prisma.$queryRaw<
    Array<{ date: string; total_cost: number }>
  >`
    SELECT ur.date::text, COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND u.department_id = ${id} AND ur.date >= ${monthStart}
    GROUP BY ur.date ORDER BY ur.date
  `;

  const budget = department.monthlyBudget ? Number(department.monthlyBudget) : null;
  const totalSpent = users.reduce((s, u) => s + u.total_cost, 0);
  const pct = budget && budget > 0 ? (totalSpent / budget) * 100 : null;

  const teams = department.teams.map((t) => {
    const ts = teamSpendMap.get(t.id);
    const tb = t.monthlyBudget ? Number(t.monthlyBudget) : null;
    const tSpent = ts?.total_cost ?? 0;
    const tPct = tb && tb > 0 ? (tSpent / tb) * 100 : null;
    return {
      id: t.id,
      name: t.name,
      monthlyBudget: tb,
      alertThreshold: t.alertThreshold,
      userCount: t._count.users,
      currentSpend: tSpent,
      totalTokens: Number(ts?.total_tokens ?? 0),
      totalRequests: Number(ts?.total_requests ?? 0),
      budgetUsedPct: tPct ? Math.round(tPct * 10) / 10 : null,
      status: tPct === null ? "no_budget" : tPct >= 100 ? "over_budget" : tPct >= t.alertThreshold ? "warning" : "healthy",
    };
  });

  return NextResponse.json({
    department: {
      id: department.id,
      name: department.name,
      monthlyBudget: budget,
      alertThreshold: department.alertThreshold,
      currentSpend: totalSpent,
      budgetUsedPct: pct ? Math.round(pct * 10) / 10 : null,
      status: pct === null ? "no_budget" : pct >= 100 ? "over_budget" : pct >= department.alertThreshold ? "warning" : "healthy",
    },
    teams,
    users: users.map((u) => ({ ...u, total_tokens: Number(u.total_tokens) })),
    dailySpend,
  });
}
