export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export interface TierEntry {
  substrings: string[];
  tier: number;
}

export interface PricingEntry {
  substrings: string[];
  displayName: string;
  vendor: string;
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_TIERS: TierEntry[] = [
  { substrings: ["o3", "o1", "claude-opus", "opus", "gemini-2.5-pro"], tier: 1.0 },
  { substrings: ["gpt-4.1"], tier: 0.9 },
  { substrings: ["gpt-4o", "cursor-slow"], tier: 0.85 },
  { substrings: ["claude-sonnet", "sonnet"], tier: 0.65 },
  { substrings: ["gemini-2.5-flash", "gemini-2.0-flash", "o3-mini"], tier: 0.6 },
  { substrings: ["cursor-fast", "gpt-4o-mini"], tier: 0.5 },
  { substrings: ["claude-haiku", "haiku"], tier: 0.4 },
  { substrings: ["gemini-flash", "gemini-1.5-flash"], tier: 0.35 },
];

export const PRICING_TABLE: PricingEntry[] = [
  { substrings: ["o3"], displayName: "O3", vendor: "OpenAI", inputPer1M: 10.0, outputPer1M: 40.0 },
  { substrings: ["o1"], displayName: "O1", vendor: "OpenAI", inputPer1M: 15.0, outputPer1M: 60.0 },
  { substrings: ["gpt-4.1"], displayName: "GPT-4.1", vendor: "OpenAI", inputPer1M: 2.0, outputPer1M: 8.0 },
  { substrings: ["gpt-4o-mini"], displayName: "GPT-4o mini", vendor: "OpenAI", inputPer1M: 0.15, outputPer1M: 0.6 },
  { substrings: ["gpt-4o"], displayName: "GPT-4o", vendor: "OpenAI", inputPer1M: 2.5, outputPer1M: 10.0 },
  { substrings: ["claude-opus", "opus"], displayName: "Claude Opus", vendor: "Anthropic", inputPer1M: 15.0, outputPer1M: 75.0 },
  { substrings: ["claude-sonnet", "sonnet"], displayName: "Claude Sonnet", vendor: "Anthropic", inputPer1M: 3.0, outputPer1M: 15.0 },
  { substrings: ["claude-haiku", "haiku"], displayName: "Claude Haiku", vendor: "Anthropic", inputPer1M: 0.8, outputPer1M: 4.0 },
  { substrings: ["gemini-2.5-pro"], displayName: "Gemini 2.5 Pro", vendor: "Google", inputPer1M: 1.25, outputPer1M: 10.0 },
  { substrings: ["gemini-2.5-flash"], displayName: "Gemini 2.5 Flash", vendor: "Google", inputPer1M: 0.15, outputPer1M: 0.6 },
  { substrings: ["gemini-2.0-flash"], displayName: "Gemini 2.0 Flash", vendor: "Google", inputPer1M: 0.10, outputPer1M: 0.4 },
  { substrings: ["gemini-flash", "gemini-1.5-flash"], displayName: "Gemini 1.5 Flash", vendor: "Google", inputPer1M: 0.10, outputPer1M: 0.4 },
  { substrings: ["cursor-slow"], displayName: "Cursor Slow", vendor: "Cursor", inputPer1M: 2.5, outputPer1M: 10.0 },
  { substrings: ["cursor-fast"], displayName: "Cursor Fast", vendor: "Cursor", inputPer1M: 0.15, outputPer1M: 0.6 },
];

const UNKNOWN_PRICING: ModelPricing = { inputPer1M: 2.5, outputPer1M: 10.0 };
const DEFAULT_TIER = 0.5;

const VENDOR_RULES: { substrings: string[]; vendor: string }[] = [
  { substrings: ["gpt-", "o1", "o3"], vendor: "OpenAI" },
  { substrings: ["claude-"], vendor: "Anthropic" },
  { substrings: ["gemini"], vendor: "Google" },
  { substrings: ["cursor-"], vendor: "Cursor" },
];

function matchesSubstring(model: string, substrings: string[]): boolean {
  const lc = model.toLowerCase();
  return substrings.some((s) => lc.includes(s.toLowerCase()));
}

export function getModelTier(model: string | undefined): number {
  if (!model) return DEFAULT_TIER;
  let best = DEFAULT_TIER;
  for (const entry of MODEL_TIERS) {
    if (matchesSubstring(model, entry.substrings) && entry.tier > best) {
      best = entry.tier;
    }
  }
  return best;
}

export function getModelPricing(model: string | undefined): ModelPricing {
  if (!model) return UNKNOWN_PRICING;
  for (const entry of PRICING_TABLE) {
    if (matchesSubstring(model, entry.substrings)) {
      return { inputPer1M: entry.inputPer1M, outputPer1M: entry.outputPer1M };
    }
  }
  return UNKNOWN_PRICING;
}

export function getPricingEntry(model: string | undefined): PricingEntry | null {
  if (!model) return null;
  for (const entry of PRICING_TABLE) {
    if (matchesSubstring(model, entry.substrings)) {
      return entry;
    }
  }
  return null;
}

const PROVIDER_CANONICAL: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "google ai": "Google",
  gemini: "Google",
  cursor: "Cursor",
};

export function getVendor(model: string | undefined, provider?: string): string | null {
  if (provider) {
    const canonical = PROVIDER_CANONICAL[provider.toLowerCase()];
    if (canonical) return canonical;
  }
  if (!model) return null;
  for (const rule of VENDOR_RULES) {
    if (matchesSubstring(model, rule.substrings)) {
      return rule.vendor;
    }
  }
  return null;
}
