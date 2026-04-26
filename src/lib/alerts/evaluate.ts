import { prisma } from "@/lib/db";

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertType =
  | "over_budget"
  | "budget_warning"
  | "anomaly"
  | "inactive_user"
  | "cost_spike"
  | "no_budget"
  | "underutilized"
  | "high_cost_model";

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  entityType: "department" | "team" | "user" | "provider";
  entityId: string;
  entityName: string;
  value?: number;
  threshold?: number;
}

/**
 * Detects alert conditions for an organisation. Pure read; safe to call from
 * the dashboard route handler and from the scheduler dispatcher.
 */
export async function evaluateAlerts(orgId: string): Promise<Alert[]> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const alerts: Alert[] = [];

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

    if (pct >= 100) {
      alerts.push({
        type: "over_budget", severity: "critical",
        title: `${dept.name} over budget`,
        description: `Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} budget (${pct.toFixed(0)}%)`,
        entityType: "department", entityId: dept.id, entityName: dept.name,
        value: pct, threshold: 100,
      });
    } else if (pct >= dept.alertThreshold) {
      alerts.push({
        type: "budget_warning", severity: "warning",
        title: `${dept.name} approaching budget`,
        description: `Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} budget (${pct.toFixed(0)}%)`,
        entityType: "department", entityId: dept.id, entityName: dept.name,
        value: pct, threshold: dept.alertThreshold,
      });
    }
  }

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

    if (pct >= 100) {
      alerts.push({
        type: "over_budget", severity: "critical",
        title: `${team.department.name} / ${team.name} over budget`,
        description: `Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} budget (${pct.toFixed(0)}%)`,
        entityType: "team", entityId: team.id, entityName: team.name,
        value: pct, threshold: 100,
      });
    } else if (pct >= team.alertThreshold) {
      alerts.push({
        type: "budget_warning", severity: "warning",
        title: `${team.department.name} / ${team.name} approaching budget`,
        description: `Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} budget (${pct.toFixed(0)}%)`,
        entityType: "team", entityId: team.id, entityName: team.name,
        value: pct, threshold: team.alertThreshold,
      });
    }
  }

  const usersWithBudgets = await prisma.orgUser.findMany({
    where: { orgId, monthlyBudget: { not: null } },
  });

  if (usersWithBudgets.length > 0) {
    const userBudgetSpend = await prisma.$queryRaw<
      Array<{ user_id: string; total_cost: number }>
    >`
      SELECT user_id, COALESCE(SUM(cost_usd), 0)::float AS total_cost
      FROM usage_records
      WHERE org_id = ${orgId} AND date >= ${monthStart} AND user_id IS NOT NULL
      GROUP BY user_id
    `;
    const userSpendMap = new Map(userBudgetSpend.map((u) => [u.user_id, u.total_cost]));

    for (const usr of usersWithBudgets) {
      const budget = Number(usr.monthlyBudget);
      const spent = userSpendMap.get(usr.id) ?? 0;
      const pct = budget > 0 ? (spent / budget) * 100 : 0;

      if (pct >= 100) {
        alerts.push({
          type: "over_budget", severity: "critical",
          title: `${usr.name} over personal budget`,
          description: `Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} budget (${pct.toFixed(0)}%)`,
          entityType: "user", entityId: usr.id, entityName: usr.name,
          value: pct, threshold: 100,
        });
      } else if (pct >= usr.alertThreshold) {
        alerts.push({
          type: "budget_warning", severity: "warning",
          title: `${usr.name} approaching personal budget`,
          description: `Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} budget (${pct.toFixed(0)}%)`,
          entityType: "user", entityId: usr.id, entityName: usr.name,
          value: pct, threshold: usr.alertThreshold,
        });
      }
    }
  }

  const userSpend = await prisma.$queryRaw<
    Array<{ user_id: string; name: string; department: string | null; department_id: string | null; total_cost: number }>
  >`
    SELECT u.id AS user_id, u.name, u.department, u.department_id,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${thirtyDaysAgo}
    WHERE u.org_id = ${orgId} AND u.status = 'active'
    GROUP BY u.id, u.name, u.department, u.department_id
  `;

  const deptAvgs = new Map<string, { sum: number; count: number }>();
  for (const u of userSpend) {
    const key = u.department_id ?? "_none";
    const entry = deptAvgs.get(key) ?? { sum: 0, count: 0 };
    entry.sum += u.total_cost;
    entry.count++;
    deptAvgs.set(key, entry);
  }

  for (const u of userSpend) {
    const key = u.department_id ?? "_none";
    const avg = deptAvgs.get(key);
    if (!avg || avg.count < 2) continue;
    const deptAvg = avg.sum / avg.count;
    if (deptAvg > 0 && u.total_cost > deptAvg * 2) {
      alerts.push({
        type: "anomaly", severity: "warning",
        title: `${u.name} has unusually high spend`,
        description: `$${u.total_cost.toFixed(2)} this month (${(u.total_cost / deptAvg).toFixed(1)}x department average)`,
        entityType: "user", entityId: u.user_id, entityName: u.name,
        value: u.total_cost, threshold: deptAvg * 2,
      });
    }
  }

  const inactiveUsers = await prisma.$queryRaw<
    Array<{ user_id: string; name: string; email: string }>
  >`
    SELECT u.id AS user_id, u.name, u.email
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${thirtyDaysAgo}
    WHERE u.org_id = ${orgId} AND u.status = 'active'
    GROUP BY u.id, u.name, u.email
    HAVING COUNT(ur.id) = 0
  `;

  for (const u of inactiveUsers) {
    alerts.push({
      type: "inactive_user", severity: "info",
      title: `${u.name} has no usage`,
      description: `No AI usage recorded in the last 30 days`,
      entityType: "user", entityId: u.user_id, entityName: u.name,
    });
  }

  const prevByDept = await prisma.$queryRaw<
    Array<{ department_id: string; department: string; prev_cost: number; curr_cost: number }>
  >`
    SELECT u.department_id,
           COALESCE(u.department, 'Unassigned') AS department,
           COALESCE(SUM(CASE WHEN ur.date >= ${thirtyDaysAgo} THEN ur.cost_usd ELSE 0 END), 0)::float AS curr_cost,
           COALESCE(SUM(CASE WHEN ur.date >= ${sixtyDaysAgo} AND ur.date < ${thirtyDaysAgo} THEN ur.cost_usd ELSE 0 END), 0)::float AS prev_cost
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.org_id = ${orgId}
    WHERE u.org_id = ${orgId} AND u.status = 'active' AND u.department_id IS NOT NULL
    GROUP BY u.department_id, u.department
  `;

  for (const d of prevByDept) {
    if (d.prev_cost > 5 && d.curr_cost > 5) {
      const change = ((d.curr_cost - d.prev_cost) / d.prev_cost) * 100;
      if (change >= 100) {
        alerts.push({
          type: "cost_spike", severity: "critical",
          title: `${d.department} cost doubled`,
          description: `Spend jumped from $${d.prev_cost.toFixed(2)} to $${d.curr_cost.toFixed(2)} (+${change.toFixed(0)}% vs last month)`,
          entityType: "department", entityId: d.department_id, entityName: d.department,
          value: change, threshold: 100,
        });
      } else if (change >= 50) {
        alerts.push({
          type: "cost_spike", severity: "warning",
          title: `${d.department} cost rising fast`,
          description: `Spend up from $${d.prev_cost.toFixed(2)} to $${d.curr_cost.toFixed(2)} (+${change.toFixed(0)}% vs last month)`,
          entityType: "department", entityId: d.department_id, entityName: d.department,
          value: change, threshold: 50,
        });
      }
    }
  }

  const deptsWithSpendNoBudget = await prisma.$queryRaw<
    Array<{ department_id: string; department: string; total_cost: number }>
  >`
    SELECT u.department_id,
           COALESCE(u.department, 'Unassigned') AS department,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM org_users u
    JOIN usage_records ur ON ur.user_id = u.id AND ur.org_id = ${orgId} AND ur.date >= ${thirtyDaysAgo}
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.org_id = ${orgId} AND u.department_id IS NOT NULL
      AND (d.monthly_budget IS NULL OR d.monthly_budget = 0)
    GROUP BY u.department_id, u.department
    HAVING COALESCE(SUM(ur.cost_usd), 0) > 1
  `;

  for (const d of deptsWithSpendNoBudget) {
    alerts.push({
      type: "no_budget", severity: "info",
      title: `${d.department} has no budget set`,
      description: `$${d.total_cost.toFixed(2)} spent this month with no budget limit configured`,
      entityType: "department", entityId: d.department_id, entityName: d.department,
      value: d.total_cost,
    });
  }

  const orgAvgCost = await prisma.$queryRaw<
    Array<{ avg_cost: number }>
  >`
    SELECT CASE WHEN SUM(requests_count) > 0
      THEN (SUM(cost_usd)::float / SUM(requests_count)::float)
      ELSE 0 END AS avg_cost
    FROM usage_records
    WHERE org_id = ${orgId} AND date >= ${thirtyDaysAgo}
  `;
  const orgAvgCostPerReq = orgAvgCost[0]?.avg_cost ?? 0;

  if (orgAvgCostPerReq > 0) {
    const expensiveUsers = await prisma.$queryRaw<
      Array<{ user_id: string; name: string; avg_cost: number; total_cost: number; total_requests: number }>
    >`
      SELECT u.id AS user_id, u.name,
             (SUM(ur.cost_usd)::float / NULLIF(SUM(ur.requests_count), 0)::float) AS avg_cost,
             SUM(ur.cost_usd)::float AS total_cost,
             SUM(ur.requests_count)::int AS total_requests
      FROM org_users u
      JOIN usage_records ur ON ur.user_id = u.id AND ur.org_id = ${orgId} AND ur.date >= ${thirtyDaysAgo}
      WHERE u.org_id = ${orgId} AND u.status = 'active'
      GROUP BY u.id, u.name
      HAVING SUM(ur.requests_count) >= 10
        AND (SUM(ur.cost_usd)::float / NULLIF(SUM(ur.requests_count), 0)::float) > ${orgAvgCostPerReq * 3}
    `;

    for (const u of expensiveUsers) {
      alerts.push({
        type: "high_cost_model", severity: "warning",
        title: `${u.name} uses expensive models`,
        description: `$${u.avg_cost.toFixed(4)}/request avg (${(u.avg_cost / orgAvgCostPerReq).toFixed(1)}x org average) across ${u.total_requests} requests`,
        entityType: "user", entityId: u.user_id, entityName: u.name,
        value: u.avg_cost, threshold: orgAvgCostPerReq * 3,
      });
    }
  }

  const deptUtilization = await prisma.$queryRaw<
    Array<{ department_id: string; department: string; total_users: number; active_users: number }>
  >`
    SELECT u.department_id,
           COALESCE(u.department, 'Unassigned') AS department,
           COUNT(DISTINCT u.id)::int AS total_users,
           COUNT(DISTINCT ur.user_id)::int AS active_users
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.org_id = ${orgId} AND ur.date >= ${thirtyDaysAgo}
    WHERE u.org_id = ${orgId} AND u.status = 'active' AND u.department_id IS NOT NULL
    GROUP BY u.department_id, u.department
    HAVING COUNT(DISTINCT u.id) >= 3
  `;

  for (const d of deptUtilization) {
    const utilRate = d.total_users > 0 ? d.active_users / d.total_users : 0;
    if (utilRate < 0.3) {
      const idleCount = d.total_users - d.active_users;
      alerts.push({
        type: "underutilized", severity: d.active_users === 0 ? "warning" : "info",
        title: `${d.department} has low adoption`,
        description: `Only ${d.active_users} of ${d.total_users} users (${(utilRate * 100).toFixed(0)}%) active in the last 30 days — ${idleCount} idle seats`,
        entityType: "department", entityId: d.department_id, entityName: d.department,
        value: utilRate * 100, threshold: 30,
      });
    }
  }

  alerts.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  return alerts;
}

export function summarizeAlerts(alerts: Alert[]) {
  return {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };
}
