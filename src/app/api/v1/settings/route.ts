import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

const settingsSchema = z.object({
  sync_interval_hours: z.number().int().min(1).max(24),
});

export async function GET() {
  const orgId = await getOrgId();

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      name: true,
      syncIntervalHours: true,
      _count: { select: { users: true, providerCredentials: true } },
    },
  });

  const lastSync = await prisma.syncLog.findFirst({
    where: { orgId },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, status: true },
  });

  return NextResponse.json({
    organization: org.name,
    syncIntervalHours: org.syncIntervalHours,
    userCount: org._count.users,
    providerCount: org._count.providerCredentials,
    lastSync: lastSync
      ? { at: lastSync.startedAt.toISOString(), status: lastSync.status }
      : null,
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

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: { syncIntervalHours: parsed.data.sync_interval_hours },
  });

  const { restartSyncScheduler } = await import("@/lib/sync/scheduler");
  await restartSyncScheduler();

  return NextResponse.json({
    success: true,
    syncIntervalHours: updated.syncIntervalHours,
  });
}
