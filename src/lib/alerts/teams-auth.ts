import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

/**
 * Bot Framework auth helpers — both inbound JWT validation (Microsoft signs
 * activities POSTed to our /messages endpoint) and outbound bearer-token
 * minting (we need a token to POST proactive messages back to Teams).
 *
 * Reference:
 *   https://learn.microsoft.com/azure/bot-service/rest-api/bot-framework-rest-connector-authentication
 */

const TOKEN_ENDPOINT = "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";
const TOKEN_SCOPE = "https://api.botframework.com/.default";

const BF_OPENID_URL = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const BF_ISSUER = "https://api.botframework.com";

// ─── Outbound: bearer tokens for proactive messaging ──────────────────────────

interface CachedToken {
  token: string;
  /** Epoch ms when this token expires. */
  expiresAt: number;
}

/** Per-(orgId+appId) token cache; refilled lazily on expiry. */
const tokenCache = new Map<string, CachedToken>();

export interface TeamsBotCreds {
  microsoftAppId: string;
  microsoftAppPassword: string;
  tenantId: string | null;
}

export async function loadTeamsCreds(orgId: string): Promise<TeamsBotCreds | null> {
  const row = await prisma.teamsBotSettings.findUnique({ where: { orgId } });
  if (!row) return null;
  return {
    microsoftAppId: row.microsoftAppId,
    microsoftAppPassword: decrypt(row.microsoftAppPasswordEncrypted),
    tenantId: row.tenantId ?? null,
  };
}

/**
 * Get an access_token for `https://api.botframework.com/.default`. Cached
 * in-memory for the lifetime of the token (~1h) minus a 60s safety margin.
 */
export async function getBotAccessToken(orgId: string, creds?: TeamsBotCreds): Promise<string> {
  const c = creds ?? (await loadTeamsCreds(orgId));
  if (!c) throw new Error("Teams bot is not configured for this org");

  const cacheKey = `${orgId}:${c.microsoftAppId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: c.microsoftAppId,
    client_secret: c.microsoftAppPassword,
    scope: TOKEN_SCOPE,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bot Framework token request failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  if (!json.access_token) {
    throw new Error("Bot Framework token response did not include access_token");
  }
  const entry: CachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(json.expires_in - 60, 60) * 1000,
  };
  tokenCache.set(cacheKey, entry);
  return entry.token;
}

// ─── Inbound: validate JWTs Microsoft signs for /messages activities ─────────

interface OpenIdConfig {
  jwks_uri: string;
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let openIdConfigPromise: Promise<OpenIdConfig> | null = null;

async function loadOpenIdConfig(): Promise<OpenIdConfig> {
  if (!openIdConfigPromise) {
    openIdConfigPromise = (async () => {
      const res = await fetch(BF_OPENID_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Failed to fetch Bot Framework OIDC config: ${res.status}`);
      return (await res.json()) as OpenIdConfig;
    })();
  }
  return openIdConfigPromise;
}

async function getJwks() {
  if (!jwksCache) {
    const cfg = await loadOpenIdConfig();
    jwksCache = createRemoteJWKSet(new URL(cfg.jwks_uri));
  }
  return jwksCache;
}

export interface InboundClaims extends JWTPayload {
  serviceurl?: string;
}

/**
 * Verify the `Authorization: Bearer <jwt>` header attached by Microsoft.
 * Returns the decoded claims on success; throws otherwise.
 *
 * In dev we allow `BOT_AUTH_DISABLED=1` to skip verification (useful when
 * tunneling localhost via ngrok and the Microsoft Bot Emulator).
 */
export async function verifyInboundJwt(authHeader: string | null, expectedAppId: string): Promise<InboundClaims> {
  if (process.env.BOT_AUTH_DISABLED === "1") {
    return { aud: expectedAppId, iss: BF_ISSUER };
  }
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new Error("Missing bearer token");
  }
  const token = authHeader.slice(7).trim();
  const jwks = await getJwks();
  const { payload } = await jwtVerify(token, jwks, {
    issuer: BF_ISSUER,
    audience: expectedAppId,
  });
  return payload as InboundClaims;
}
