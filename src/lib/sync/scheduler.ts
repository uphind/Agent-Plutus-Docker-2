import cron, { type ScheduledTask } from "node-cron";
import { prisma } from "@/lib/db";
import { syncAllProviders, syncDirectory, relinkOrphanedRecords } from "./sync-engine";

let scheduledTask: ScheduledTask | null = null;

function isDue(lastRun: Date | null, intervalHours: number): boolean {
  if (intervalHours <= 0) return false;
  if (!lastRun) return true;
  const hoursSince = (Date.now() - lastRun.getTime()) / 3_600_000;
  return hoursSince >= intervalHours;
}

async function tick() {
  console.log("[Scheduler] Running tick...");
  try {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        syncIntervalHours: true,
        dirSyncIntervalHours: true,
        relinkIntervalHours: true,
        lastRelinkAt: true,
      },
    });

    for (const org of orgs) {
      // Provider usage sync — check oldest credential's lastSyncAt
      if (org.syncIntervalHours > 0) {
        const credentials = await prisma.providerCredential.findMany({
          where: { orgId: org.id, isActive: true },
          select: { lastSyncAt: true },
        });
        const oldestSync = credentials.length > 0
          ? credentials.reduce<Date | null>(
              (oldest, c) => {
                if (!c.lastSyncAt) return null;
                if (!oldest) return c.lastSyncAt;
                return c.lastSyncAt < oldest ? c.lastSyncAt : oldest;
              },
              credentials[0].lastSyncAt,
            )
          : null;
        if (credentials.length > 0 && isDue(oldestSync, org.syncIntervalHours)) {
          console.log(`[Scheduler] Provider sync due for org: ${org.name}`);
          try {
            await syncAllProviders(org.id);
          } catch (err) {
            console.error(`[Scheduler] Provider sync error (${org.name}):`, err);
          }
        }
      }

      // Directory sync
      if (org.dirSyncIntervalHours > 0) {
        const graphConfig = await prisma.graphConfig.findUnique({
          where: { orgId: org.id },
          select: { lastSyncAt: true },
        });
        if (graphConfig && isDue(graphConfig.lastSyncAt, org.dirSyncIntervalHours)) {
          console.log(`[Scheduler] Directory sync due for org: ${org.name}`);
          try {
            await syncDirectory(org.id);
          } catch (err) {
            console.error(`[Scheduler] Directory sync error (${org.name}):`, err);
          }
        }
      }

      // Re-link orphaned records
      if (org.relinkIntervalHours > 0 && isDue(org.lastRelinkAt, org.relinkIntervalHours)) {
        console.log(`[Scheduler] Relink due for org: ${org.name}`);
        try {
          await relinkOrphanedRecords(org.id);
        } catch (err) {
          console.error(`[Scheduler] Relink error (${org.name}):`, err);
        }
      }
    }
  } catch (error) {
    console.error("[Scheduler] Fatal error:", error);
  }
}

export async function startSyncScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
  }
  scheduledTask = cron.schedule("0 * * * *", tick);
  console.log("[Scheduler] Started (hourly tick)");
}

export async function restartSyncScheduler() {
  await startSyncScheduler();
}

export function stopSyncScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
