import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const where = { orgId: orgId, date: { gte: startDate } };

  // Total spend and tokens
  const totals = await prisma.usageRecord.aggregate({
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
      requestsCount: true,
      costUsd: true,
    },
  });

  // Spend by provider
  const byProvider = await prisma.usageRecord.groupBy({
    by: ["provider"],
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      costUsd: true,
      requestsCount: true,
    },
  });

  // Daily spend trend
  const dailySpend = await prisma.$queryRaw<
    Array<{ date: string; total_cost: number; total_tokens: number }>
  >(
    Prisma.sql`
      SELECT
        date::text,
        SUM(cost_usd)::float as total_cost,
        SUM(input_tokens + output_tokens)::int as total_tokens
      FROM usage_records
      WHERE org_id = ${orgId} AND date >= ${startDate}
      GROUP BY date
      ORDER BY date
    `
  );

  // Top users by spend
  const topUsers = await prisma.$queryRaw<
    Array<{ user_id: string; name: string; email: string; total_cost: number; total_tokens: number }>
  >(
    Prisma.sql`
      SELECT
        u.id as user_id,
        u.name,
        u.email,
        SUM(ur.cost_usd)::float as total_cost,
        SUM(ur.input_tokens + ur.output_tokens)::int as total_tokens
      FROM usage_records ur
      JOIN org_users u ON ur.user_id = u.id
      WHERE ur.org_id = ${orgId} AND ur.date >= ${startDate}
      GROUP BY u.id, u.name, u.email
      ORDER BY total_cost DESC
      LIMIT 10
    `
  );

  // Active users count
  const activeUsers = await prisma.orgUser.count({
    where: { orgId: orgId, status: "active" },
  });

  // Active providers
  const activeProviders = await prisma.providerCredential.count({
    where: { orgId: orgId, isActive: true },
  });

  return NextResponse.json({
    period: { days, startDate: startDate.toISOString() },
    totals: {
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      cachedTokens: totals._sum.cachedTokens ?? 0,
      totalTokens: (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0),
      requestsCount: totals._sum.requestsCount ?? 0,
      costUsd: Number(totals._sum.costUsd ?? 0),
    },
    byProvider,
    dailySpend,
    topUsers,
    activeUsers,
    activeProviders,
  });
}
