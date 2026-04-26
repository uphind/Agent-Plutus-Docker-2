import { prisma } from "@/lib/db";
import { getBotAccessToken } from "@/lib/alerts/teams-auth";

export interface TeamsBotInput {
  text: string;
  /** Adaptive Card JSON. */
  card: Record<string, unknown>;
}

export interface TeamsBotResult {
  status: "sent" | "failed";
  recipient: string;
  error?: string;
}

/**
 * Send a proactive message to a known Teams conversation (channel, 1:1 chat,
 * or group chat). The conversation reference must already exist in
 * `teams_conversations` — populated when Microsoft delivers a
 * `conversationUpdate` activity to our /messages endpoint.
 */
export async function postTeamsConversation(opts: {
  orgId: string;
  conversationId: string;
  input: TeamsBotInput;
}): Promise<TeamsBotResult> {
  const conv = await prisma.teamsConversation.findUnique({
    where: { orgId_conversationId: { orgId: opts.orgId, conversationId: opts.conversationId } },
  });
  if (!conv) {
    return {
      status: "failed",
      recipient: opts.conversationId,
      error: "Conversation not found — has the bot been added to this Teams channel/chat?",
    };
  }

  let token: string;
  try {
    token = await getBotAccessToken(opts.orgId);
  } catch (err) {
    return {
      status: "failed",
      recipient: conv.displayName ?? conv.conversationId,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const url = `${conv.serviceUrl.replace(/\/$/, "")}/v3/conversations/${encodeURIComponent(conv.conversationId)}/activities`;
  const activity = {
    type: "message",
    text: opts.input.text,
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: opts.input.card,
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(activity),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        status: "failed",
        recipient: conv.displayName ?? conv.conversationId,
        error: `${res.status}: ${text.slice(0, 200)}`,
      };
    }
    return { status: "sent", recipient: conv.displayName ?? conv.conversationId };
  } catch (err) {
    return {
      status: "failed",
      recipient: conv.displayName ?? conv.conversationId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
