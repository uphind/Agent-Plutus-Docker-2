import { prisma } from "@/lib/db";
import { AlertChannelKind, AlertTriggerKind, type AlertChannel, type AlertRule } from "@/generated/prisma/client";
import { evaluateAlerts, type Alert } from "./evaluate";
import { renderTemplate, type TemplateAudience } from "./templates";
import { resolveRecipients, type AlertRecipientSpec } from "./recipients";
import {
  type AlertChannelConfig,
  type SmtpChannelConfig,
  type SlackBotChannelConfig,
  type SlackWebhookChannelConfig,
} from "./channels/config";
import { sendEmail } from "./channels/email";
import { postWebhook } from "./channels/slack-webhook";
import { postChannel as slackPostChannel, postUserByEmail as slackPostDm } from "./channels/slack-bot";

export interface AlertRuleFilter {
  departmentIds?: string[];
  teamIds?: string[];
  providers?: string[];
  /**
   * Override severity threshold — only fire if alert.value >= thresholdPct.
   * Only meaningful for percentage-based triggers (over_budget, budget_warning).
   */
  thresholdPct?: number;
}

const TRIGGER_TO_ALERT_TYPE: Partial<Record<AlertTriggerKind, Alert["type"]>> = {
  over_budget: "over_budget",
  budget_warning: "budget_warning",
  anomaly: "anomaly",
  inactive_user: "inactive_user",
  cost_spike: "cost_spike",
  no_budget: "no_budget",
  high_cost_model: "high_cost_model",
  underutilized: "underutilized",
};

function ruleMatches(rule: AlertRule, alert: Alert): boolean {
  if (TRIGGER_TO_ALERT_TYPE[rule.trigger] !== alert.type) return false;
  if (rule.muteUntil && rule.muteUntil > new Date()) return false;
  const filter = (rule.filter ?? {}) as AlertRuleFilter;
  if (filter.thresholdPct !== undefined && (alert.value ?? 0) < filter.thresholdPct) {
    return false;
  }
  if (filter.departmentIds?.length && alert.entityType === "department") {
    if (!filter.departmentIds.includes(alert.entityId)) return false;
  }
  if (filter.teamIds?.length && alert.entityType === "team") {
    if (!filter.teamIds.includes(alert.entityId)) return false;
  }
  return true;
}

interface DeliveryAttempt {
  channelId: string;
  channelKind: AlertChannelKind;
  recipient: string;
  status: "sent" | "failed" | "suppressed";
  error?: string;
}

async function isDuplicate(params: {
  orgId: string;
  ruleId: string;
  channelId: string;
  trigger: AlertTriggerKind;
  entityId: string | null;
  recipient: string;
  windowHours: number;
}): Promise<boolean> {
  if (params.windowHours <= 0) return false;
  const since = new Date(Date.now() - params.windowHours * 3_600_000);
  const existing = await prisma.alertDelivery.findFirst({
    where: {
      orgId: params.orgId,
      ruleId: params.ruleId,
      channelId: params.channelId,
      trigger: params.trigger,
      entityId: params.entityId,
      recipient: params.recipient,
      status: "sent",
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function dispatchToChannel(opts: {
  orgId: string;
  rule: AlertRule;
  alert: Alert;
  channel: AlertChannel;
  baseUrl: string;
  audience: TemplateAudience;
  resolvedEmails: string[];
  resolvedSlackUserEmails: string[];
  resolvedSlackChannelIds: string[];
  slackBotToken: string | null;
}): Promise<DeliveryAttempt[]> {
  const config = opts.channel.config as unknown as AlertChannelConfig;
  const tmpl = renderTemplate(opts.alert, opts.audience, opts.baseUrl);
  const attempts: DeliveryAttempt[] = [];

  if (opts.channel.kind === AlertChannelKind.email_smtp && config.kind === "email_smtp") {
    if (opts.resolvedEmails.length === 0) return attempts;
    for (const to of opts.resolvedEmails) {
      const dup = await isDuplicate({
        orgId: opts.orgId,
        ruleId: opts.rule.id,
        channelId: opts.channel.id,
        trigger: opts.rule.trigger,
        entityId: opts.alert.entityId,
        recipient: to,
        windowHours: opts.rule.throttleHours,
      });
      if (dup) {
        attempts.push({ channelId: opts.channel.id, channelKind: opts.channel.kind, recipient: to, status: "suppressed" });
        continue;
      }
      const [r] = await sendEmail(config as SmtpChannelConfig, {
        to: [to],
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
      });
      attempts.push({ channelId: opts.channel.id, channelKind: opts.channel.kind, recipient: to, status: r.status, error: r.error });
    }
    return attempts;
  }

  if (opts.channel.kind === AlertChannelKind.slack_webhook && config.kind === "slack_webhook") {
    const recipient = (config as SlackWebhookChannelConfig).channelLabel ?? `webhook:${opts.channel.id}`;
    const dup = await isDuplicate({
      orgId: opts.orgId,
      ruleId: opts.rule.id,
      channelId: opts.channel.id,
      trigger: opts.rule.trigger,
      entityId: opts.alert.entityId,
      recipient,
      windowHours: opts.rule.throttleHours,
    });
    if (dup) {
      attempts.push({ channelId: opts.channel.id, channelKind: opts.channel.kind, recipient, status: "suppressed" });
      return attempts;
    }
    const r = await postWebhook(config as SlackWebhookChannelConfig, { text: tmpl.text, blocks: tmpl.slackBlocks });
    attempts.push({ channelId: opts.channel.id, channelKind: opts.channel.kind, recipient, status: r.status, error: r.error });
    return attempts;
  }

  if (opts.channel.kind === AlertChannelKind.slack_bot && config.kind === "slack_bot") {
    if (!opts.slackBotToken) {
      attempts.push({
        channelId: opts.channel.id,
        channelKind: opts.channel.kind,
        recipient: "slack:not-installed",
        status: "failed",
        error: "Slack workspace is not connected",
      });
      return attempts;
    }
    const botCfg = config as SlackBotChannelConfig;
    const targets =
      botCfg.mode === "dm_by_email"
        ? opts.resolvedSlackUserEmails.map((email) => ({ kind: "dm" as const, value: email }))
        : (opts.resolvedSlackChannelIds.length > 0 ? opts.resolvedSlackChannelIds : botCfg.channelId ? [botCfg.channelId] : [])
            .map((channelId) => ({ kind: "channel" as const, value: channelId }));

    for (const t of targets) {
      const dup = await isDuplicate({
        orgId: opts.orgId,
        ruleId: opts.rule.id,
        channelId: opts.channel.id,
        trigger: opts.rule.trigger,
        entityId: opts.alert.entityId,
        recipient: t.value,
        windowHours: opts.rule.throttleHours,
      });
      if (dup) {
        attempts.push({ channelId: opts.channel.id, channelKind: opts.channel.kind, recipient: t.value, status: "suppressed" });
        continue;
      }
      const r =
        t.kind === "channel"
          ? await slackPostChannel(opts.slackBotToken, t.value, { text: tmpl.text, blocks: tmpl.slackBlocks })
          : await slackPostDm(opts.slackBotToken, t.value, { text: tmpl.text, blocks: tmpl.slackBlocks });
      attempts.push({ channelId: opts.channel.id, channelKind: opts.channel.kind, recipient: t.value, status: r.status, error: r.error });
    }
    return attempts;
  }

  return attempts;
}

function audienceForRule(rule: AlertRule): TemplateAudience {
  // If any recipient is `entity_owner`, treat the whole rule as end_user copy.
  const recs = (rule.recipients as unknown as AlertRecipientSpec[]) ?? [];
  return recs.some((r) => r.kind === "entity_owner") ? "end_user" : "admin";
}

function baseUrlFromEnv(): string {
  return process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "";
}

export interface DispatchSummary {
  evaluated: number;
  rulesMatched: number;
  attempts: number;
  sent: number;
  failed: number;
  suppressed: number;
}

export async function dispatchForOrg(orgId: string): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    evaluated: 0,
    rulesMatched: 0,
    attempts: 0,
    sent: 0,
    failed: 0,
    suppressed: 0,
  };

  const rules = await prisma.alertRule.findMany({ where: { orgId, isActive: true } });
  if (rules.length === 0) return summary;

  const channels = await prisma.alertChannel.findMany({ where: { orgId, isActive: true } });
  const channelMap = new Map(channels.map((c) => [c.id, c]));

  const slackInstall = await prisma.slackInstallation.findUnique({ where: { orgId } });
  const slackBotToken = slackInstall?.botTokenEncrypted ?? null;

  const alerts = await evaluateAlerts(orgId);
  summary.evaluated = alerts.length;

  const baseUrl = baseUrlFromEnv();

  for (const alert of alerts) {
    for (const rule of rules) {
      if (!ruleMatches(rule, alert)) continue;
      summary.rulesMatched++;

      const recipients = (rule.recipients as unknown as AlertRecipientSpec[]) ?? [];
      const resolved = await resolveRecipients(orgId, alert, recipients);
      const audience = audienceForRule(rule);

      for (const channelId of rule.channelIds) {
        const channel = channelMap.get(channelId);
        if (!channel) continue;
        const attempts = await dispatchToChannel({
          orgId,
          rule,
          alert,
          channel,
          baseUrl,
          audience,
          resolvedEmails: resolved.emails,
          resolvedSlackUserEmails: resolved.slackUserEmails,
          resolvedSlackChannelIds: resolved.slackChannelIds,
          slackBotToken,
        });
        for (const attempt of attempts) {
          summary.attempts++;
          if (attempt.status === "sent") summary.sent++;
          else if (attempt.status === "failed") summary.failed++;
          else summary.suppressed++;

          await prisma.alertDelivery.create({
            data: {
              orgId,
              ruleId: rule.id,
              channelId: attempt.channelId,
              trigger: rule.trigger,
              entityType: alert.entityType,
              entityId: alert.entityId,
              recipient: attempt.recipient,
              status: attempt.status,
              error: attempt.error ?? null,
            },
          });
        }
      }
    }
  }

  return summary;
}

/**
 * Send a single synthetic alert through one channel — used by the "Send test"
 * button. Bypasses the rules engine entirely. `testRecipient` is required for
 * email channels (we have nowhere else to send) and optional for Slack (the
 * channel's own configured destination is used when omitted).
 */
export async function sendTestThroughChannel(
  orgId: string,
  channelId: string,
  testRecipient?: string,
): Promise<DeliveryAttempt[]> {
  const channel = await prisma.alertChannel.findFirst({ where: { orgId, id: channelId } });
  if (!channel) throw new Error("Channel not found");
  const slackInstall = await prisma.slackInstallation.findUnique({ where: { orgId } });
  const slackBotToken = slackInstall?.botTokenEncrypted ?? null;

  const fakeAlert: Alert = {
    type: "budget_warning",
    severity: "info",
    title: "Test alert from Agent Plutus",
    description: "If you're seeing this, your channel is wired up correctly.",
    entityType: "department",
    entityId: "test",
    entityName: "Test department",
    value: 0,
    threshold: 0,
  };
  const fakeRule = {
    id: "test-rule",
    orgId,
    name: "Test",
    trigger: AlertTriggerKind.budget_warning,
    filter: {},
    channelIds: [channelId],
    recipients: [],
    throttleHours: 0,
    muteUntil: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AlertRule;

  const isEmail = channel.kind === AlertChannelKind.email_smtp;
  const isSlackBotDm =
    channel.kind === AlertChannelKind.slack_bot &&
    (channel.config as unknown as AlertChannelConfig).kind === "slack_bot" &&
    (channel.config as unknown as SlackBotChannelConfig).mode === "dm_by_email";

  const attempts = await dispatchToChannel({
    orgId,
    rule: fakeRule,
    alert: fakeAlert,
    channel,
    baseUrl: baseUrlFromEnv(),
    audience: "admin",
    resolvedEmails: isEmail && testRecipient ? [testRecipient] : [],
    resolvedSlackUserEmails: isSlackBotDm && testRecipient ? [testRecipient] : [],
    resolvedSlackChannelIds: [],
    slackBotToken,
  });

  for (const attempt of attempts) {
    await prisma.alertDelivery.create({
      data: {
        orgId,
        ruleId: null,
        channelId: attempt.channelId,
        trigger: AlertTriggerKind.budget_warning,
        entityType: "department",
        entityId: "test",
        recipient: attempt.recipient,
        status: attempt.status,
        error: attempt.error ?? null,
      },
    });
  }
  return attempts;
}
