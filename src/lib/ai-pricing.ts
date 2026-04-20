/**
 * Per-million-token pricing for the chat / mapping models we route through
 * /api/v1/ai-chat and /api/v1/providers/ai-suggest-mapping.
 *
 * Numbers are USD per 1,000,000 tokens, rounded for stability. We deliberately
 * keep this list small and intent-aligned with the AI Assistant's Provider
 * dropdown — exotic models simply return null cost (token counts still log).
 *
 * Pricing snapshot: April 2026. Update freely; the fallback for unknown models
 * is "no cost computed" so getting it wrong silently is hard.
 */

export interface ModelPricing {
  /** USD per 1M input (prompt) tokens. */
  inputPer1M: number;
  /** USD per 1M output (completion) tokens. */
  outputPer1M: number;
  /** Optional cached/discounted input rate (OpenAI cached prompts, Anthropic prompt cache reads). */
  cachedInputPer1M?: number;
}

const OPENAI_PRICING: Record<string, ModelPricing> = {
  "gpt-4o":            { inputPer1M: 2.5,  outputPer1M: 10.0, cachedInputPer1M: 1.25 },
  "gpt-4o-mini":       { inputPer1M: 0.15, outputPer1M: 0.6,  cachedInputPer1M: 0.075 },
  "gpt-4.1":           { inputPer1M: 2.0,  outputPer1M: 8.0 },
  "gpt-4.1-mini":      { inputPer1M: 0.4,  outputPer1M: 1.6 },
  "gpt-4.1-nano":      { inputPer1M: 0.1,  outputPer1M: 0.4 },
  "o4-mini":           { inputPer1M: 1.1,  outputPer1M: 4.4 },
  "o3-mini":           { inputPer1M: 1.1,  outputPer1M: 4.4 },
  "o3":                { inputPer1M: 2.0,  outputPer1M: 8.0 },
  "gpt-3.5-turbo":     { inputPer1M: 0.5,  outputPer1M: 1.5 },
};

const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514":      { inputPer1M: 3.0,  outputPer1M: 15.0, cachedInputPer1M: 0.3 },
  "claude-sonnet-4-5-20250929":    { inputPer1M: 3.0,  outputPer1M: 15.0, cachedInputPer1M: 0.3 },
  "claude-opus-4-20250514":        { inputPer1M: 15.0, outputPer1M: 75.0, cachedInputPer1M: 1.5 },
  "claude-opus-4-1-20250805":      { inputPer1M: 15.0, outputPer1M: 75.0, cachedInputPer1M: 1.5 },
  "claude-haiku-4-20250514":       { inputPer1M: 0.25, outputPer1M: 1.25, cachedInputPer1M: 0.03 },
  "claude-3-5-sonnet-20241022":    { inputPer1M: 3.0,  outputPer1M: 15.0, cachedInputPer1M: 0.3 },
  "claude-3-5-haiku-20241022":     { inputPer1M: 0.8,  outputPer1M: 4.0,  cachedInputPer1M: 0.08 },
  "claude-3-opus-20240229":        { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-3-haiku-20240307":       { inputPer1M: 0.25, outputPer1M: 1.25 },
};

const GEMINI_PRICING: Record<string, ModelPricing> = {
  "gemini-2.0-flash":              { inputPer1M: 0.1,  outputPer1M: 0.4 },
  "gemini-2.0-flash-lite":         { inputPer1M: 0.075, outputPer1M: 0.3 },
  "gemini-2.5-pro":                { inputPer1M: 1.25, outputPer1M: 10.0 },
  "gemini-2.5-flash":              { inputPer1M: 0.3,  outputPer1M: 2.5 },
  "gemini-1.5-pro":                { inputPer1M: 1.25, outputPer1M: 5.0 },
  "gemini-1.5-flash":              { inputPer1M: 0.075, outputPer1M: 0.3 },
};

const PRICING_BY_PROVIDER: Record<string, Record<string, ModelPricing>> = {
  openai:    OPENAI_PRICING,
  anthropic: ANTHROPIC_PRICING,
  gemini:    GEMINI_PRICING,
};

/**
 * Look up pricing for a (provider, model) pair. Returns null when unknown.
 * The lookup is forgiving — it strips a leading "models/" prefix that some
 * Gemini SDK paths return.
 */
export function getModelPricing(provider: string, model: string): ModelPricing | null {
  const table = PRICING_BY_PROVIDER[provider];
  if (!table) return null;
  const normalized = model.replace(/^models\//, "");
  return table[normalized] ?? table[model] ?? null;
}

/**
 * Compute a USD cost given token counts. Returns null when we can't price the
 * model — the caller should skip storing a cost in that case rather than
 * showing a misleading zero.
 */
export function computeCost(
  provider: string,
  model: string,
  tokens: { inputTokens: number; outputTokens: number; cachedTokens?: number }
): number | null {
  const pricing = getModelPricing(provider, model);
  if (!pricing) return null;
  const cachedTokens = tokens.cachedTokens ?? 0;
  const billableInput = Math.max(0, tokens.inputTokens - cachedTokens);
  const cachedRate = pricing.cachedInputPer1M ?? pricing.inputPer1M;
  const cost =
    (billableInput * pricing.inputPer1M) / 1_000_000 +
    (cachedTokens * cachedRate) / 1_000_000 +
    (tokens.outputTokens * pricing.outputPer1M) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
