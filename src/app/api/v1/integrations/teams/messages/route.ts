import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyInboundJwt, getBotAccessToken } from "@/lib/alerts/teams-auth";

/**
 * Bot Framework messaging endpoint. Microsoft POSTs activities here whenever:
 *   - The bot is added to a Teams channel / 1:1 chat / group chat
 *     (`conversationUpdate` with `membersAdded` containing the bot)
 *   - The bot is removed (`membersRemoved`)
 *   - A user @-mentions or DMs the bot (`message`)
 *
 * We don't *use* the bot for back-and-forth conversations — its only job is
 * to be a delivery target for proactive alert notifications. So all we do
 * here is keep `teams_conversations` in sync and (optionally) reply with a
 * one-time "ready to send alerts" greeting on first install.
 *
 * Auth: every inbound request carries a JWT signed by Microsoft. We verify
 * it against the Bot Framework JWKS, with `aud` = our org's microsoftAppId.
 */

interface IncomingActivity {
  type?: string;
  serviceUrl?: string;
  channelId?: string;
  conversation?: {
    id?: string;
    conversationType?: string;
    isGroup?: boolean;
    tenantId?: string;
  };
  recipient?: { id?: string; name?: string };
  from?: { id?: string; name?: string };
  membersAdded?: Array<{ id?: string }>;
  membersRemoved?: Array<{ id?: string }>;
  channelData?: {
    team?: { id?: string; name?: string };
    channel?: { id?: string; name?: string };
    tenant?: { id?: string };
    eventType?: string;
  };
}

function appIdFromRecipient(recipientId: string | undefined): string | null {
  if (!recipientId) return null;
  // Bot ids look like `28:<microsoftAppId>` in Teams.
  return recipientId.startsWith("28:") ? recipientId.slice(3) : recipientId;
}

function deriveConversationType(act: IncomingActivity): "channel" | "personal" | "groupChat" {
  const t = act.conversation?.conversationType;
  if (t === "channel" || t === "personal" || t === "groupChat") return t;
  if (act.channelData?.channel?.id) return "channel";
  if (act.conversation?.isGroup) return "groupChat";
  return "personal";
}

function deriveDisplayName(act: IncomingActivity): string | null {
  return (
    act.channelData?.channel?.name ??
    act.channelData?.team?.name ??
    act.from?.name ??
    null
  );
}

async function sendGreeting(opts: {
  orgId: string;
  serviceUrl: string;
  conversationId: string;
}) {
  try {
    const token = await getBotAccessToken(opts.orgId);
    const url = `${opts.serviceUrl.replace(/\/$/, "")}/v3/conversations/${encodeURIComponent(opts.conversationId)}/activities`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "message",
        text: "Agent Plutus connected. Cost alerts will appear here.",
      }),
    });
  } catch {
    // Greeting failures are non-fatal; the install record is what matters.
  }
}

export async function POST(req: NextRequest) {
  let activity: IncomingActivity;
  try {
    activity = (await req.json()) as IncomingActivity;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const microsoftAppId = appIdFromRecipient(activity.recipient?.id ?? undefined);
  if (!microsoftAppId) {
    return NextResponse.json({ error: "missing_recipient" }, { status: 400 });
  }

  const settings = await prisma.teamsBotSettings.findFirst({
    where: { microsoftAppId },
  });
  if (!settings) {
    return NextResponse.json({ error: "unknown_bot" }, { status: 401 });
  }

  try {
    await verifyInboundJwt(req.headers.get("authorization"), microsoftAppId);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_jwt", detail: err instanceof Error ? err.message : "unknown" },
      { status: 401 },
    );
  }

  const orgId = settings.orgId;
  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;

  if (activity.type === "conversationUpdate" && conversationId && serviceUrl) {
    const botId = activity.recipient?.id;
    const added = activity.membersAdded ?? [];
    const removed = activity.membersRemoved ?? [];

    if (botId && added.some((m) => m.id === botId)) {
      await prisma.teamsConversation.upsert({
        where: { orgId_conversationId: { orgId, conversationId } },
        create: {
          orgId,
          conversationId,
          conversationType: deriveConversationType(activity),
          displayName: deriveDisplayName(activity),
          teamName: activity.channelData?.team?.name ?? null,
          tenantId: activity.channelData?.tenant?.id ?? activity.conversation?.tenantId ?? null,
          serviceUrl,
          channelId: activity.channelId ?? "msteams",
          lastSeenAt: new Date(),
        },
        update: {
          conversationType: deriveConversationType(activity),
          displayName: deriveDisplayName(activity),
          teamName: activity.channelData?.team?.name ?? null,
          tenantId: activity.channelData?.tenant?.id ?? activity.conversation?.tenantId ?? null,
          serviceUrl,
          lastSeenAt: new Date(),
        },
      });
      // Best-effort greeting; don't block the response on it.
      sendGreeting({ orgId, serviceUrl, conversationId }).catch(() => {});
    }

    if (botId && removed.some((m) => m.id === botId)) {
      await prisma.teamsConversation.deleteMany({
        where: { orgId, conversationId },
      });
    }
  } else if (activity.type === "message" && conversationId) {
    // Touch lastSeenAt so the picker can show "active" channels first.
    await prisma.teamsConversation.updateMany({
      where: { orgId, conversationId },
      data: { lastSeenAt: new Date() },
    });
  }

  return new NextResponse(null, { status: 200 });
}
