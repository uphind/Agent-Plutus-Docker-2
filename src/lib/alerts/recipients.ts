import { prisma } from "@/lib/db";
import type { Alert } from "./evaluate";

/**
 * Recipient kinds. `static_emails` and `static_slack_channel_ids` carry their
 * value inline; AD-based kinds resolve at dispatch time.
 *
 * `entity_owner` only resolves when the alert's entityType is "user" — it
 * means "email/DM the person the alert is about".
 */
export type AlertRecipientKind =
  | "static_emails"
  | "ad_users"
  | "ad_department"
  | "ad_team"
  | "entity_owner"
  | "slack_channel"
  | "slack_user_email";

export interface AlertRecipientSpec {
  kind: AlertRecipientKind;
  /**
   * For static_emails: comma-separated emails.
   * For ad_users: comma-separated OrgUser ids.
   * For ad_department / ad_team: department / team id.
   * For slack_channel: channel id (used by slack_bot channels overriding their default).
   * For slack_user_email: email to lookup. (Usually paired with entity_owner instead.)
   */
  value?: string;
}

export interface ResolvedRecipients {
  /** Email addresses for the email channel. */
  emails: string[];
  /** Email addresses to look up via Slack users.lookupByEmail (for slack_bot DM). */
  slackUserEmails: string[];
  /** Slack channel ids (overrides the channel's own default channelId). */
  slackChannelIds: string[];
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Resolves recipient specs against the database for the given alert. Returns
 * unique, deduped lists. Inactive users are skipped.
 */
export async function resolveRecipients(
  orgId: string,
  alert: Alert,
  specs: AlertRecipientSpec[],
): Promise<ResolvedRecipients> {
  const emails = new Set<string>();
  const slackUserEmails = new Set<string>();
  const slackChannelIds = new Set<string>();

  for (const spec of specs) {
    switch (spec.kind) {
      case "static_emails": {
        for (const e of parseList(spec.value)) emails.add(e.toLowerCase());
        break;
      }
      case "ad_users": {
        const ids = parseList(spec.value);
        if (ids.length === 0) break;
        const users = await prisma.orgUser.findMany({
          where: { orgId, id: { in: ids }, status: "active" },
          select: { email: true },
        });
        for (const u of users) emails.add(u.email.toLowerCase());
        break;
      }
      case "ad_department": {
        if (!spec.value) break;
        const users = await prisma.orgUser.findMany({
          where: { orgId, departmentId: spec.value, status: "active" },
          select: { email: true },
        });
        for (const u of users) emails.add(u.email.toLowerCase());
        break;
      }
      case "ad_team": {
        if (!spec.value) break;
        const users = await prisma.orgUser.findMany({
          where: { orgId, teamId: spec.value, status: "active" },
          select: { email: true },
        });
        for (const u of users) emails.add(u.email.toLowerCase());
        break;
      }
      case "entity_owner": {
        if (alert.entityType !== "user") break;
        const u = await prisma.orgUser.findFirst({
          where: { orgId, id: alert.entityId, status: "active" },
          select: { email: true },
        });
        if (u) {
          emails.add(u.email.toLowerCase());
          slackUserEmails.add(u.email.toLowerCase());
        }
        break;
      }
      case "slack_channel": {
        if (spec.value) slackChannelIds.add(spec.value);
        break;
      }
      case "slack_user_email": {
        for (const e of parseList(spec.value)) slackUserEmails.add(e.toLowerCase());
        break;
      }
    }
  }

  return {
    emails: Array.from(emails),
    slackUserEmails: Array.from(slackUserEmails),
    slackChannelIds: Array.from(slackChannelIds),
  };
}
