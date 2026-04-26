import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const url = new URL(request.url);
  const ruleId = url.searchParams.get("ruleId") ?? undefined;
  const channelId = url.searchParams.get("channelId") ?? undefined;
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;

  const deliveries = await prisma.alertDelivery.findMany({
    where: {
      orgId,
      ...(ruleId ? { ruleId } : {}),
      ...(channelId ? { channelId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ deliveries });
}
