export interface RawUsageRow {
  user_email: string;
  input_tokens: number;
  output_tokens: number;
  user_name?: string;
  date?: string;
  model?: string;
  provider?: string;
  department?: string;
  team?: string;
  requests_count?: number;
  cached_tokens?: number;
  cost_usd?: number;
  web_search_requests?: number;
  tool_turns?: number;
  lines_accepted?: number;
  lines_suggested?: number;
}

export type CategoryName =
  | "\u{1F9D1}\u200D\u{1F4BB} Power / Technical"
  | "\u270D\uFE0F Content Generator"
  | "\u{1F4AC} Conversational"
  | "\u{1F50D} Lookup / Q&A"
  | "\u{1F9EA} Explorer";

export interface AggregatedUserModel {
  user_email: string;
  user_name: string;
  department: string;
  team: string;
  provider: string;
  model: string;
  total_requests: number;
  total_input: number;
  total_output: number;
  total_cached: number;
  total_cost_usd: number;
  active_days: number;
  requests_per_day: number;
  avg_input: number;
  avg_output: number;
  ratio: number;
  model_tier: number;
  cache_rate: number;
  web_search_requests: number;
  tool_turns: number;
}

export interface ClassifiedRow extends AggregatedUserModel {
  category: CategoryName;
}

export interface RecommendedRow extends ClassifiedRow {
  recommendation_global: string;
  is_cheaper_global: boolean;
  est_savings_global_usd: number | null;
  recommendation_same_vendor: string;
  is_cheaper_same_vendor: boolean;
  est_savings_same_vendor_usd: number | null;
  explanation: string;
  why_cheaper_plain_english: string;
}

export interface ClassifySummary {
  totalRows: number;
  totalCost: number;
  estSavingsGlobal: number;
  estSavingsSameVendor: number;
  forecastCostGlobal: number;
  savingPctGlobal: number;
  vendorsDetected: string[];
  modelsDetected: string[];
  categoryCounts: Record<string, number>;
}
