import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { humanizeJobKind } from "@/lib/sync-job";

/**
 * Returns sync jobs that the bell-icon UI should surface:
 *   1. Anything currently `running`.
 *   2. Anything `completed` or `failed` in the last 60 seconds — so the bell
 *      can briefly flash a success/failure entry before falling back to the
 *      regular notification feed.
 *
 * The endpoint is intentionally cheap: indexed lookup on
 * (org_id, status, started_at) + a tiny payload, safe to poll every few
 * seconds while a sync is in flight.
 */
export async function GET() {
  try {
    const orgId = await getOrgId();
    const recentCutoff = new Date(Date.now() - 60_000);

    const jobs = await prisma.syncJob.findMany({
      where: {
        orgId,
        OR: [
          { status: "running" },
          { finishedAt: { gte: recentCutoff } },
        ],
      },
      orderBy: { startedAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        kind: j.kind,
        label: humanizeJobKind(j.kind),
        status: j.status,
        progress: j.progress,
        processed: j.processed,
        total: j.total,
        message: j.message,
        error: j.error,
        startedAt: j.startedAt.toISOString(),
        finishedAt: j.finishedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load sync jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
