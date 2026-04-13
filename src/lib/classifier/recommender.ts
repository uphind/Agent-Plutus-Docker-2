import type { ClassifiedRow, RecommendedRow, CategoryName } from "./types";
import { PRICING_TABLE, getModelPricing, getPricingEntry, getVendor, type PricingEntry } from "./pricing";

const DISCOUNT_THRESHOLD = 0.95;

interface Candidate {
  entry: PricingEntry;
  projectedCost: number;
  costPer1M: number;
}

function blendedCostPer1M(inputPer1M: number, outputPer1M: number, totalInput: number, totalOutput: number): number {
  const totalTokens = totalInput + totalOutput;
  if (totalTokens === 0) return 0;
  return (inputPer1M * totalInput + outputPer1M * totalOutput) / totalTokens;
}

function projectedCost(inputPer1M: number, outputPer1M: number, totalInput: number, totalOutput: number): number {
  return (inputPer1M * totalInput + outputPer1M * totalOutput) / 1_000_000;
}

function currentModelMatchesCandidate(model: string, entry: PricingEntry): boolean {
  const lc = model.toLowerCase();
  return entry.substrings.some((s) => lc.includes(s.toLowerCase()));
}

function findCheapest(
  candidates: Candidate[],
  currentCostPer1M: number
): Candidate | null {
  const qualifying = candidates.filter(
    (c) => c.costPer1M < currentCostPer1M * DISCOUNT_THRESHOLD
  );
  if (qualifying.length === 0) return null;

  qualifying.sort((a, b) => {
    if (a.projectedCost !== b.projectedCost) return a.projectedCost - b.projectedCost;
    const aLabel = `${a.entry.vendor} — ${a.entry.displayName}`;
    const bLabel = `${b.entry.vendor} — ${b.entry.displayName}`;
    return aLabel.localeCompare(bLabel);
  });
  return qualifying[0];
}

function formatRecommendation(entry: PricingEntry): string {
  return `${entry.vendor} — \u27A1\uFE0F ${entry.displayName}`;
}

const CATEGORY_PROFILES: Record<CategoryName, string> = {
  "\u{1F9D1}\u200D\u{1F4BB} Power / Technical":
    "You are a heavy user with large or frequent requests, so small differences in per-token price add up to large amounts over a month.",
  "\u270D\uFE0F Content Generator":
    "You produce a lot of model output, so output-token pricing dominates your bill; a cheaper model that still passes your quality bar can cut spend sharply.",
  "\u{1F4AC} Conversational":
    "Your usage is balanced between input and output. A cheaper model for routine conversations can reduce costs while preserving quality for most tasks.",
  "\u{1F50D} Lookup / Q&A":
    "Your requests are mostly short lookups, so per-request costs are low but volume adds up. A lighter model usually handles Q&A equally well.",
  "\u{1F9EA} Explorer":
    "Your usage is still fairly light, so you often do not need the most expensive model tier to get useful answers.",
};

function getModelDisplayName(model: string): string {
  const entry = getPricingEntry(model);
  if (entry) return entry.displayName;
  return model;
}

function buildExplanation(
  row: ClassifiedRow,
  globalRec: Candidate | null,
  sameVendorRec: Candidate | null,
  rowVendor: string | null
): { explanation: string; whyCheaper: string } {
  const parts: string[] = [`Category: ${row.category}.`];

  if (globalRec) {
    parts.push(`Global best: ${formatRecommendation(globalRec.entry)}.`);
  } else {
    parts.push("No \u22655% cheaper model in full catalog.");
  }

  if (sameVendorRec) {
    parts.push(`Same vendor (${rowVendor ?? "unknown"}): ${formatRecommendation(sameVendorRec.entry)}.`);
  } else {
    parts.push(
      `Same vendor (${rowVendor ?? "unknown"}): already on cheapest listed tier or no \u22655% cheaper option.`
    );
  }

  const profile = CATEGORY_PROFILES[row.category] ?? "";
  const modelDisplay = getModelDisplayName(row.model);
  const whyParts: string[] = [
    `${profile} You are on ${modelDisplay} (model id "${row.model}").`,
  ];

  if (!globalRec && !sameVendorRec) {
    whyParts.push(
      "None of the catalog models we price would cut your estimated bill by at least 5% for this same pattern of input and output tokens, so we are not suggesting a move on cost alone."
    );
  } else {
    whyParts.push(
      "The following options use public list prices and your recorded input/output mix; each is at least roughly 5% cheaper than your current tier for that mix."
    );

    if (globalRec) {
      const savingsPct = row.total_cost_usd > 0
        ? Math.round(((globalRec.projectedCost > 0
            ? (1 - globalRec.projectedCost / (row.total_cost_usd > 0 ? row.total_cost_usd : 1)) : 0) * 100))
        : 0;
      const savingsAmt = row.total_cost_usd - globalRec.projectedCost;
      whyParts.push(
        `If you can switch providers, ${formatRecommendation(globalRec.entry).replace(" — \u27A1\uFE0F ", " ")} is the cheapest option we catalog: at list prices that would be roughly ${Math.abs(savingsPct)}% lower modeled cost ($${savingsAmt.toFixed(2)} less on this user-and-model total at list prices) assuming your prompts and quality needs stay the same\u2014validate with a pilot before committing.`
      );
    }

    if (sameVendorRec) {
      const sameSavingsPct = row.total_cost_usd > 0
        ? Math.round(((1 - sameVendorRec.projectedCost / (row.total_cost_usd > 0 ? row.total_cost_usd : 1)) * 100))
        : 0;
      const sameSavingsAmt = row.total_cost_usd - sameVendorRec.projectedCost;

      if (globalRec && currentModelMatchesCandidate(sameVendorRec.entry.displayName, globalRec.entry)) {
        whyParts.push(
          "The best choice for your current vendor matches the global cheapest option, so one move satisfies both staying within your vendor rules and minimizing cost."
        );
      } else {
        whyParts.push(
          `If you must stay with ${rowVendor}, ${sameVendorRec.entry.displayName} is the cheapest qualifying model we still list for that vendor: roughly ${Math.abs(sameSavingsPct)}% lower modeled cost ($${sameSavingsAmt.toFixed(2)} less on this user-and-model total at list prices) compared with your current model, subject to the same quality checks.`
        );
      }
    }
  }

  return {
    explanation: parts.join(" "),
    whyCheaper: whyParts.join(" "),
  };
}

export function recommendDual(row: ClassifiedRow): RecommendedRow {
  const currentPricing = getModelPricing(row.model);
  const currentCostPer1M = blendedCostPer1M(
    currentPricing.inputPer1M,
    currentPricing.outputPer1M,
    row.total_input,
    row.total_output
  );

  const rowVendor = getVendor(row.model, row.provider);

  const allCandidates: Candidate[] = [];
  const sameVendorCandidates: Candidate[] = [];

  for (const entry of PRICING_TABLE) {
    if (currentModelMatchesCandidate(row.model, entry)) continue;

    const proj = projectedCost(entry.inputPer1M, entry.outputPer1M, row.total_input, row.total_output);
    const costPM = blendedCostPer1M(entry.inputPer1M, entry.outputPer1M, row.total_input, row.total_output);
    const candidate: Candidate = { entry, projectedCost: proj, costPer1M: costPM };

    allCandidates.push(candidate);

    if (rowVendor && entry.vendor === rowVendor) {
      sameVendorCandidates.push(candidate);
    }
  }

  const globalBest = findCheapest(allCandidates, currentCostPer1M);
  const sameVendorBest = findCheapest(sameVendorCandidates, currentCostPer1M);

  const estSavingsGlobal = globalBest
    ? Math.round((row.total_cost_usd - globalBest.projectedCost) * 10000) / 10000
    : null;
  const estSavingsSameVendor = sameVendorBest
    ? Math.round((row.total_cost_usd - sameVendorBest.projectedCost) * 10000) / 10000
    : null;

  const { explanation, whyCheaper } = buildExplanation(row, globalBest, sameVendorBest, rowVendor);

  return {
    ...row,
    recommendation_global: globalBest ? formatRecommendation(globalBest.entry) : "\u2014",
    is_cheaper_global: !!globalBest,
    est_savings_global_usd: estSavingsGlobal,
    recommendation_same_vendor: sameVendorBest ? formatRecommendation(sameVendorBest.entry) : "\u2014",
    is_cheaper_same_vendor: !!sameVendorBest,
    est_savings_same_vendor_usd: estSavingsSameVendor,
    explanation,
    why_cheaper_plain_english: whyCheaper,
  };
}

export function recommendAll(rows: ClassifiedRow[]): RecommendedRow[] {
  return rows.map(recommendDual);
}
