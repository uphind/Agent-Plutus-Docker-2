import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

const settingsSchema = z.object({
  sync_interval_hours: z.number().int().min(1).max(24).optional(),
  dir_sync_interval_hours: z.number().int().min(0).max(24).optional(),
  relink_interval_hours: z.number().int().min(0).max(168).optional(),
});

export async function GET() {
  const orgId = await getOrgId();

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      name: true,
      syncIntervalHours: true,
      dirSyncIntervalHours: true,
      relinkIntervalHours: true,
      lastRelinkAt: true,
      onboardingCompletedAt: true,
      _count: { select: { users: true, providerCredentials: true } },
    },
  });

  const lastSync = await prisma.syncLog.findFirst({
    where: { orgId },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, status: true },
  });

  const graphConfig = await prisma.graphConfig.findUnique({
    where: { orgId },
    select: { lastSyncAt: true },
  });

  const orphanedCount = await prisma.usageRecord.count({
    where: { orgId, userId: null, userRef: { not: null } },
  });

  return NextResponse.json({
    organization: org.name,
    syncIntervalHours: org.syncIntervalHours,
    dirSyncIntervalHours: org.dirSyncIntervalHours,
    relinkIntervalHours: org.relinkIntervalHours,
    lastRelinkAt: org.lastRelinkAt?.toISOString() ?? null,
    onboardingCompletedAt: org.onboardingCompletedAt?.toISOString() ?? null,
    userCount: org._count.users,
    providerCount: org._count.providerCredentials,
    orphanedRecordCount: orphanedCount,
    lastSync: lastSync
      ? { at: lastSync.startedAt.toISOString(), status: lastSync.status }
      : null,
    lastDirectorySync: graphConfig?.lastSyncAt?.toISOString() ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const orgId = await getOrgId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.sync_interval_hours !== undefined) {
    data.syncIntervalHours = parsed.data.sync_interval_hours;
  }
  if (parsed.data.dir_sync_interval_hours !== undefined) {
    data.dirSyncIntervalHours = parsed.data.dir_sync_interval_hours;
  }
  if (parsed.data.relink_interval_hours !== undefined) {
    data.relinkIntervalHours = parsed.data.relink_interval_hours;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data,
  });

  const { restartSyncScheduler } = await import("@/lib/sync/scheduler");
  await restartSyncScheduler();

  return NextResponse.json({
    success: true,
    syncIntervalHours: updated.syncIntervalHours,
    dirSyncIntervalHours: updated.dirSyncIntervalHours,
    relinkIntervalHours: updated.relinkIntervalHours,
  });
}
