import { decrypt } from "@/lib/encryption";
import type { TeamsWebhookChannelConfig } from "./config";

export interface TeamsWebhookInput {
  text: string;
  /** Adaptive Card JSON ({ type: "AdaptiveCard", … }). */
  card: Record<string, unknown>;
}

export interface TeamsWebhookResult {
  status: "sent" | "failed";
  recipient: string;
  error?: string;
}

/**
 * Posts an Adaptive Card to a Microsoft Teams Power Automate Workflow URL
 * (the modern replacement for the deprecated Office 365 Connector). Workflow
 * URLs accept a payload of `{ type: "message", attachments: [...] }` where
 * each attachment wraps an Adaptive Card.
 *
 * The user creates the workflow inside Teams: ⋯ on a channel → Workflows →
 * "Post to a channel when a webhook request is received" → copy URL.
 */
export async function postTeamsWebhook(
  config: TeamsWebhookChannelConfig,
  input: TeamsWebhookInput,
): Promise<TeamsWebhookResult> {
  const url = decrypt(config.urlEncrypted);
  const recipient = config.channelLabel ?? "teams-webhook";
  try {
    const body = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: input.card,
        },
      ],
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { status: "failed", recipient, error: `${res.status}: ${text.slice(0, 200)}` };
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
