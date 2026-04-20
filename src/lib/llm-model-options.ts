/**
 * Curated model lists for LLM provider dropdowns when /api/v1/models/available
 * returns nothing (offline, rate limits, etc.). IDs align with src/lib/ai-pricing.ts.
 */
export const CURATED_LLM_MODELS: Record<string, Array<{ value: string; label: string }>> = {
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "gpt-4.1-nano", label: "GPT-4.1 nano" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "o3-mini", label: "o3-mini" },
    { value: "o3", label: "o3" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  anthropic: [
    { value: "claude-haiku-4-20250514", label: "Claude Haiku 4" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { value: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
};

export type AvailableLlmModelRow = { provider: string; modelId: string; displayName: string };

export async function fetchAvailableLlmModels(refresh = false): Promise<AvailableLlmModelRow[]> {
  try {
    const res = await fetch(`/api/v1/models/available${refresh ? "?refresh=true" : ""}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: AvailableLlmModelRow[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

/**
 * Prefer live catalog from the API; fall back to curated list. If the current
 * model is not listed (legacy custom value), prepend it so the select stays controlled.
 */
export function modelOptionsForProvider(
  provider: string,
  available: AvailableLlmModelRow[],
  currentModel?: string
): Array<{ value: string; label: string }> {
  const fromApi = available
    .filter((m) => m.provider === provider)
    .map((m) => ({ value: m.modelId, label: m.displayName }));
  const base = fromApi.length > 0 ? fromApi : (CURATED_LLM_MODELS[provider] ?? []);
  if (!currentModel || base.some((b) => b.value === currentModel)) return base;
  return [{ value: currentModel, label: `${currentModel} (saved)` }, ...base];
}
