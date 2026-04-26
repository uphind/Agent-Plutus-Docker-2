import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

export const SLACK_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "groups:read",
  "users:read",
  "users:read.email",
  "im:write",
];

export interface SlackOAuthCreds {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  source: "db" | "env";
}

/**
 * Resolve Slack OAuth credentials. Database (UI-configured) wins; env vars are
 * a fallback so existing deployments and local dev keep working.
 */
export async function getSlackOAuthCreds(orgId: string): Promise<SlackOAuthCreds | null> {
  const row = await prisma.slackOAuthSettings.findUnique({ where: { orgId } });
  if (row) {
    return {
      clientId: row.clientId,
      clientSecret: decrypt(row.clientSecretEncrypted),
      redirectUri: row.redirectUri,
      source: "db",
    };
  }
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (clientId && clientSecret && redirectUri) {
    return { clientId, clientSecret, redirectUri, source: "env" };
  }
  return null;
}

export function slackAuthorizeUrl(creds: SlackOAuthCreds, state: string): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    scope: SLACK_SCOPES.join(","),
    redirect_uri: creds.redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

function stateSecret(): string {
  return process.env.ENCRYPTION_KEY ?? "agent-plutus-state-fallback";
}

/**
 * State token: <orgId>.<nonce>.<hmac(orgId.nonce)>. Verified on callback to
 * defend against CSRF and to bind the redirect to the originating org.
 */
export function buildState(orgId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${orgId}.${nonce}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyState(state: string): { ok: true; orgId: string } | { ok: false; reason: string } {
  const parts = state.split(".");
  if (parts.length !== 3) return { ok: false, reason: "Malformed state" };
  const [orgId, nonce, sig] = parts;
  const expected = createHmac("sha256", stateSecret()).update(`${orgId}.${nonce}`).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "State signature mismatch" };
  }
  return { ok: true, orgId };
}

export interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  scope?: string;
  team?: { id?: string; name?: string };
}

export async function exchangeCode(creds: SlackOAuthCreds, code: string): Promise<SlackOAuthResponse> {
  const body = new URLSearchParams({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
  });
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await res.json()) as SlackOAuthResponse;
}
