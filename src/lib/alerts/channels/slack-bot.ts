import { WebClient } from "@slack/web-api";
import { decrypt } from "@/lib/encryption";

export interface SlackBotPostInput {
  text: string;
  blocks: unknown[];
}

export interface SlackBotResult {
  status: "sent" | "failed";
  recipient: string;
  error?: string;
}

function client(botTokenEncrypted: string): WebClient {
  return new WebClient(decrypt(botTokenEncrypted));
}

export async function postChannel(
  botTokenEncrypted: string,
  channelId: string,
  input: SlackBotPostInput,
): Promise<SlackBotResult> {
  try {
    await client(botTokenEncrypted).chat.postMessage({
      channel: channelId,
      text: input.text,
      blocks: input.blocks as never,
    });
    return { status: "sent", recipient: channelId };
  } catch (err) {
    return {
      status: "failed",
      recipient: channelId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function postUserByEmail(
  botTokenEncrypted: string,
  email: string,
  input: SlackBotPostInput,
): Promise<SlackBotResult> {
  const wc = client(botTokenEncrypted);
  try {
    const lookup = await wc.users.lookupByEmail({ email });
    const userId = lookup.user?.id;
    if (!userId) {
      return { status: "failed", recipient: email, error: "Slack user not found for email" };
    }
    await wc.chat.postMessage({
      channel: userId,
      text: input.text,
      blocks: input.blocks as never,
    });
    return { status: "sent", recipient: email };
  } catch (err) {
    return {
      status: "failed",
      recipient: email,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface SlackConversationLite {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

export async function listConversations(botTokenEncrypted: string): Promise<SlackConversationLite[]> {
  const wc = client(botTokenEncrypted);
  const out: SlackConversationLite[] = [];
  let cursor: string | undefined;
  do {
    const res: Awaited<ReturnType<WebClient["conversations"]["list"]>> = await wc.conversations.list({
      exclude_archived: true,
      limit: 200,
      types: "public_channel,private_channel",
      cursor,
    });
    for (const c of res.channels ?? []) {
      if (!c.id || !c.name) continue;
      out.push({
        id: c.id,
        name: c.name,
        isPrivate: Boolean(c.is_private),
        isMember: Boolean(c.is_member),
      });
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function authTest(botTokenEncrypted: string): Promise<{ ok: boolean; teamId?: string; teamName?: string; botUserId?: string; error?: string }> {
  try {
    const res = await client(botTokenEncrypted).auth.test();
    return {
      ok: true,
      teamId: res.team_id,
      teamName: res.team,
      botUserId: res.user_id,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
