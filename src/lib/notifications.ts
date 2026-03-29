import { prisma } from "@/lib/db";
import { NotificationType } from "@/generated/prisma/client";

async function hasSimilarRecent(
  orgId: string,
  type: NotificationType,
  entityId: string | null,
  severity?: string,
  hoursBack = 24
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hoursBack * 3600000);
  const count = await prisma.notification.count({
    where: {
      orgId,
      type,
      entityId: entityId ?? undefined,
      ...(severity ? { severity } : {}),
      createdAt: { gte: cutoff },
    },
  });
  return count > 0;
}

export async function generateNotifications(orgId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const created: string[] = [];

  // Department budget alerts
  const depts = await prisma.department.findMany({
    where: { orgId, monthlyBudget: { not: null } },
  });

  const deptSpend = await prisma.$queryRaw<
    Array<{ department_id: string; total_cost: number }>
  >`
    SELECT u.department_id, COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM usage_records ur JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND ur.date >= ${monthStart} AND u.department_id IS NOT NULL
    GROUP BY u.department_id
  `;
  const deptSpendMap = new Map(deptSpend.map((d) => [d.department_id, d.total_cost]));

  for (const dept of depts) {
    const budget = Number(dept.monthlyBudget);
    const spent = deptSpendMap.get(dept.id) ?? 0;
    const pct = budget > 0 ? (spent / budget) * 100 : 0;

    if (pct >= 100 && !(await hasSimilarRecent(orgId, NotificationType.budget_alert, dept.id, "critical"))) {
      await prisma.notification.create({
        data: {
          orgId, type: NotificationType.budget_alert,
          severity: "critical",
          title: `${dept.name} exceeded budget`,
          message: `Spent $${spent.toFixed(2)} of $${budget.toFixed(0)} budget (${pct.toFixed(0)}%)`,
          entityType: "department", entityId: dept.id,
        },
      });
      created.push(`dept-budget-${dept.id}`);
    } else if (pct >= dept.alertThreshold && pct < 100 && !(await hasSimilarRecent(orgId, NotificationType.budget_alert, dept.id, "warning"))) {
      await prisma.notification.create({
        data: {
          orgId, type: NotificationType.budget_alert,
          severity: "warning",
          title: `${dept.name} approaching budget`,
          message: `${pct.toFixed(0)}% of $${budget.toFixed(0)} budget used`,
          entityType: "department", entityId: dept.id,
        },
      });
      created.push(`dept-warn-${dept.id}`);
    }
  }

  // Team budget alerts
  const teams = await prisma.team.findMany({
    where: { orgId, monthlyBudget: { not: null } },
    include: { department: { select: { name: true } } },
  });

  const teamSpend = await prisma.$queryRaw<
    Array<{ team_id: string; total_cost: number }>
  >`
    SELECT u.team_id, COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM usage_records ur JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND ur.date >= ${monthStart} AND u.team_id IS NOT NULL
    GROUP BY u.team_id
  `;
  const teamSpendMap = new Map(teamSpend.map((t) => [t.team_id, t.total_cost]));

  for (const team of teams) {
    const budget = Number(team.monthlyBudget);
    const spent = teamSpendMap.get(team.id) ?? 0;
    const pct = budget > 0 ? (spent / budget) * 100 : 0;

    if (pct >= 100 && !(await hasSimilarRecent(orgId, NotificationType.budget_alert, team.id, "critical"))) {
      await prisma.notification.create({
        data: {
          orgId, type: NotificationType.budget_alert,
          severity: "critical",
          title: `${team.department.name} / ${team.name} exceeded budget`,
          message: `Spent $${spent.toFixed(2)} of $${budget.toFixed(0)} budget`,
          entityType: "team", entityId: team.id,
        },
      });
      created.push(`team-budget-${team.id}`);
    } else if (pct >= team.alertThreshold && pct < 100 && !(await hasSimilarRecent(orgId, NotificationType.budget_alert, team.id, "warning"))) {
      await prisma.notification.create({
        data: {
          orgId, type: NotificationType.budget_alert,
          severity: "warning",
          title: `${team.department.name} / ${team.name} approaching budget`,
          message: `${pct.toFixed(0)}% of $${budget.toFixed(0)} budget used`,
          entityType: "team", entityId: team.id,
        },
      });
      created.push(`team-warn-${team.id}`);
    }
  }

  // User budget alerts
  const usersWithBudgets = await prisma.orgUser.findMany({
    where: { orgId, monthlyBudget: { not: null } },
  });

  if (usersWithBudgets.length > 0) {
    const userSpend = await prisma.$queryRaw<
      Array<{ user_id: string; total_cost: number }>
    >`
      SELECT user_id, COALESCE(SUM(cost_usd), 0)::float AS total_cost
      FROM usage_records WHERE org_id = ${orgId} AND date >= ${monthStart} AND user_id IS NOT NULL
      GROUP BY user_id
    `;
    const userSpendMap = new Map(userSpend.map((u) => [u.user_id, u.total_cost]));

    for (const usr of usersWithBudgets) {
      const budget = Number(usr.monthlyBudget);
      const spent = userSpendMap.get(usr.id) ?? 0;
      const pct = budget > 0 ? (spent / budget) * 100 : 0;

      const userSeverity = pct >= 100 ? "critical" : "warning";
      if (pct >= usr.alertThreshold && !(await hasSimilarRecent(orgId, NotificationType.budget_alert, usr.id, userSeverity))) {
        await prisma.notification.create({
          data: {
            orgId, type: NotificationType.budget_alert,
            severity: pct >= 100 ? "critical" : "warning",
            title: `${usr.name} ${pct >= 100 ? "exceeded" : "approaching"} personal budget`,
            message: `${pct.toFixed(0)}% of $${budget.toFixed(0)} budget used`,
            entityType: "user", entityId: usr.id,
          },
        });
        created.push(`user-budget-${usr.id}`);
      }
    }
  }

  // Idle seat detection
  const idleUsers = await prisma.$queryRaw<
    Array<{ user_id: string; name: string }>
  >`
    SELECT u.id AS user_id, u.name
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${thirtyDaysAgo}
    WHERE u.org_id = ${orgId} AND u.status = 'active'
    GROUP BY u.id, u.name
    HAVING COUNT(ur.id) = 0
    LIMIT 20
  `;

  if (idleUsers.length > 0 && !(await hasSimilarRecent(orgId, NotificationType.idle_seat, null, undefined, 168))) {
    await prisma.notification.create({
      data: {
        orgId, type: NotificationType.idle_seat,
        severity: "info",
        title: `${idleUsers.length} idle seat${idleUsers.length > 1 ? "s" : ""} detected`,
        message: `Users with no AI usage in 30+ days: ${idleUsers.slice(0, 5).map((u) => u.name).join(", ")}${idleUsers.length > 5 ? ` +${idleUsers.length - 5} more` : ""}`,
        entityType: "user",
      },
    });
    created.push("idle-seats");
  }

  // Anomaly detection
  const anomalies = await prisma.$queryRaw<
    Array<{ user_id: string; user_name: string; spend: number; avg_spend: number }>
  >`
    WITH daily_user_spend AS (
      SELECT ur.user_id, u.name AS user_name, ur.date, SUM(ur.cost_usd)::float AS spend
      FROM usage_records ur JOIN org_users u ON ur.user_id = u.id
      WHERE ur.org_id = ${orgId} AND ur.date >= CURRENT_DATE - INTERVAL '21 days' AND ur.user_id IS NOT NULL
      GROUP BY ur.user_id, u.name, ur.date
    ),
    user_stats AS (
      SELECT user_id, user_name, AVG(spend) AS avg_spend, STDDEV_POP(spend) AS stddev
      FROM daily_user_spend WHERE date < CURRENT_DATE - INTERVAL '7 days'
      GROUP BY user_id, user_name HAVING COUNT(*) >= 5 AND STDDEV_POP(spend) > 0
    )
    SELECT d.user_id, d.user_name, d.spend, s.avg_spend
    FROM daily_user_spend d JOIN user_stats s ON d.user_id = s.user_id
    WHERE d.date = CURRENT_DATE - 1 AND d.spend > s.avg_spend + 2 * s.stddev
    LIMIT 10
  `;

  for (const a of anomalies) {
    if (!(await hasSimilarRecent(orgId, NotificationType.anomaly, a.user_id))) {
      await prisma.notification.create({
        data: {
          orgId, type: NotificationType.anomaly,
          severity: "warning",
          title: `Unusual spend by ${a.user_name}`,
          message: `$${a.spend.toFixed(2)} yesterday vs $${a.avg_spend.toFixed(2)} daily average`,
          entityType: "user", entityId: a.user_id,
        },
      });
      created.push(`anomaly-${a.user_id}`);
    }
  }

  return { created: created.length, items: created };
}
