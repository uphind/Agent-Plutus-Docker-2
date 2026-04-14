import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgIdSafe } from "@/lib/org";
import { processPreAggregated } from "@/lib/classifier";

interface Suggestion {
  id: string;
  category: "cost_optimization" | "budget_alerts" | "seat_management" | "efficiency" | "ai_classification";
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  estimatedSavings?: number;
  affectedEntities: Array<{ type: string; id: string; name: string }>;
  linkTo?: string;
}

const EMPTY_RESPONSE = {
  suggestions: [],
  summary: { total: 0, critical: 0, warning: 0, info: 0, totalEstimatedSavings: 0 },
};

export async function GET() {
  const orgId = await getOrgIdSafe();
  if (!orgId) return NextResponse.json(EMPTY_RESPONSE);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysElapsed = Math.max(1, Math.floor((now.getTime() - monthStart.getTime()) / 86400000));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const suggestions: Suggestion[] = [];

  // 1) Cache hit rate analysis
  const cacheData = await prisma.$queryRaw<
    Array<{ provider: string; total_input: number; total_cached: number; total_cost: number }>
  >`
    SELECT provider, SUM(input_tokens)::float AS total_input,
           SUM(cached_tokens)::float AS total_cached,
           SUM(cost_usd)::float AS total_cost
    FROM usage_records
    WHERE org_id = ${orgId} AND date >= ${thirtyDaysAgo}
    GROUP BY provider
    HAVING SUM(input_tokens) > 0
  `;

  for (const row of cacheData) {
    const cacheRate = row.total_input > 0 ? row.total_cached / row.total_input : 0;
    if (cacheRate < 0.2 && row.total_input > 10000) {
      const potentialSavings = row.total_cost * 0.3 * (0.5 - cacheRate);
      suggestions.push({
        id: `cache-${row.provider}`,
        category: "efficiency",
        type: "cache_rate",
        severity: "info",
        title: `Low cache hit rate for ${row.provider}`,
        description: `Only ${(cacheRate * 100).toFixed(1)}% of input tokens are cached. Improving prompt caching with system prompt reuse could save ~$${potentialSavings.toFixed(0)}/mo.`,
        estimatedSavings: Math.round(potentialSavings),
        affectedEntities: [{ type: "provider", id: row.provider, name: row.provider }],
      });
    }
  }

  // 2) AI Classification — dual model recommendations
  const classifierData = await prisma.$queryRaw<
    Array<{
      user_email: string; user_name: string; department: string; team: string;
      provider: string; model: string;
      total_requests: number; total_input: number; total_output: number;
      total_cached: number; total_cost: number; active_days: number;
    }>
  >`
    SELECT u.email AS user_email, u.name AS user_name,
           COALESCE(u.department, '') AS department, COALESCE(u.team, '') AS team,
           ur.provider::text AS provider, COALESCE(ur.model, 'unknown') AS model,
           SUM(ur.requests_count)::int AS total_requests,
           SUM(ur.input_tokens)::float AS total_input,
           SUM(ur.output_tokens)::float AS total_output,
           SUM(ur.cached_tokens)::float AS total_cached,
           SUM(ur.cost_usd)::float AS total_cost,
           COUNT(DISTINCT ur.date)::int AS active_days
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId} AND ur.date >= ${thirtyDaysAgo} AND ur.model IS NOT NULL
    GROUP BY u.email, u.name, u.department, u.team, ur.provider, ur.model
    HAVING SUM(ur.cost_usd)::float > 5
  `;

  if (classifierData.length > 0) {
    const classifiedRows = classifierData.map((r) => ({
      user_email: r.user_email,
      user_name: r.user_name,
      department: r.department,
      team: r.team,
      provider: r.provider,
      model: r.model,
      input_tokens: r.total_input,
      output_tokens: r.total_output,
      cached_tokens: r.total_cached,
      cost_usd: r.total_cost,
      requests_count: r.total_requests,
      date: undefined,
    }));

    const { rows: recommended } = processPreAggregated(
      classifiedRows as unknown as Array<Record<string, unknown>>
    );

    const savingsRows = recommended
      .filter((r) => r.is_cheaper_global || r.is_cheaper_same_vendor)
      .sort((a, b) => (b.est_savings_global_usd ?? 0) - (a.est_savings_global_usd ?? 0));

    const modelGroups = new Map<string, typeof savingsRows>();
    for (const r of savingsRows) {
      if (!modelGroups.has(r.model)) modelGroups.set(r.model, []);
      modelGroups.get(r.model)!.push(r);
    }

    for (const [model, users] of modelGroups) {
      const totalSav = users.reduce((s, u) => s + (u.est_savings_global_usd ?? 0), 0);
      const totalCost = users.reduce((s, u) => s + u.total_cost_usd, 0);
      if (totalSav < 5) continue;

      const topRec = users[0];
      const globalTarget = topRec.recommendation_global;
      const sameVendorTarget = topRec.recommendation_same_vendor;

      let desc = `${users.length} user${users.length > 1 ? "s" : ""} spent $${totalCost.toFixed(0)} on ${model}.`;
      if (globalTarget !== "\u2014") desc += ` Best cross-vendor: ${globalTarget}.`;
      if (sameVendorTarget !== "\u2014" && sameVendorTarget !== globalTarget) {
        desc += ` Same vendor: ${sameVendorTarget}.`;
      }

      suggestions.push({
        id: `ai-class-${model}`,
        category: "ai_classification",
        type: "model_substitution",
        severity: totalSav > 100 ? "warning" : "info",
        title: `Switch from ${model}: save ~$${totalSav.toFixed(0)}/mo`,
        description: desc,
        estimatedSavings: Math.round(totalSav),
        affectedEntities: users.slice(0, 10).map((u) => ({
          type: "user", id: u.user_email, name: u.user_name || u.user_email,
        })),
        linkTo: "/dashboard/suggestions",
      });
    }
  }

  // 3) Batch API savings (OpenAI)
  const batchData = await prisma.$queryRaw<
    Array<{ non_batch_cost: number; total_requests: number }>
  >`
    SELECT SUM(cost_usd)::float AS non_batch_cost,
           SUM(requests_count)::int AS total_requests
    FROM usage_records
    WHERE org_id = ${orgId} AND date >= ${thirtyDaysAgo}
      AND provider = 'openai' AND is_batch = false AND cost_usd > 0
  `;

  if (batchData[0]?.non_batch_cost > 50) {
    const savings = batchData[0].non_batch_cost * 0.5;
    suggestions.push({
      id: "batch-savings",
      category: "cost_optimization",
      type: "batch_api",
      severity: savings > 200 ? "warning" : "info",
      title: "Use OpenAI Batch API to save 50%",
      description: `$${batchData[0].non_batch_cost.toFixed(0)} in real-time OpenAI spend this month. Non-time-sensitive workloads could use the Batch API at 50% discount, saving ~$${savings.toFixed(0)}/mo.`,
      estimatedSavings: Math.round(savings),
      affectedEntities: [{ type: "provider", id: "openai", name: "OpenAI" }],
    });
  }

  // 4) Idle seats
  const idleUsers = await prisma.$queryRaw<
    Array<{ user_id: string; name: string; email: string }>
  >`
    SELECT u.id AS user_id, u.name, u.email
    FROM org_users u
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${thirtyDaysAgo}
    WHERE u.org_id = ${orgId} AND u.status = 'active'
    GROUP BY u.id, u.name, u.email
    HAVING COUNT(ur.id) = 0
  `;

  if (idleUsers.length > 0) {
    suggestions.push({
      id: "idle-seats",
      category: "seat_management",
      type: "idle_seat",
      severity: idleUsers.length > 5 ? "warning" : "info",
      title: `${idleUsers.length} user${idleUsers.length > 1 ? "s" : ""} with no usage in 30 days`,
      description: `Consider reassigning or deactivating idle seats to reduce license costs.`,
      affectedEntities: idleUsers.map((u) => ({
        type: "user", id: u.user_id, name: u.name,
      })),
      linkTo: "/dashboard/users",
    });
  }

  // 5) Budget burn rate
  const budgetedDepts = await prisma.$queryRaw<
    Array<{ dept_id: string; dept_name: string; budget: number; spent: number }>
  >`
    SELECT d.id AS dept_id, d.name AS dept_name,
           d.monthly_budget::float AS budget,
           COALESCE(SUM(ur.cost_usd), 0)::float AS spent
    FROM departments d
    LEFT JOIN org_users u ON u.department_id = d.id
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${monthStart}
    WHERE d.org_id = ${orgId} AND d.monthly_budget IS NOT NULL
    GROUP BY d.id, d.name, d.monthly_budget
  `;

  for (const dept of budgetedDepts) {
    if (dept.budget <= 0 || daysElapsed < 3) continue;
    const dailyRate = dept.spent / daysElapsed;
    const projected = dept.spent + dailyRate * (daysInMonth - daysElapsed);

    if (projected > dept.budget) {
      const overshootDate = new Date(monthStart);
      const daysToExhaust = dept.budget / dailyRate;
      overshootDate.setDate(overshootDate.getDate() + Math.ceil(daysToExhaust));
      const dateStr = overshootDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      suggestions.push({
        id: `burn-${dept.dept_id}`,
        category: "budget_alerts",
        type: "burn_rate",
        severity: projected > dept.budget * 1.2 ? "critical" : "warning",
        title: `${dept.dept_name} will exceed budget`,
        description: `At current pace, will exceed $${dept.budget.toFixed(0)} budget by ${dateStr}. Projected total: $${projected.toFixed(0)}.`,
        affectedEntities: [{ type: "department", id: dept.dept_id, name: dept.dept_name }],
        linkTo: `/dashboard/departments/${dept.dept_id}`,
      });
    }
  }

  // 6) Cost per output token ranking
  const costRanking = await prisma.$queryRaw<
    Array<{ model: string; cost_per_1k_out: number; total_cost: number; total_output: number }>
  >`
    SELECT model, SUM(cost_usd)::float / NULLIF(SUM(output_tokens), 0) * 1000 AS cost_per_1k_out,
           SUM(cost_usd)::float AS total_cost,
           SUM(output_tokens)::float AS total_output
    FROM usage_records
    WHERE org_id = ${orgId} AND date >= ${thirtyDaysAgo} AND model IS NOT NULL
    GROUP BY model
    HAVING SUM(output_tokens) > 1000 AND SUM(cost_usd)::float > 5
    ORDER BY cost_per_1k_out DESC
    LIMIT 5
  `;

  if (costRanking.length > 0) {
    const topExpensive = costRanking[0];
    suggestions.push({
      id: "cost-ranking",
      category: "cost_optimization",
      type: "cost_per_output",
      severity: "info",
      title: `${topExpensive.model} is the most expensive per output token`,
      description: `$${topExpensive.cost_per_1k_out?.toFixed(4)}/1k output tokens. Total spend: $${topExpensive.total_cost.toFixed(0)} this month. Consider cheaper alternatives for non-critical workloads.`,
      affectedEntities: costRanking.map((r) => ({
        type: "model", id: r.model, name: r.model,
      })),
      linkTo: "/dashboard/models",
    });
  }

  // 7) Average tokens per request (high-context users)
  const avgTokens = await prisma.$queryRaw<
    Array<{ user_id: string; user_name: string; avg_tokens: number; team_avg: number }>
  >`
    WITH user_stats AS (
      SELECT ur.user_id, u.name AS user_name, u.team_id,
             CASE WHEN SUM(ur.requests_count) > 0
                  THEN (SUM(ur.input_tokens) + SUM(ur.output_tokens))::float / SUM(ur.requests_count)
                  ELSE 0 END AS avg_tokens
      FROM usage_records ur
      JOIN org_users u ON ur.user_id = u.id
      WHERE ur.org_id = ${orgId} AND ur.date >= ${thirtyDaysAgo} AND ur.requests_count > 0
      GROUP BY ur.user_id, u.name, u.team_id
      HAVING SUM(ur.requests_count) > 10
    ),
    team_avgs AS (
      SELECT team_id, AVG(avg_tokens) AS team_avg FROM user_stats WHERE team_id IS NOT NULL GROUP BY team_id
    )
    SELECT us.user_id, us.user_name, us.avg_tokens, COALESCE(ta.team_avg, us.avg_tokens) AS team_avg
    FROM user_stats us
    LEFT JOIN team_avgs ta ON us.team_id = ta.team_id
    WHERE us.avg_tokens > COALESCE(ta.team_avg, us.avg_tokens) * 2
    ORDER BY us.avg_tokens DESC
    LIMIT 10
  `;

  if (avgTokens.length > 0) {
    suggestions.push({
      id: "high-context-users",
      category: "efficiency",
      type: "tokens_per_request",
      severity: "info",
      title: `${avgTokens.length} user${avgTokens.length > 1 ? "s" : ""} with unusually large context windows`,
      description: `These users send 2x+ more tokens per request than their team average, potentially due to inefficient prompting patterns.`,
      affectedEntities: avgTokens.map((u) => ({
        type: "user", id: u.user_id, name: u.user_name,
      })),
      linkTo: "/dashboard/users",
    });
  }

  // 8) Departments with no budget configured
  const noBudgetDepts = await prisma.$queryRaw<
    Array<{ dept_id: string; dept_name: string; total_cost: number; user_count: number }>
  >`
    SELECT d.id AS dept_id, d.name AS dept_name,
           COALESCE(SUM(ur.cost_usd), 0)::float AS total_cost,
           COUNT(DISTINCT u.id)::int AS user_count
    FROM departments d
    JOIN org_users u ON u.department_id = d.id AND u.status = 'active'
    LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${thirtyDaysAgo}
    WHERE d.org_id = ${orgId}
      AND (d.monthly_budget IS NULL OR d.monthly_budget = 0)
    GROUP BY d.id, d.name
  `;

  if (noBudgetDepts.length > 0) {
    const withSpend = noBudgetDepts.filter((d) => d.total_cost > 0);
    const totalUnbudgeted = noBudgetDepts.reduce((s, d) => s + d.total_cost, 0);
    suggestions.push({
      id: "missing-budgets",
      category: "budget_alerts",
      type: "missing_budget",
      severity: withSpend.length > 0 ? "warning" : "info",
      title: `${noBudgetDepts.length} department${noBudgetDepts.length > 1 ? "s" : ""} without budget limits`,
      description: withSpend.length > 0
        ? `${withSpend.length} of these have active spend totaling $${totalUnbudgeted.toFixed(0)} this month. Set budgets to prevent uncontrolled costs.`
        : `Configure monthly budgets to get spend alerts and forecasting for these departments.`,
      affectedEntities: noBudgetDepts.map((d) => ({
        type: "department", id: d.dept_id, name: d.dept_name,
      })),
      linkTo: "/dashboard/departments",
    });
  }

  // 9) Users not assigned to a department
  const unassignedUsers = await prisma.orgUser.findMany({
    where: { orgId, status: "active", departmentId: null },
    select: { id: true, name: true },
  });

  if (unassignedUsers.length > 0) {
    suggestions.push({
      id: "unassigned-users",
      category: "seat_management",
      type: "unassigned_department",
      severity: unassignedUsers.length > 10 ? "warning" : "info",
      title: `${unassignedUsers.length} user${unassignedUsers.length > 1 ? "s" : ""} not assigned to a department`,
      description: `These users won't appear in department-level reports, budgets, or benchmarks. Assign them for better cost visibility.`,
      affectedEntities: unassignedUsers.slice(0, 20).map((u) => ({
        type: "user", id: u.id, name: u.name,
      })),
      linkTo: "/dashboard/users",
    });
  }

  // 10) Provider concentration risk (>90% spend on one provider)
  const providerSpend = await prisma.$queryRaw<
    Array<{ provider: string; total_cost: number }>
  >`
    SELECT provider, SUM(cost_usd)::float AS total_cost
    FROM usage_records
    WHERE org_id = ${orgId} AND date >= ${thirtyDaysAgo}
    GROUP BY provider
    HAVING SUM(cost_usd) > 0
  `;

  if (providerSpend.length > 1) {
    const totalProviderSpend = providerSpend.reduce((s, p) => s + p.total_cost, 0);
    const dominant = providerSpend.sort((a, b) => b.total_cost - a.total_cost)[0];
    const dominantPct = totalProviderSpend > 0 ? (dominant.total_cost / totalProviderSpend) * 100 : 0;

    if (dominantPct >= 90 && totalProviderSpend > 10) {
      suggestions.push({
        id: "provider-concentration",
        category: "cost_optimization",
        type: "provider_concentration",
        severity: "info",
        title: `${dominantPct.toFixed(0)}% of spend concentrated on ${dominant.provider}`,
        description: `Diversifying across providers can reduce vendor lock-in risk and leverage competitive pricing. Consider routing non-critical workloads to alternative providers.`,
        affectedEntities: [{ type: "provider", id: dominant.provider, name: dominant.provider }],
        linkTo: "/dashboard/providers",
      });
    }
  }

  // 11) Weekend usage patterns (potential for batch/async processing)
  const weekendData = await prisma.$queryRaw<
    Array<{ weekend_cost: number; weekday_cost: number; weekend_requests: number }>
  >`
    SELECT
      COALESCE(SUM(CASE WHEN EXTRACT(DOW FROM date) IN (0, 6) THEN cost_usd ELSE 0 END), 0)::float AS weekend_cost,
      COALESCE(SUM(CASE WHEN EXTRACT(DOW FROM date) NOT IN (0, 6) THEN cost_usd ELSE 0 END), 0)::float AS weekday_cost,
      COALESCE(SUM(CASE WHEN EXTRACT(DOW FROM date) IN (0, 6) THEN requests_count ELSE 0 END), 0)::int AS weekend_requests
    FROM usage_records
    WHERE org_id = ${orgId} AND date >= ${thirtyDaysAgo}
  `;

  if (weekendData[0]) {
    const wd = weekendData[0];
    const total = wd.weekend_cost + wd.weekday_cost;
    const weekendPct = total > 0 ? (wd.weekend_cost / total) * 100 : 0;
    if (weekendPct > 25 && wd.weekend_cost > 20) {
      suggestions.push({
        id: "weekend-usage",
        category: "efficiency",
        type: "weekend_usage",
        severity: "info",
        title: `${weekendPct.toFixed(0)}% of spend occurs on weekends`,
        description: `$${wd.weekend_cost.toFixed(0)} spent on ${wd.weekend_requests.toLocaleString()} weekend requests this month. If these are automated workloads, consider using batch APIs or off-peak pricing.`,
        estimatedSavings: Math.round(wd.weekend_cost * 0.3),
        affectedEntities: [],
      });
    }
  }

  // 12) Low overall acceptance rate (for orgs using Cursor/copilot)
  const acceptanceData = await prisma.$queryRaw<
    Array<{ total_accepted: number; total_suggested: number }>
  >`
    SELECT COALESCE(SUM(lines_accepted), 0)::float AS total_accepted,
           COALESCE(SUM(lines_suggested), 0)::float AS total_suggested
    FROM usage_records
    WHERE org_id = ${orgId} AND date >= ${thirtyDaysAgo} AND lines_suggested > 0
  `;

  if (acceptanceData[0]?.total_suggested > 100) {
    const ad = acceptanceData[0];
    const acceptRate = ad.total_accepted / ad.total_suggested;
    if (acceptRate < 0.15) {
      suggestions.push({
        id: "low-acceptance",
        category: "efficiency",
        type: "low_acceptance_rate",
        severity: "warning",
        title: `Low code acceptance rate: ${(acceptRate * 100).toFixed(1)}%`,
        description: `Only ${Math.round(ad.total_accepted)} of ${Math.round(ad.total_suggested)} suggested lines were accepted. This could indicate poor prompt quality, model mismatch, or developers not finding suggestions useful.`,
        affectedEntities: [],
        linkTo: "/dashboard/analytics",
      });
    } else if (acceptRate < 0.25) {
      suggestions.push({
        id: "low-acceptance",
        category: "efficiency",
        type: "low_acceptance_rate",
        severity: "info",
        title: `Code acceptance rate could improve: ${(acceptRate * 100).toFixed(1)}%`,
        description: `${Math.round(ad.total_accepted)} of ${Math.round(ad.total_suggested)} suggested lines accepted. Industry benchmarks typically target 30%+. Consider training sessions on effective prompting.`,
        affectedEntities: [],
        linkTo: "/dashboard/analytics",
      });
    }
  }

  suggestions.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity] || (b.estimatedSavings ?? 0) - (a.estimatedSavings ?? 0);
  });

  const totalSavings = suggestions.reduce((s, v) => s + (v.estimatedSavings ?? 0), 0);

  return NextResponse.json({
    suggestions,
    summary: {
      total: suggestions.length,
      critical: suggestions.filter((s) => s.severity === "critical").length,
      warning: suggestions.filter((s) => s.severity === "warning").length,
      info: suggestions.filter((s) => s.severity === "info").length,
      totalEstimatedSavings: totalSavings,
    },
  });
}
