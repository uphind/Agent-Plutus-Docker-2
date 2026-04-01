import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const totalActiveUsers = await prisma.orgUser.count({
    where: { orgId, status: "active" },
  });

  const companyTotals = await prisma.$queryRawUnsafe<
    Array<{
      total_cost: number;
      total_requests: number;
      total_input: number;
      total_output: number;
      lines_accepted: number;
      lines_suggested: number;
      users_with_usage: number;
    }>
  >(
    `SELECT
       COALESCE(SUM(cost_usd), 0)::float AS total_cost,
       COALESCE(SUM(requests_count), 0)::bigint AS total_requests,
       COALESCE(SUM(input_tokens), 0)::bigint AS total_input,
       COALESCE(SUM(output_tokens), 0)::bigint AS total_output,
       COALESCE(SUM(lines_accepted), 0)::bigint AS lines_accepted,
       COALESCE(SUM(lines_suggested), 0)::bigint AS lines_suggested,
       COUNT(DISTINCT user_id)::int AS users_with_usage
     FROM usage_records
     WHERE org_id = '${orgId}' AND date >= '${startDate.toISOString()}'`
  );

  const ct = companyTotals[0];
  const acceptRate =
    Number(ct.lines_suggested) > 0
      ? Number(ct.lines_accepted) / Number(ct.lines_suggested)
      : 0;
  const costPerLine =
    Number(ct.lines_accepted) > 0
      ? ct.total_cost / Number(ct.lines_accepted)
      : 0;
  const hoursPerLine = 1 / 60;
  const estimatedHoursSaved = Number(ct.lines_accepted) * hoursPerLine;
  const hourlyRate = 75;
  const estimatedValueSaved = estimatedHoursSaved * hourlyRate;
  const roiRatio = ct.total_cost > 0 ? estimatedValueSaved / ct.total_cost : 0;
  const seatUtilization =
    totalActiveUsers > 0
      ? Number(ct.users_with_usage) / totalActiveUsers
      : 0;
  const idleSeats = totalActiveUsers - Number(ct.users_with_usage);

  const byDepartment = await prisma.$queryRawUnsafe<
    Array<{
      department_id: string;
      department: string;
      total_cost: number;
      total_requests: number;
      lines_accepted: number;
      lines_suggested: number;
      user_count: number;
      active_users: number;
    }>
  >(
    `SELECT
       u.department_id,
       COALESCE(u.department, 'Unassigned') AS department,
       COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
       COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests,
       COALESCE(SUM(ur.lines_accepted), 0)::bigint AS lines_accepted,
       COALESCE(SUM(ur.lines_suggested), 0)::bigint AS lines_suggested,
       COUNT(DISTINCT u.id)::int AS user_count,
       COUNT(DISTINCT ur.user_id)::int AS active_users
     FROM org_users u
     LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.org_id = '${orgId}' AND ur.date >= '${startDate.toISOString()}'
     WHERE u.org_id = '${orgId}' AND u.status = 'active'
     GROUP BY u.department_id, u.department
     ORDER BY total_cost DESC`
  );

  const byUser = await prisma.$queryRawUnsafe<
    Array<{
      user_id: string;
      name: string;
      email: string;
      department: string;
      team: string;
      total_cost: number;
      total_requests: number;
      lines_accepted: number;
      lines_suggested: number;
      active_days: number;
      providers_used: number;
    }>
  >(
    `SELECT
       u.id AS user_id,
       u.name,
       u.email,
       COALESCE(u.department, 'Unassigned') AS department,
       COALESCE(u.team, '') AS team,
       COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
       COALESCE(SUM(ur.requests_count), 0)::bigint AS total_requests,
       COALESCE(SUM(ur.lines_accepted), 0)::bigint AS lines_accepted,
       COALESCE(SUM(ur.lines_suggested), 0)::bigint AS lines_suggested,
       COUNT(DISTINCT ur.date)::int AS active_days,
       COUNT(DISTINCT ur.provider)::int AS providers_used
     FROM org_users u
     LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.org_id = '${orgId}' AND ur.date >= '${startDate.toISOString()}'
     WHERE u.org_id = '${orgId}' AND u.status = 'active'
     GROUP BY u.id, u.name, u.email, u.department, u.team
     ORDER BY total_cost DESC`
  );

  const acceptRateTrend = await prisma.$queryRawUnsafe<
    Array<{ date: string; lines_accepted: number; lines_suggested: number }>
  >(
    `SELECT
       date::text,
       COALESCE(SUM(lines_accepted), 0)::bigint AS lines_accepted,
       COALESCE(SUM(lines_suggested), 0)::bigint AS lines_suggested
     FROM usage_records
     WHERE org_id = '${orgId}' AND date >= '${startDate.toISOString()}'
       AND lines_suggested > 0
     GROUP BY date
     ORDER BY date`
  );

  const weekdays = Math.max(
    1,
    Math.floor((days * 5) / 7)
  );

  return NextResponse.json({
    period: { days, startDate: startDate.toISOString() },
    company: {
      totalCost: ct.total_cost,
      totalRequests: Number(ct.total_requests),
      linesAccepted: Number(ct.lines_accepted),
      linesSuggested: Number(ct.lines_suggested),
      acceptRate,
      costPerLine,
      estimatedHoursSaved,
      estimatedValueSaved,
      roiRatio,
      seatUtilization,
      totalSeats: totalActiveUsers,
      activeSeats: Number(ct.users_with_usage),
      idleSeats,
    },
    byDepartment: byDepartment.map((d) => ({
      departmentId: d.department_id,
      department: d.department,
      totalCost: d.total_cost,
      totalRequests: Number(d.total_requests),
      linesAccepted: Number(d.lines_accepted),
      linesSuggested: Number(d.lines_suggested),
      acceptRate:
        Number(d.lines_suggested) > 0
          ? Number(d.lines_accepted) / Number(d.lines_suggested)
          : 0,
      userCount: d.user_count,
      activeUsers: d.active_users,
      idleSeats: d.user_count - d.active_users,
      seatUtilization:
        d.user_count > 0 ? d.active_users / d.user_count : 0,
    })),
    byUser: byUser.map((u) => ({
      userId: u.user_id,
      name: u.name,
      email: u.email,
      department: u.department,
      team: u.team,
      totalCost: u.total_cost,
      totalRequests: Number(u.total_requests),
      linesAccepted: Number(u.lines_accepted),
      linesSuggested: Number(u.lines_suggested),
      acceptRate:
        Number(u.lines_suggested) > 0
          ? Number(u.lines_accepted) / Number(u.lines_suggested)
          : 0,
      activeDays: u.active_days,
      seatUtilization: weekdays > 0 ? u.active_days / weekdays : 0,
      providersUsed: u.providers_used,
      isIdle: u.active_days === 0,
    })),
    acceptRateTrend: acceptRateTrend.map((t) => ({
      date: t.date,
      acceptRate:
        Number(t.lines_suggested) > 0
          ? Number(t.lines_accepted) / Number(t.lines_suggested)
          : 0,
      linesAccepted: Number(t.lines_accepted),
      linesSuggested: Number(t.lines_suggested),
    })),
  });
}
