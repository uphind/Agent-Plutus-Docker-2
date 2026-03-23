import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = await getOrgId();
  const { id } = await params;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const team = await prisma.team.findUnique({
    where: { id },
    include: { department: { select: { id: true, name: true } } },
  });

  if (!team || team.orgId !== orgId) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const users = await prisma.$queryRaw<
    Array<{ user_id: string; name: string; email: string; job_title: string | null; total_cost: number; total_tokens: number; total_requests: number }>
  >`
    SELECT u.id AS user_id, u.name, u.email, u.job_title,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens,
           COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${monthStart}
    WHERE u.org_id = ${orgId} AND u.team_id = ${id} AND u.status = 'active'
    GROUP BY u.id, u.name, u.email, u.job_title
    ORDER BY total_cost DESC
  `;

  const dailySpend = await prisma.$queryRaw<
    Array<{ date: string; total_cost: number }>
  >`
    SELECT ur.date::text, COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND u.team_id = ${id} AND ur.date >= ${monthStart}
    GROUP BY ur.date ORDER BY ur.date
  `;

  const byProvider = await prisma.$queryRaw<
    Array<{ provider: string; total_cost: number; total_tokens: number }>
  >`
    SELECT ur.provider, COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND u.team_id = ${id} AND ur.date >= ${monthStart}
    GROUP BY ur.provider ORDER BY total_cost DESC
  `;

  const budget = team.monthlyBudget ? Number(team.monthlyBudget) : null;
  const totalSpent = users.reduce((s, u) => s + u.total_cost, 0);
  const pct = budget && budget > 0 ? (totalSpent / budget) * 100 : null;

  return NextResponse.json({
    team: {
      id: team.id,
      name: team.name,
      department: team.department,
      monthlyBudget: budget,
      alertThreshold: team.alertThreshold,
      currentSpend: totalSpent,
      budgetUsedPct: pct ? Math.round(pct * 10) / 10 : null,
      status: pct === null ? "no_budget" : pct >= 100 ? "over_budget" : pct >= team.alertThreshold ? "warning" : "healthy",
    },
    users: users.map((u) => ({
      ...u,
      total_tokens: Number(u.total_tokens),
      total_requests: Number(u.total_requests),
      pctOfBudget: budget && budget > 0 ? Math.round((u.total_cost / budget) * 1000) / 10 : null,
    })),
    dailySpend,
    byProvider: byProvider.map((p) => ({ ...p, total_tokens: Number(p.total_tokens) })),
  });
}
