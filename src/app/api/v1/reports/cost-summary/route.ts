import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Current month by department
  const currentByDept = await prisma.$queryRaw<
    Array<{ department_id: string; department: string; total_cost: number; total_tokens: number; total_requests: number }>
  >`
    SELECT u.department_id, COALESCE(u.department, 'Unassigned') AS department,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens,
           COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests
    FROM usage_records ur JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND ur.date >= ${monthStart}
    GROUP BY u.department_id, u.department ORDER BY total_cost DESC
  `;

  // Previous month by department
  const prevByDept = await prisma.$queryRaw<
    Array<{ department_id: string; total_cost: number }>
  >`
    SELECT u.department_id, COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM usage_records ur JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND ur.date >= ${prevMonthStart} AND ur.date < ${monthStart}
    GROUP BY u.department_id
  `;
  const prevMap = new Map(prevByDept.map((p) => [p.department_id, p.total_cost]));

  // Budgets
  const departments = await prisma.department.findMany({
    where: { orgId: orgId },
    select: { id: true, name: true, monthlyBudget: true },
  });
  const budgetMap = new Map(departments.map((d) => [d.id, d.monthlyBudget ? Number(d.monthlyBudget) : null]));

  // By provider
  const byProvider = await prisma.$queryRaw<
    Array<{ provider: string; total_cost: number; total_tokens: number; total_requests: number }>
  >`
    SELECT ur.provider, COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::bigint AS total_tokens,
           COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests
    FROM usage_records ur
    WHERE ur.org_id = ${orgId} AND ur.date >= ${monthStart}
    GROUP BY ur.provider ORDER BY total_cost DESC
  `;

  const prevByProvider = await prisma.$queryRaw<
    Array<{ provider: string; total_cost: number }>
  >`
    SELECT ur.provider, COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM usage_records ur
    WHERE ur.org_id = ${orgId} AND ur.date >= ${prevMonthStart} AND ur.date < ${monthStart}
    GROUP BY ur.provider
  `;
  const prevProvMap = new Map(prevByProvider.map((p) => [p.provider, p.total_cost]));

  // Cost forecasting
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const totalCurrentSpend = currentByDept.reduce((s, d) => s + d.total_cost, 0);
  const dailyRate = dayOfMonth > 0 ? totalCurrentSpend / dayOfMonth : 0;
  const projectedMonthEnd = dailyRate * daysInMonth;

  return NextResponse.json({
    period: { month: now.getMonth() + 1, year: now.getFullYear(), dayOfMonth, daysInMonth },
    byDepartment: currentByDept.map((d) => ({
      departmentId: d.department_id,
      department: d.department,
      currentSpend: d.total_cost,
      previousSpend: prevMap.get(d.department_id) ?? 0,
      change: prevMap.get(d.department_id)
        ? ((d.total_cost - (prevMap.get(d.department_id) ?? 0)) / (prevMap.get(d.department_id) ?? 1)) * 100
        : null,
      budget: d.department_id ? budgetMap.get(d.department_id) ?? null : null,
      totalTokens: Number(d.total_tokens),
      totalRequests: Number(d.total_requests),
    })),
    byProvider: byProvider.map((p) => ({
      provider: p.provider,
      currentSpend: p.total_cost,
      previousSpend: prevProvMap.get(p.provider) ?? 0,
      change: prevProvMap.get(p.provider)
        ? ((p.total_cost - (prevProvMap.get(p.provider) ?? 0)) / (prevProvMap.get(p.provider) ?? 1)) * 100
        : null,
      totalTokens: Number(p.total_tokens),
      totalRequests: Number(p.total_requests),
      costPerRequest: Number(p.total_requests) > 0 ? p.total_cost / Number(p.total_requests) : 0,
    })),
    forecast: {
      currentSpend: totalCurrentSpend,
      dailyRate,
      projectedMonthEnd,
      daysRemaining: daysInMonth - dayOfMonth,
    },
  });
}
