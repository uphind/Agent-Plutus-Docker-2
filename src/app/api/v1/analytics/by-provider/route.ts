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

  const providerBreakdown = await prisma.usageRecord.groupBy({
    by: ["provider"],
    where: { orgId: orgId, date: { gte: startDate } },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
      requestsCount: true,
      costUsd: true,
    },
    _count: true,
  });

  const dailyByProvider = await prisma.$queryRaw<
    Array<{ date: string; provider: string; total_cost: number; total_tokens: number }>
  >(
    Prisma.sql`
      SELECT
        date::text,
        provider::text,
        SUM(cost_usd)::float as total_cost,
        SUM(input_tokens + output_tokens)::int as total_tokens
      FROM usage_records
      WHERE org_id = ${orgId} AND date >= ${startDate}
      GROUP BY date, provider
      ORDER BY date
    `
  );

  const credentials = await prisma.providerCredential.findMany({
    where: { orgId: orgId },
    select: {
      provider: true,
      isActive: true,
      lastSyncAt: true,
      label: true,
    },
  });

  return NextResponse.json({
    providers: providerBreakdown.map((p) => ({
      provider: p.provider,
      totalCost: Number(p._sum.costUsd ?? 0),
      totalTokens: (p._sum.inputTokens ?? 0) + (p._sum.outputTokens ?? 0),
      inputTokens: p._sum.inputTokens ?? 0,
      outputTokens: p._sum.outputTokens ?? 0,
      cachedTokens: p._sum.cachedTokens ?? 0,
      requestsCount: p._sum.requestsCount ?? 0,
      recordCount: p._count,
    })),
    dailyByProvider,
    credentials,
  });
}
