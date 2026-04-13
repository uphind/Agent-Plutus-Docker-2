import type { AggregatedUserModel, CategoryName, ClassifiedRow } from "./types";

export function classify(row: AggregatedUserModel): CategoryName {
  const reqs = row.total_requests;
  const rpd = row.requests_per_day;
  const avgIn = row.avg_input;
  const ratio = row.ratio;
  const tier = row.model_tier;
  const model = (row.model ?? "").toLowerCase();
  const provider = (row.provider ?? "").toLowerCase();
  const wsr = row.web_search_requests;
  const tools = row.tool_turns;

  // Priority 1: Explorer
  if (reqs < 20 && rpd < 1.5) {
    return "\u{1F9EA} Explorer";
  }

  // Priority 2: Power / Technical — Cursor models
  if (model.includes("cursor") || provider === "cursor") {
    return "\u{1F9D1}\u200D\u{1F4BB} Power / Technical";
  }

  // Priority 3: Power / Technical — Opus
  if (model.includes("opus")) {
    return "\u{1F9D1}\u200D\u{1F4BB} Power / Technical";
  }

  // Priority 4: Power / Technical — tool/search heavy
  if (tools >= 8 || wsr >= 6) {
    return "\u{1F9D1}\u200D\u{1F4BB} Power / Technical";
  }

  // Priority 5: Power / Technical — high volume / big inputs / Sonnet heavy / flagship heavy
  if (
    rpd > 3.6 ||
    avgIn > 15000 ||
    (model.includes("sonnet") && (avgIn > 10000 || rpd > 3.2)) ||
    (tier >= 0.85 && reqs > 50)
  ) {
    return "\u{1F9D1}\u200D\u{1F4BB} Power / Technical";
  }

  // Priority 6: Lookup / Q&A
  if (avgIn < 6500 && ratio < 0.73) {
    return "\u{1F50D} Lookup / Q&A";
  }

  // Priority 7: Content Generator
  if (ratio > 0.76 && avgIn < 12000) {
    return "\u270D\uFE0F Content Generator";
  }

  // Priority 8: Conversational
  if (rpd >= 1.5 && rpd <= 3.6 && avgIn >= 6500 && avgIn <= 15000) {
    return "\u{1F4AC} Conversational";
  }

  // Priority 9: Default
  return "\u{1F4AC} Conversational";
}

export function classifyRow(row: AggregatedUserModel): ClassifiedRow {
  return { ...row, category: classify(row) };
}

export function classifyAll(rows: AggregatedUserModel[]): ClassifiedRow[] {
  return rows.map(classifyRow);
}
