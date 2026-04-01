import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const allUsers = await prisma.$queryRawUnsafe<
    Array<{
      user_id: string;
      name: string;
      email: string;
      department: string;
      team: string;
      status: string;
      providers: string;
      total_cost: number;
      total_requests: number;
      active_days: number;
      last_activity: string | null;
      lines_accepted: number;
      lines_suggested: number;
    }>
  >(
    `SELECT
       u.id AS user_id, u.name, u.email,
       COALESCE(u.department, 'Unassigned') AS department,
       COALESCE(u.team, '') AS team,
       u.status,
       COALESCE(STRING_AGG(DISTINCT ur.provider::text, ','), '') AS providers,
       COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
       COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests,
       COUNT(DISTINCT ur.date)::int AS active_days,
       MAX(ur.date)::text AS last_activity,
       COALESCE(SUM(ur.lines_accepted), 0)::bigint AS lines_accepted,
       COALESCE(SUM(ur.lines_suggested), 0)::bigint AS lines_suggested
     FROM org_users u
     LEFT JOIN usage_records ur ON ur.user_id = u.id
       AND ur.org_id = '${orgId}' AND ur.date >= '${startDate.toISOString()}'
     WHERE u.org_id = '${orgId}' AND u.status = 'active'
     GROUP BY u.id, u.name, u.email, u.department, u.team, u.status
     ORDER BY total_cost DESC`
  );

  const weekdays = Math.max(1, Math.floor((days * 5) / 7));

  const scored = allUsers.map((u) => {
    const providers = u.providers ? u.providers.split(",").filter(Boolean) : [];
    const utilizationScore = u.active_days / weekdays;
    const isIdle = u.active_days === 0;
    const isLowUsage = u.active_days > 0 && u.active_days < weekdays * 0.2;
    const acceptRate = Number(u.lines_suggested) > 0
      ? Number(u.lines_accepted) / Number(u.lines_suggested) : null;

    return {
      userId: u.user_id,
      name: u.name,
      email: u.email,
      department: u.department,
      team: u.team,
      providers,
      totalCost: u.total_cost,
      totalRequests: Number(u.total_requests),
      activeDays: u.active_days,
      lastActivity: u.last_activity,
      linesAccepted: Number(u.lines_accepted),
      utilizationScore,
      acceptRate,
      isIdle,
      isLowUsage,
      engagementTier: isIdle ? "idle" as const
        : utilizationScore < 0.2 ? "low" as const
        : utilizationScore < 0.6 ? "moderate" as const
        : "high" as const,
    };
  });

  const idleUsers = scored.filter((u) => u.isIdle);
  const lowUsageUsers = scored.filter((u) => u.isLowUsage);
  const highUsers = scored.filter((u) => u.engagementTier === "high");

  const providerOverlap = await prisma.$queryRawUnsafe<
    Array<{ user_id: string; name: string; email: string; providers: string; total_cost: number }>
  >(
    `SELECT u.id AS user_id, u.name, u.email,
            STRING_AGG(DISTINCT ur.provider::text, ',' ORDER BY ur.provider::text) AS providers,
            SUM(ur.cost_usd)::float AS total_cost
     FROM org_users u
     JOIN usage_records ur ON ur.user_id = u.id
       AND ur.org_id = '${orgId}' AND ur.date >= '${startDate.toISOString()}'
     WHERE u.org_id = '${orgId}' AND u.status = 'active'
     GROUP BY u.id, u.name, u.email
     HAVING COUNT(DISTINCT ur.provider) > 1`
  );

  const recommendations: Array<{
    type: string;
    severity: string;
    title: string;
    description: string;
    estimatedSavings: number;
    affectedUsers: number;
  }> = [];

  if (idleUsers.length > 0) {
    const estimatedMonthlyCost = idleUsers.length * 40;
    recommendations.push({
      type: "idle_seats",
      severity: idleUsers.length > 5 ? "critical" : "warning",
      title: `${idleUsers.length} completely idle seat${idleUsers.length > 1 ? "s" : ""}`,
      description: `These users had zero AI activity across all providers in the last ${days} days. Reclaiming seats saves an estimated $${estimatedMonthlyCost}/mo.`,
      estimatedSavings: estimatedMonthlyCost,
      affectedUsers: idleUsers.length,
    });
  }

  if (lowUsageUsers.length > 0) {
    const avgCost = lowUsageUsers.reduce((s, u) => s + u.totalCost, 0) / lowUsageUsers.length;
    recommendations.push({
      type: "low_usage_downgrade",
      severity: "info",
      title: `${lowUsageUsers.length} user${lowUsageUsers.length > 1 ? "s" : ""} with very low utilization`,
      description: `Active less than 20% of workdays. Consider downgrading tier or sharing seats. Average spend: $${avgCost.toFixed(2)}/period.`,
      estimatedSavings: Math.round(lowUsageUsers.length * 20),
      affectedUsers: lowUsageUsers.length,
    });
  }

  if (providerOverlap.length > 3) {
    recommendations.push({
      type: "provider_consolidation",
      severity: "info",
      title: `${providerOverlap.length} users on multiple providers`,
      description: `These users are active on more than one AI provider. Consolidating could reduce license costs while maintaining productivity.`,
      estimatedSavings: Math.round(providerOverlap.length * 15),
      affectedUsers: providerOverlap.length,
    });
  }

  const totalEstimatedSavings = recommendations.reduce((s, r) => s + r.estimatedSavings, 0);

  return NextResponse.json({
    period: { days },
    summary: {
      totalUsers: scored.length,
      idleCount: idleUsers.length,
      lowUsageCount: lowUsageUsers.length,
      moderateCount: scored.filter((u) => u.engagementTier === "moderate").length,
      highCount: highUsers.length,
      multiProviderCount: providerOverlap.length,
      avgUtilization: scored.length > 0
        ? scored.reduce((s, u) => s + u.utilizationScore, 0) / scored.length : 0,
      totalEstimatedSavings,
    },
    users: scored,
    recommendations,
    providerOverlap: providerOverlap.map((p) => ({
      userId: p.user_id,
      name: p.name,
      email: p.email,
      providers: p.providers.split(","),
      totalCost: p.total_cost,
    })),
  });
}
