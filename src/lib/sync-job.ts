import { prisma } from "@/lib/db";
import { NotificationType } from "@/generated/prisma/client";

/**
 * Live sync-job tracker.
 *
 * Long-running operations (directory pull, provider usage backfill, …) write
 * progress here so the bell-icon UI can poll for "syncing… 47%" without us
 * needing to introduce websockets or SSE in a self-hosted Docker deployment.
 *
 * Lifecycle: create → updateProgress* → completeJob | failJob.
 *
 * `kind` is intentionally a free-form string ("directory", "provider:openai",
 * "provider:cursor", …) so adding a new sync type doesn't require a migration.
 */
export type SyncJobKind = "directory" | `provider:${string}`;

const HUMAN_LABELS: Record<string, string> = {
  directory: "Directory sync",
  "provider:openai": "OpenAI usage sync",
  "provider:anthropic": "Anthropic usage sync",
  "provider:anthropic_compliance": "Anthropic compliance sync",
  "provider:anthropic_analytics": "Anthropic analytics sync",
  "provider:gemini": "Gemini usage sync",
  "provider:cursor": "Cursor usage sync",
  "provider:vertex": "Vertex AI usage sync",
  "provider:microsoft_copilot": "Microsoft Copilot sync",
  "provider:lovable": "Lovable usage sync",
  "provider:n8n": "n8n usage sync",
};

export function humanizeJobKind(kind: string): string {
  if (HUMAN_LABELS[kind]) return HUMAN_LABELS[kind];
  if (kind.startsWith("provider:")) return `${kind.slice("provider:".length)} sync`;
  return kind;
}

export async function createSyncJob(
  orgId: string,
  kind: SyncJobKind,
  message?: string
) {
  return prisma.syncJob.create({
    data: {
      orgId,
      kind,
      status: "running",
      progress: 0,
      message: message ?? `${humanizeJobKind(kind)} starting…`,
    },
  });
}

/**
 * Cap progress writes to roughly one row update per 1% change so we don't
 * spam the database when iterating tens of thousands of users. Callers
 * pass the absolute counters; we compute the percentage and short-circuit
 * if it hasn't moved meaningfully since the last write.
 */
const lastProgressCache = new Map<string, number>();

export async function updateSyncProgress(
  jobId: string,
  processed: number,
  total: number,
  message?: string
) {
  const pct = total > 0 ? Math.min(99, Math.floor((processed / total) * 100)) : 0;
  const last = lastProgressCache.get(jobId);
  if (last !== undefined && pct === last && !message) return;
  lastProgressCache.set(jobId, pct);

  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      progress: pct,
      processed,
      total,
      ...(message ? { message } : {}),
    },
  });
}

export async function completeSyncJob(
  jobId: string,
  options: {
    orgId: string;
    kind: string;
    summary: string;
    /** When true, we also drop a notification in the bell. Default true. */
    notify?: boolean;
  }
) {
  lastProgressCache.delete(jobId);
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      progress: 100,
      message: options.summary,
      finishedAt: new Date(),
    },
  });

  if (options.notify !== false) {
    await prisma.notification.create({
      data: {
        orgId: options.orgId,
        type: NotificationType.suggestion,
        severity: "info",
        title: `${humanizeJobKind(options.kind)} completed`,
        message: options.summary,
        entityType: "sync_job",
        entityId: jobId,
      },
    });
  }
}

export async function failSyncJob(
  jobId: string,
  options: {
    orgId: string;
    kind: string;
    error: string;
    notify?: boolean;
  }
) {
  lastProgressCache.delete(jobId);
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      error: options.error,
      message: `Failed: ${options.error.slice(0, 200)}`,
      finishedAt: new Date(),
    },
  });

  if (options.notify !== false) {
    await prisma.notification.create({
      data: {
        orgId: options.orgId,
        type: NotificationType.sync_failure,
        severity: "warning",
        title: `${humanizeJobKind(options.kind)} failed`,
        message: options.error.slice(0, 500),
        entityType: "sync_job",
        entityId: jobId,
      },
    });
  }
}
