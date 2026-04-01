import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "month parameter required (YYYY-MM format)" },
      { status: 400 }
    );
  }

  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1);
  const endDate = new Date(year, mon, 0, 23, 59, 59, 999);

  const lineItems = await prisma.$queryRawUnsafe<
    Array<{
      department_id: string;
      department: string;
      cost_center: string;
      gl_code: string;
      provider: string;
      model: string;
      total_cost: number;
      total_tokens: number;
      total_requests: number;
      user_count: number;
    }>
  >(
    `SELECT
       d.id AS department_id,
       d.name AS department,
       COALESCE(d.cost_center, '') AS cost_center,
       COALESCE(d.gl_code, '') AS gl_code,
       ur.provider::text AS provider,
       COALESCE(ur.model, 'unknown') AS model,
       SUM(ur.cost_usd)::float AS total_cost,
       SUM(ur.input_tokens + ur.output_tokens)::bigint AS total_tokens,
       SUM(ur.requests_count)::bigint AS total_requests,
       COUNT(DISTINCT ur.user_id)::int AS user_count
     FROM usage_records ur
     JOIN org_users u ON ur.user_id = u.id
     JOIN departments d ON u.department_id = d.id
     WHERE ur.org_id = '${orgId}'
       AND ur.date >= '${startDate.toISOString()}'
       AND ur.date <= '${endDate.toISOString()}'
     GROUP BY d.id, d.name, d.cost_center, d.gl_code, ur.provider, ur.model
     ORDER BY d.name, total_cost DESC`
  );

  const unassigned = await prisma.$queryRawUnsafe<
    Array<{ total_cost: number; total_tokens: number; total_requests: number; user_count: number; provider: string; model: string }>
  >(
    `SELECT
       ur.provider::text AS provider,
       COALESCE(ur.model, 'unknown') AS model,
       SUM(ur.cost_usd)::float AS total_cost,
       SUM(ur.input_tokens + ur.output_tokens)::bigint AS total_tokens,
       SUM(ur.requests_count)::bigint AS total_requests,
       COUNT(DISTINCT ur.user_id)::int AS user_count
     FROM usage_records ur
     JOIN org_users u ON ur.user_id = u.id
     WHERE ur.org_id = '${orgId}'
       AND ur.date >= '${startDate.toISOString()}'
       AND ur.date <= '${endDate.toISOString()}'
       AND u.department_id IS NULL
     GROUP BY ur.provider, ur.model
     ORDER BY total_cost DESC`
  );

  const byCostCenter = new Map<string, {
    costCenter: string;
    glCode: string;
    department: string;
    departmentId: string;
    totalCost: number;
    items: typeof lineItems;
  }>();

  for (const item of lineItems) {
    const key = item.cost_center || item.department_id;
    const existing = byCostCenter.get(key);
    if (existing) {
      existing.totalCost += item.total_cost;
      existing.items.push(item);
    } else {
      byCostCenter.set(key, {
        costCenter: item.cost_center,
        glCode: item.gl_code,
        department: item.department,
        departmentId: item.department_id,
        totalCost: item.total_cost,
        items: [item],
      });
    }
  }

  const totalCost = lineItems.reduce((s, i) => s + i.total_cost, 0)
    + unassigned.reduce((s, i) => s + i.total_cost, 0);

  const departments = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; cost_center: string; gl_code: string; user_count: number }>
  >(
    `SELECT d.id, d.name,
            COALESCE(d.cost_center, '') AS cost_center,
            COALESCE(d.gl_code, '') AS gl_code,
            COUNT(u.id)::int AS user_count
     FROM departments d
     LEFT JOIN org_users u ON u.department_id = d.id AND u.status = 'active'
     WHERE d.org_id = '${orgId}'
     GROUP BY d.id, d.name, d.cost_center, d.gl_code
     ORDER BY d.name`
  );

  return NextResponse.json({
    month,
    totalCost,
    lineItems: lineItems.map((li) => ({
      departmentId: li.department_id,
      department: li.department,
      costCenter: li.cost_center,
      glCode: li.gl_code,
      provider: li.provider,
      model: li.model,
      totalCost: li.total_cost,
      totalTokens: Number(li.total_tokens),
      totalRequests: Number(li.total_requests),
      userCount: li.user_count,
    })),
    unassigned: unassigned.map((u) => ({
      provider: u.provider,
      model: u.model,
      totalCost: u.total_cost,
      totalTokens: Number(u.total_tokens),
      totalRequests: Number(u.total_requests),
      userCount: u.user_count,
    })),
    byCostCenter: Array.from(byCostCenter.values()).map((cc) => ({
      costCenter: cc.costCenter,
      glCode: cc.glCode,
      department: cc.department,
      totalCost: cc.totalCost,
      lineItems: cc.items.map((i) => ({
        provider: i.provider,
        model: i.model,
        totalCost: i.total_cost,
        totalTokens: Number(i.total_tokens),
        totalRequests: Number(i.total_requests),
        userCount: i.user_count,
      })),
    })),
    departments,
  });
}
