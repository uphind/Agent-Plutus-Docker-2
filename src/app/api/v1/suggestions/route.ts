import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

interface Suggestion {
  id: string;
  category: "cost_optimization" | "budget_alerts" | "seat_management" | "efficiency";
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  estimatedSavings?: number;
  affectedEntities: Array<{ type: string; id: string; name: string }>;
  linkTo?: string;
}

const EXPENSIVE_MODELS: Record<string, string> = {
  "claude-3-opus-20240229": "claude-3-5-sonnet-20241022",
  "claude-3-opus": "claude-3-5-sonnet",
  "gpt-4o": "gpt-4o-mini",
  "gpt-4-turbo": "gpt-4o-mini",
  "gpt-4": "gpt-4o-mini",
  "claude-opus-4": "claude-sonnet-4",
};

const MODEL_COST_PER_1K: Record<string, { input: number; output: number }> = {
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
  "claude-opus-4": { input: 0.015, output: 0.075 },
  "claude-sonnet-4": { input: 0.003, output: 0.015 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4": { input: 0.03, output: 0.06 },
};

export async function GET() {
  const orgId = await getOrgId();
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
    WHERE org_id = ${orgId} AND date >= ${monthStart}
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

  // 2) Model substitution savings
  const modelSpend = await prisma.$queryRaw<
    Array<{
      model: string; user_id: string; user_name: string;
      total_cost: number; total_input: number; total_output: number;
      team_id: string | null; team_name: string | null;
    }>
  >`
    SELECT ur.model, ur.user_id, u.name AS user_name,
           SUM(ur.cost_usd)::float AS total_cost,
           SUM(ur.input_tokens)::float AS total_input,
           SUM(ur.output_tokens)::float AS total_output,
           u.team_id, t.name AS team_name
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE ur.org_id = ${orgId} AND ur.date >= ${monthStart} AND ur.model IS NOT NULL
    GROUP BY ur.model, ur.user_id, u.name, u.team_id, t.name
    HAVING SUM(ur.cost_usd)::float > 20
  `;

  const modelSubGroups = new Map<string, typeof modelSpend>();
  for (const row of modelSpend) {
    const cheaperModel = Object.entries(EXPENSIVE_MODELS).find(([exp]) =>
      row.model?.includes(exp)
    );
    if (cheaperModel) {
      const key = row.model!;
      if (!modelSubGroups.has(key)) modelSubGroups.set(key, []);
      modelSubGroups.get(key)!.push(row);
    }
  }

  for (const [expensiveModel, users] of modelSubGroups) {
    const cheaperKey = Object.entries(EXPENSIVE_MODELS).find(([exp]) =>
      expensiveModel.includes(exp)
    )?.[1];
    if (!cheaperKey) continue;

    const expCost = MODEL_COST_PER_1K[expensiveModel] ??
      Object.entries(MODEL_COST_PER_1K).find(([k]) => expensiveModel.includes(k))?.[1];
    const cheapCost = MODEL_COST_PER_1K[cheaperKey];
    if (!expCost || !cheapCost) continue;

    const totalCurrent = users.reduce((s, u) => s + u.total_cost, 0);
    const totalInput = users.reduce((s, u) => s + u.total_input, 0);
    const totalOutput = users.reduce((s, u) => s + u.total_output, 0);
    const cheaperCost = (totalInput / 1000) * cheapCost.input + (totalOutput / 1000) * cheapCost.output;
    const savings = totalCurrent - cheaperCost;

    if (savings > 10) {
      suggestions.push({
        id: `model-sub-${expensiveModel}`,
        category: "cost_optimization",
        type: "model_substitution",
        severity: savings > 100 ? "warning" : "info",
        title: `Switch ${users.length} user${users.length > 1 ? "s" : ""} from ${expensiveModel} to ${cheaperKey}`,
        description: `Estimated savings: $${savings.toFixed(0)}/mo. These users spent $${totalCurrent.toFixed(0)} on ${expensiveModel} this month.`,
        estimatedSavings: Math.round(savings),
        affectedEntities: users.map((u) => ({
          type: "user", id: u.user_id, name: u.user_name,
        })),
        linkTo: "/dashboard/models",
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
    WHERE org_id = ${orgId} AND date >= ${monthStart}
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
    WHERE org_id = ${orgId} AND date >= ${monthStart} AND model IS NOT NULL
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
      WHERE ur.org_id = ${orgId} AND ur.date >= ${monthStart} AND ur.requests_count > 0
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
