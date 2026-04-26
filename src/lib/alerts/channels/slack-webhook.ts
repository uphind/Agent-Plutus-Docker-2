import { decrypt } from "@/lib/encryption";
import type { SlackWebhookChannelConfig } from "./config";

export interface SlackWebhookInput {
  text: string;
  blocks: unknown[];
}

export interface SlackWebhookResult {
  status: "sent" | "failed";
  recipient: string;
  error?: string;
}

export async function postWebhook(
  config: SlackWebhookChannelConfig,
  input: SlackWebhookInput,
): Promise<SlackWebhookResult> {
  const url = decrypt(config.urlEncrypted);
  const recipient = config.channelLabel ?? "slack-webhook";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text, blocks: input.blocks }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { status: "failed", recipient, error: `${res.status}: ${body.slice(0, 200)}` };
    }
    return { status: "sent", recipient };
  } catch (err) {
    return {
      status: "failed",
      recipient,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
