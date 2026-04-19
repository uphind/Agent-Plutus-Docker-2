import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter } from "./types";
import { anthropicAdapter } from "./anthropic";
import { anthropicComplianceAdapter } from "./anthropic_compliance";
import { anthropicAnalyticsAdapter } from "./anthropic_analytics";
import { openaiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { cursorAdapter } from "./cursor";
import { vertexAdapter } from "./vertex";

export const providerAdapters: Record<Provider, ProviderAdapter> = {
  [Provider.anthropic]: anthropicAdapter,
  [Provider.anthropic_compliance]: anthropicComplianceAdapter,
  [Provider.anthropic_analytics]: anthropicAnalyticsAdapter,
  [Provider.openai]: openaiAdapter,
  [Provider.gemini]: geminiAdapter,
  [Provider.cursor]: cursorAdapter,
  [Provider.vertex]: vertexAdapter,
};

export function getAdapter(provider: Provider): ProviderAdapter {
  return providerAdapters[provider];
}
