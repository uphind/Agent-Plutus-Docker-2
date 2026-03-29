import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

interface Alert {
  type: "over_budget" | "budget_warning" | "anomaly" | "inactive_user";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  entityType: "department" | "team" | "user";
  entityId: string;
  entityName: string;
  value?: number;
  threshold?: number;
}

export async function GET() {
  const orgId = await getOrgId();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const alerts: Alert[] = [];

  // Department budget alerts
  const depts = await prisma.department.findMany({
    where: { orgId: orgId, monthlyBudget: { not: null } },
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

  // Team budget alerts
  const teams = await prisma.team.findMany({
    where: { orgId: orgId, monthlyBudget: { not: null } },
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

  // User budget alerts
  const usersWithBudgets = await prisma.orgUser.findMany({
    where: { orgId: orgId, monthlyBudget: { not: null } },
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

  // Usage anomaly: users spending >2x department average
  const userSpend = await prisma.$queryRaw<
    Array<{ user_id: string; name: string; department: string | null; department_id: string | null; total_cost: number }>
  >`
    SELECT u.id AS user_id, u.name, u.department, u.department_id,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${monthStart}
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

  // Inactive users (in directory but zero usage in 30 days)
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

  alerts.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  return NextResponse.json({
    alerts,
    summary: {
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      info: alerts.filter((a) => a.severity === "info").length,
    },
  });
}
