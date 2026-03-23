import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const provider = searchParams.get("provider");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const where: Record<string, unknown> = {
    orgId: orgId,
    date: { gte: startDate },
  };
  if (provider) where.provider = provider;

  const modelBreakdown = await prisma.usageRecord.groupBy({
    by: ["model", "provider"],
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
      requestsCount: true,
      costUsd: true,
    },
    _count: true,
    orderBy: { _sum: { costUsd: "desc" } },
  });

  return NextResponse.json({
    models: modelBreakdown.map((m) => ({
      model: m.model ?? "unknown",
      provider: m.provider,
      totalCost: Number(m._sum.costUsd ?? 0),
      totalTokens: (m._sum.inputTokens ?? 0) + (m._sum.outputTokens ?? 0),
      inputTokens: m._sum.inputTokens ?? 0,
      outputTokens: m._sum.outputTokens ?? 0,
      cachedTokens: m._sum.cachedTokens ?? 0,
      requestsCount: m._sum.requestsCount ?? 0,
      recordCount: m._count,
    })),
  });
}
