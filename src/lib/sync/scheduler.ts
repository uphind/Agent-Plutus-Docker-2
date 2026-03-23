import cron, { type ScheduledTask } from "node-cron";
import { prisma } from "@/lib/db";
import { syncAllProviders } from "./sync-engine";

let scheduledTask: ScheduledTask | null = null;
let currentIntervalHours: number | null = null;

function hoursToCron(hours: number): string {
  if (hours >= 24) return "0 0 * * *";
  return `0 */${hours} * * *`;
}

async function runSync() {
  console.log("[Sync Scheduler] Starting scheduled sync...");
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });

    for (const org of orgs) {
      console.log(`[Sync Scheduler] Syncing org: ${org.name}`);
      try {
        const results = await syncAllProviders(org.id);
        console.log(`[Sync Scheduler] Org ${org.name} sync results:`, results);
      } catch (error) {
        console.error(`[Sync Scheduler] Error syncing org ${org.name}:`, error);
      }
    }
  } catch (error) {
    console.error("[Sync Scheduler] Fatal error:", error);
  }
}

export async function startSyncScheduler() {
  const org = await prisma.organization.findFirst({
    select: { syncIntervalHours: true },
  });

  const intervalHours = org?.syncIntervalHours ?? 6;
  scheduleWithInterval(intervalHours);
}

function scheduleWithInterval(hours: number) {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  currentIntervalHours = hours;
  const cronExpr = hoursToCron(hours);
  scheduledTask = cron.schedule(cronExpr, runSync);
  console.log(`[Sync Scheduler] Scheduled sync every ${hours} hour(s) (cron: ${cronExpr})`);
}

export async function restartSyncScheduler() {
  const org = await prisma.organization.findFirst({
    select: { syncIntervalHours: true },
  });

  const intervalHours = org?.syncIntervalHours ?? 6;

  if (intervalHours === currentIntervalHours && scheduledTask) {
    return;
  }

  scheduleWithInterval(intervalHours);
}

export function stopSyncScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    currentIntervalHours = null;
  }
}
