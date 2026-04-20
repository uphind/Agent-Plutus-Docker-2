import { prisma } from "@/lib/db";
import { computeCost } from "@/lib/ai-pricing";

export type AiCallSource = "chatbot" | "mapping";

export interface AiCallLogInput {
  orgId: string;
  source: AiCallSource;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

/**
 * Persist a single AI call's token usage + computed cost.
 *
 * Failures here are NEVER allowed to break the parent request — we log to the
 * server console and silently swallow. The user-visible API call always
 * succeeds with the AI provider's payload, even if the metrics insert fails.
 */
export async function logAiCall(input: AiCallLogInput): Promise<void> {
  try {
    const cost = computeCost(input.provider, input.model, {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedTokens: input.cachedTokens,
    });
    await prisma.aiUsageLog.create({
      data: {
        orgId: input.orgId,
        source: input.source,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cachedTokens: input.cachedTokens ?? 0,
        costUsd: cost,
      },
    });
  } catch (err) {
    // Logged but non-fatal — we don't want a logging miss to break a chat.
    console.error("logAiCall failed", err);
  }
}
