import { decrypt, encrypt } from "@/lib/encryption";

/**
 * Channel-config JSON shapes. Stored on AlertChannel.config; SMTP password and
 * webhook URL are encrypted at rest. Slack-bot config only stores the channel
 * id / DM mode; the bot token lives on SlackInstallation.
 */
export interface SmtpChannelConfig {
  kind: "email_smtp";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Encrypted SMTP password (lib/encryption.ts). */
  passEncrypted: string;
  fromAddress: string;
  fromName?: string;
}

export interface SlackWebhookChannelConfig {
  kind: "slack_webhook";
  /** Encrypted https://hooks.slack.com/services/… URL. */
  urlEncrypted: string;
  channelLabel?: string;
}

export interface SlackBotChannelConfig {
  kind: "slack_bot";
  /** Slack channel id (e.g. C0123…). Required when mode === "channel". */
  channelId?: string;
  channelName?: string;
  /** "channel": post to a fixed channel. "dm_by_email": resolve recipient AD email -> DM. */
  mode: "channel" | "dm_by_email";
}

export type AlertChannelConfig =
  | SmtpChannelConfig
  | SlackWebhookChannelConfig
  | SlackBotChannelConfig;

export interface SmtpInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromAddress: string;
  fromName?: string;
}

export function buildSmtpConfig(input: SmtpInput): SmtpChannelConfig {
  return {
    kind: "email_smtp",
    host: input.host,
    port: input.port,
    secure: input.secure,
    user: input.user,
    passEncrypted: encrypt(input.pass),
    fromAddress: input.fromAddress,
    fromName: input.fromName,
  };
}

export function buildSlackWebhookConfig(url: string, channelLabel?: string): SlackWebhookChannelConfig {
  return {
    kind: "slack_webhook",
    urlEncrypted: encrypt(url),
    channelLabel,
  };
}

export function buildSlackBotConfig(input: {
  mode: "channel" | "dm_by_email";
  channelId?: string;
  channelName?: string;
}): SlackBotChannelConfig {
  return {
    kind: "slack_bot",
    mode: input.mode,
    channelId: input.channelId,
    channelName: input.channelName,
  };
}

/**
 * Strip secrets from a channel config for client display. Returns a safe shape
 * with masked passwords and partially-masked webhook URLs.
 */
export function publicChannelConfig(config: unknown): Record<string, unknown> {
  const c = config as AlertChannelConfig;
  if (c.kind === "email_smtp") {
    return {
      kind: c.kind,
      host: c.host,
      port: c.port,
      secure: c.secure,
      user: c.user,
      fromAddress: c.fromAddress,
      fromName: c.fromName,
      passSet: Boolean(c.passEncrypted),
    };
  }
  if (c.kind === "slack_webhook") {
    let masked = "hooks.slack.com/…";
    try {
      const url = decrypt(c.urlEncrypted);
      const match = url.match(/services\/(T[A-Z0-9]+)\/(B[A-Z0-9]+)/);
      if (match) masked = `hooks.slack.com/services/${match[1]}/${match[2]}/•••`;
    } catch {
      // ignore decrypt failure (e.g. legacy data); keep generic mask
    }
    return { kind: c.kind, channelLabel: c.channelLabel, masked };
  }
  if (c.kind === "slack_bot") {
    return {
      kind: c.kind,
      mode: c.mode,
      channelId: c.channelId,
      channelName: c.channelName,
    };
  }
  return {};
}
