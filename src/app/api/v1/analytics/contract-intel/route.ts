import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

const PROVIDER_TIERS: Record<string, Array<{ threshold: number; discount: string; name: string }>> = {
  anthropic: [
    { threshold: 10000, discount: "5%", name: "Growth" },
    { threshold: 25000, discount: "10%", name: "Scale" },
    { threshold: 50000, discount: "15%", name: "Enterprise" },
  ],
  openai: [
    { threshold: 5000, discount: "5%", name: "Tier 3" },
    { threshold: 20000, discount: "10%", name: "Tier 4" },
    { threshold: 50000, discount: "15%", name: "Tier 5" },
  ],
};

const MODEL_SUBSTITUTIONS: Record<string, { replacement: string; costReductionPct: number; qualityImpactPct: number }> = {
  "claude-3-opus-20240229": { replacement: "claude-3-5-sonnet-20241022", costReductionPct: 80, qualityImpactPct: 3 },
  "claude-3-opus": { replacement: "claude-3-5-sonnet", costReductionPct: 80, qualityImpactPct: 3 },
  "claude-opus-4": { replacement: "claude-sonnet-4", costReductionPct: 80, qualityImpactPct: 2 },
  "gpt-4-turbo": { replacement: "gpt-4o-mini", costReductionPct: 93, qualityImpactPct: 8 },
  "gpt-4": { replacement: "gpt-4o-mini", costReductionPct: 95, qualityImpactPct: 10 },
  "gpt-4o": { replacement: "gpt-4o-mini", costReductionPct: 85, qualityImpactPct: 5 },
};

export async function GET() {
  const orgId = await getOrgId();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const providerSpend = await prisma.$queryRawUnsafe<
    Array<{ provider: string; monthly_spend: number }>
  >(
    `SELECT provider::text, SUM(cost_usd)::float AS monthly_spend
     FROM usage_records
     WHERE org_id = '${orgId}' AND date >= '${thirtyDaysAgo.toISOString()}'
     GROUP BY provider
     ORDER BY monthly_spend DESC`
  );

  const tierAlerts: Array<{
    provider: string;
    currentSpend: number;
    currentTier: string | null;
    nextTier: string | null;
    nextThreshold: number | null;
    potentialDiscount: string | null;
  }> = [];

  for (const ps of providerSpend) {
    const tiers = PROVIDER_TIERS[ps.provider];
    if (!tiers) continue;

    let currentTier: string | null = null;
    let nextTier: string | null = null;
    let nextThreshold: number | null = null;
    let potentialDiscount: string | null = null;

    for (let i = 0; i < tiers.length; i++) {
      if (ps.monthly_spend >= tiers[i].threshold) {
        currentTier = tiers[i].name;
      } else {
        nextTier = tiers[i].name;
        nextThreshold = tiers[i].threshold;
        potentialDiscount = tiers[i].discount;
        break;
      }
    }

    if (nextTier && nextThreshold && ps.monthly_spend >= nextThreshold * 0.8) {
      tierAlerts.push({
        provider: ps.provider,
        currentSpend: ps.monthly_spend,
        currentTier,
        nextTier,
        nextThreshold,
        potentialDiscount,
      });
    }
  }

  const modelSpend = await prisma.$queryRawUnsafe<
    Array<{ model: string; provider: string; total_cost: number; total_requests: number; total_input: number; total_output: number }>
  >(
    `SELECT model, provider::text, SUM(cost_usd)::float AS total_cost,
            SUM(requests_count)::bigint AS total_requests,
            SUM(input_tokens)::bigint AS total_input,
            SUM(output_tokens)::bigint AS total_output
     FROM usage_records
     WHERE org_id = '${orgId}' AND date >= '${thirtyDaysAgo.toISOString()}'
       AND model IS NOT NULL
     GROUP BY model, provider
     HAVING SUM(cost_usd) > 5
     ORDER BY total_cost DESC`
  );

  const substitutionAdvisory = modelSpend
    .filter((m) => {
      const key = Object.keys(MODEL_SUBSTITUTIONS).find((k) => m.model.includes(k));
      return !!key;
    })
    .map((m) => {
      const key = Object.keys(MODEL_SUBSTITUTIONS).find((k) => m.model.includes(k))!;
      const sub = MODEL_SUBSTITUTIONS[key];
      const potentialSavings = m.total_cost * (sub.costReductionPct / 100);
      return {
        currentModel: m.model,
        replacementModel: sub.replacement,
        currentCost: m.total_cost,
        potentialSavings,
        costReductionPct: sub.costReductionPct,
        qualityImpactPct: sub.qualityImpactPct,
        requestCount: Number(m.total_requests),
      };
    })
    .sort((a, b) => b.potentialSavings - a.potentialSavings);

  const spendTrends = await prisma.$queryRawUnsafe<
    Array<{ provider: string; recent_cost: number; prior_cost: number }>
  >(
    `SELECT provider::text,
       SUM(CASE WHEN date >= '${thirtyDaysAgo.toISOString()}' THEN cost_usd ELSE 0 END)::float AS recent_cost,
       SUM(CASE WHEN date >= '${sixtyDaysAgo.toISOString()}' AND date < '${thirtyDaysAgo.toISOString()}' THEN cost_usd ELSE 0 END)::float AS prior_cost
     FROM usage_records
     WHERE org_id = '${orgId}' AND date >= '${sixtyDaysAgo.toISOString()}'
     GROUP BY provider`
  );

  const projections = spendTrends.map((t) => {
    const monthlyGrowth = t.prior_cost > 0 ? ((t.recent_cost - t.prior_cost) / t.prior_cost) : 0;
    return {
      provider: t.provider,
      currentMonthly: t.recent_cost,
      previousMonthly: t.prior_cost,
      monthlyGrowthRate: monthlyGrowth,
      projected3m: t.recent_cost * (1 + monthlyGrowth) ** 3,
      projected6m: t.recent_cost * (1 + monthlyGrowth) ** 6,
      projected12m: t.recent_cost * (1 + monthlyGrowth) ** 12,
    };
  });

  const totalSubstitutionSavings = substitutionAdvisory.reduce((s, a) => s + a.potentialSavings, 0);

  return NextResponse.json({
    providerSpend,
    tierAlerts,
    substitutionAdvisory,
    spendProjections: projections,
    totalPotentialSavings: totalSubstitutionSavings,
  });
}
