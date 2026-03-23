import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const department = searchParams.get("department");
  const team = searchParams.get("team");
  const userId = searchParams.get("userId");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  if (userId) {
    // Single user detail
    const user = await prisma.orgUser.findFirst({
      where: { id: userId, orgId: orgId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const usage = await prisma.usageRecord.groupBy({
      by: ["provider", "model"],
      where: { orgId: orgId, userId, date: { gte: startDate } },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cachedTokens: true,
        requestsCount: true,
        costUsd: true,
      },
    });

    const dailyUsage = await prisma.$queryRaw<
      Array<{ date: string; provider: string; total_cost: number; total_tokens: number }>
    >(
      Prisma.sql`
        SELECT
          date::text,
          provider::text,
          SUM(cost_usd)::float as total_cost,
          SUM(input_tokens + output_tokens)::int as total_tokens
        FROM usage_records
        WHERE org_id = ${orgId} AND user_id = ${userId} AND date >= ${startDate}
        GROUP BY date, provider
        ORDER BY date
      `
    );

    return NextResponse.json({ user, usage, dailyUsage });
  }

  // All users aggregate
  const conditions: string[] = [`ur.org_id = '${orgId}'`, `ur.date >= '${startDate.toISOString()}'`];
  if (department) conditions.push(`u.department = '${department}'`);
  if (team) conditions.push(`u.team = '${team}'`);

  const userBreakdown = await prisma.$queryRaw<
    Array<{
      user_id: string;
      name: string;
      email: string;
      department: string | null;
      team: string | null;
      total_cost: number;
      total_tokens: number;
      total_requests: number;
    }>
  >(
    Prisma.sql`
      SELECT
        u.id as user_id,
        u.name,
        u.email,
        u.department,
        u.team,
        COALESCE(SUM(ur.cost_usd), 0)::float as total_cost,
        COALESCE(SUM(ur.input_tokens + ur.output_tokens), 0)::int as total_tokens,
        COALESCE(SUM(ur.requests_count), 0)::int as total_requests
      FROM org_users u
      LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${startDate}
      WHERE u.org_id = ${orgId} AND u.status = 'active'
      GROUP BY u.id, u.name, u.email, u.department, u.team
      ORDER BY total_cost DESC
    `
  );

  return NextResponse.json({ users: userBreakdown });
}
