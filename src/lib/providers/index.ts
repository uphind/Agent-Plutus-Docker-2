import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter } from "./types";
import { anthropicAdapter } from "./anthropic";
import { anthropicComplianceAdapter } from "./anthropic_compliance";
import { anthropicAnalyticsAdapter } from "./anthropic_analytics";
import { openaiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { cursorAdapter } from "./cursor";
import { vertexAdapter } from "./vertex";
import { microsoftCopilotAdapter } from "./microsoft_copilot";
import { lovableAdapter } from "./lovable";
import { n8nAdapter } from "./n8n";

export const providerAdapters: Record<Provider, ProviderAdapter> = {
  [Provider.anthropic]: anthropicAdapter,
  [Provider.anthropic_compliance]: anthropicComplianceAdapter,
  [Provider.anthropic_analytics]: anthropicAnalyticsAdapter,
  [Provider.openai]: openaiAdapter,
  [Provider.gemini]: geminiAdapter,
  [Provider.cursor]: cursorAdapter,
  [Provider.vertex]: vertexAdapter,
  [Provider.microsoft_copilot]: microsoftCopilotAdapter,
  [Provider.lovable]: lovableAdapter,
  [Provider.n8n]: n8nAdapter,
};

export function getAdapter(provider: Provider): ProviderAdapter {
  return providerAdapters[provider];
}
