import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

/**
 * GET /api/v1/settings/ai-usage?days=30&source=chatbot
 *
 * Aggregates entries from the AiUsageLog table written by /api/v1/ai-chat
 * and /api/v1/providers/ai-suggest-mapping into:
 *
 *   - totals (input/output/cached tokens, request count, total cost)
 *   - per-day series (for the sparkline)
 *   - per-(provider, model) breakdown table
 *
 * Optionally surfaces a "providerReport" block when the user has the matching
 * Anthropic or OpenAI admin provider connected on the Providers tab — but
 * for now we return `available: false` with an explanatory note. Wiring the
 * official provider cost reports here is a larger ask and the in-app counter
 * already covers the common case.
 */

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  source: z.enum(["chatbot", "mapping", "all"]).default("chatbot"),
});

export async function GET(request: NextRequest) {
  let orgId: string;
  try {
    orgId = await getOrgId();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to identify organization" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    days: searchParams.get("days") ?? undefined,
    source: searchParams.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { days, source } = parsed.data;
  const since = new Date(Date.now() - days * 86400_000);

  const where = {
    orgId,
    createdAt: { gte: since },
    ...(source === "all" ? {} : { source }),
  };

  const logs = await prisma.aiUsageLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      provider: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
      costUsd: true,
      createdAt: true,
    },
  });

  // Totals
  const totals = logs.reduce(
    (acc, l) => ({
      inputTokens: acc.inputTokens + l.inputTokens,
      outputTokens: acc.outputTokens + l.outputTokens,
      cachedTokens: acc.cachedTokens + l.cachedTokens,
      requests: acc.requests + 1,
      costUsd: acc.costUsd + (l.costUsd ? Number(l.costUsd) : 0),
      hasAnyCost: acc.hasAnyCost || l.costUsd !== null,
    }),
    { inputTokens: 0, outputTokens: 0, cachedTokens: 0, requests: 0, costUsd: 0, hasAnyCost: false }
  );

  // Per-day series — pad missing days with zeros so the sparkline is contiguous.
  const byDayMap = new Map<string, { date: string; inputTokens: number; outputTokens: number; requests: number; costUsd: number; hasCost: boolean }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86400_000);
    const key = d.toISOString().split("T")[0];
    byDayMap.set(key, { date: key, inputTokens: 0, outputTokens: 0, requests: 0, costUsd: 0, hasCost: false });
  }
  for (const l of logs) {
    const key = l.createdAt.toISOString().split("T")[0];
    const bucket = byDayMap.get(key);
    if (!bucket) continue;
    bucket.inputTokens += l.inputTokens;
    bucket.outputTokens += l.outputTokens;
    bucket.requests += 1;
    if (l.costUsd !== null) {
      bucket.costUsd += Number(l.costUsd);
      bucket.hasCost = true;
    }
  }
  const byDay = [...byDayMap.values()].map((b) => ({
    date: b.date,
    inputTokens: b.inputTokens,
    outputTokens: b.outputTokens,
    requests: b.requests,
    costUsd: b.hasCost ? Math.round(b.costUsd * 1_000_000) / 1_000_000 : null,
  }));

  // Per-(provider, model) table.
  const byModelMap = new Map<
    string,
    { provider: string; model: string; inputTokens: number; outputTokens: number; requests: number; costUsd: number; hasCost: boolean }
  >();
  for (const l of logs) {
    const key = `${l.provider}::${l.model}`;
    let bucket = byModelMap.get(key);
    if (!bucket) {
      bucket = {
        provider: l.provider,
        model: l.model,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        costUsd: 0,
        hasCost: false,
      };
      byModelMap.set(key, bucket);
    }
    bucket.inputTokens += l.inputTokens;
    bucket.outputTokens += l.outputTokens;
    bucket.requests += 1;
    if (l.costUsd !== null) {
      bucket.costUsd += Number(l.costUsd);
      bucket.hasCost = true;
    }
  }
  const byModel = [...byModelMap.values()]
    .sort((a, b) => b.requests - a.requests)
    .map((m) => ({
      provider: m.provider,
      model: m.model,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      requests: m.requests,
      costUsd: m.hasCost ? Math.round(m.costUsd * 1_000_000) / 1_000_000 : null,
    }));

  // "providerReport" block — surfaces whether an admin provider exists that
  // could give an official cost figure. Actually fetching it on every request
  // would be expensive and lag-y; the dedicated Providers / Analytics views
  // already render the official cost reports.
  const adminProvider = await prisma.providerCredential.findFirst({
    where: { orgId, isActive: true, provider: { in: ["openai", "anthropic"] } },
    select: { provider: true },
  });
  const providerReport = {
    available: !!adminProvider,
    provider: adminProvider?.provider ?? undefined,
    note: adminProvider
      ? "See the Analytics tab for the official cost report from your connected provider."
      : "Connect an OpenAI or Anthropic admin provider on the Providers tab for an official cost report.",
  };

  return NextResponse.json({
    days,
    source,
    totals: {
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cachedTokens: totals.cachedTokens,
      requests: totals.requests,
      costUsd: totals.hasAnyCost ? Math.round(totals.costUsd * 1_000_000) / 1_000_000 : null,
    },
    byDay,
    byModel,
    providerReport,
  });
}
