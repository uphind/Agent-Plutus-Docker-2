import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { relinkOrphanedRecords } from "@/lib/sync/sync-engine";

export async function POST() {
  const orgId = await getOrgId();

  try {
    const result = await relinkOrphanedRecords(orgId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Re-link failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const orgId = await getOrgId();

  const orphanedCount = await prisma.usageRecord.count({
    where: { orgId, userId: null, userRef: { not: null } },
  });

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { lastRelinkAt: true, relinkIntervalHours: true },
  });

  return NextResponse.json({
    orphanedCount,
    lastRelinkAt: org.lastRelinkAt?.toISOString() ?? null,
    relinkIntervalHours: org.relinkIntervalHours,
  });
}
