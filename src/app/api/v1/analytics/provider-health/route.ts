import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET() {
  const orgId = await getOrgId();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const syncHealth = await prisma.$queryRawUnsafe<
    Array<{
      provider: string;
      total_syncs: number;
      successful_syncs: number;
      failed_syncs: number;
      avg_duration_ms: number;
      last_sync: string | null;
      last_status: string;
    }>
  >(
    `SELECT
       provider::text,
       COUNT(*)::int AS total_syncs,
       COUNT(*) FILTER (WHERE status = 'success')::int AS successful_syncs,
       COUNT(*) FILTER (WHERE status = 'error')::int AS failed_syncs,
       COALESCE(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000) FILTER (WHERE finished_at IS NOT NULL), 0)::float AS avg_duration_ms,
       MAX(started_at)::text AS last_sync,
       (ARRAY_AGG(status ORDER BY started_at DESC))[1] AS last_status
     FROM sync_logs
     WHERE org_id = '${orgId}' AND started_at >= '${thirtyDaysAgo.toISOString()}'
     GROUP BY provider
     ORDER BY provider`
  );

  const providers = syncHealth.map((s) => {
    const successRate = s.total_syncs > 0 ? s.successful_syncs / s.total_syncs : 0;
    let healthScore: number;
    let healthStatus: string;

    if (successRate >= 0.99) {
      healthScore = 100;
      healthStatus = "excellent";
    } else if (successRate >= 0.95) {
      healthScore = 85;
      healthStatus = "good";
    } else if (successRate >= 0.9) {
      healthScore = 70;
      healthStatus = "fair";
    } else if (successRate >= 0.8) {
      healthScore = 50;
      healthStatus = "degraded";
    } else {
      healthScore = 25;
      healthStatus = "poor";
    }

    return {
      provider: s.provider,
      totalSyncs: s.total_syncs,
      successfulSyncs: s.successful_syncs,
      failedSyncs: s.failed_syncs,
      successRate,
      avgDurationMs: Math.round(s.avg_duration_ms),
      lastSync: s.last_sync,
      lastStatus: s.last_status,
      healthScore,
      healthStatus,
    };
  });

  const recentFailures = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      provider: string;
      status: string;
      message: string | null;
      started_at: string;
    }>
  >(
    `SELECT id, provider::text, status, message, started_at::text
     FROM sync_logs
     WHERE org_id = '${orgId}' AND status = 'error'
       AND started_at >= '${thirtyDaysAgo.toISOString()}'
     ORDER BY started_at DESC
     LIMIT 20`
  );

  const dailySyncStats = await prisma.$queryRawUnsafe<
    Array<{ date: string; provider: string; success_count: number; fail_count: number }>
  >(
    `SELECT started_at::date::text AS date, provider::text,
            COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
            COUNT(*) FILTER (WHERE status = 'error')::int AS fail_count
     FROM sync_logs
     WHERE org_id = '${orgId}' AND started_at >= '${thirtyDaysAgo.toISOString()}'
     GROUP BY started_at::date, provider
     ORDER BY date`
  );

  const overallHealth = providers.length > 0
    ? providers.reduce((s, p) => s + p.healthScore, 0) / providers.length
    : 100;

  const alerts: Array<{ provider: string; type: string; message: string; severity: string }> = [];

  for (const p of providers) {
    if (p.lastStatus === "error") {
      alerts.push({
        provider: p.provider,
        type: "last_sync_failed",
        message: `Last sync for ${p.provider} failed. Check provider credentials.`,
        severity: "critical",
      });
    }
    if (p.successRate < 0.9) {
      alerts.push({
        provider: p.provider,
        type: "low_success_rate",
        message: `${p.provider} sync success rate is ${(p.successRate * 100).toFixed(1)}% over the last 30 days.`,
        severity: "warning",
      });
    }
    if (p.avgDurationMs > 60000) {
      alerts.push({
        provider: p.provider,
        type: "slow_sync",
        message: `${p.provider} average sync takes ${(p.avgDurationMs / 1000).toFixed(1)}s, which is above normal.`,
        severity: "info",
      });
    }
  }

  return NextResponse.json({
    overallHealth: Math.round(overallHealth),
    providers,
    alerts,
    recentFailures: recentFailures.map((f) => ({
      id: f.id,
      provider: f.provider,
      message: f.message,
      startedAt: f.started_at,
    })),
    dailySyncStats,
  });
}
