import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { resolveRecipients, type AlertRecipientSpec } from "@/lib/alerts/recipients";
import type { AlertRuleFilter } from "@/lib/alerts/dispatch";
import { AlertTriggerKind } from "@/generated/prisma/client";

const TRIGGER_TO_TYPE: Partial<Record<AlertTriggerKind, string>> = {
  over_budget: "over_budget",
  budget_warning: "budget_warning",
  anomaly: "anomaly",
  inactive_user: "inactive_user",
  cost_spike: "cost_spike",
  no_budget: "no_budget",
  high_cost_model: "high_cost_model",
  underutilized: "underutilized",
};

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = await getOrgId();
  const rule = await prisma.alertRule.findFirst({ where: { orgId, id } });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const alerts = await evaluateAlerts(orgId);
  const expectedType = TRIGGER_TO_TYPE[rule.trigger];
  const filter = (rule.filter ?? {}) as AlertRuleFilter;
  const recipients = (rule.recipients ?? []) as unknown as AlertRecipientSpec[];

  const matched = alerts.filter((a) => {
    if (a.type !== expectedType) return false;
    if (filter.thresholdPct !== undefined && (a.value ?? 0) < filter.thresholdPct) return false;
    if (filter.departmentIds?.length && a.entityType === "department") {
      if (!filter.departmentIds.includes(a.entityId)) return false;
    }
    if (filter.teamIds?.length && a.entityType === "team") {
      if (!filter.teamIds.includes(a.entityId)) return false;
    }
    return true;
  });

  let totalEmails = 0;
  let totalSlackUsers = 0;
  let totalSlackChannels = 0;
  const sample: Array<{ entityName: string; emails: number; slackUserEmails: number; slackChannels: number }> = [];

  for (const a of matched.slice(0, 10)) {
    const r = await resolveRecipients(orgId, a, recipients);
    totalEmails += r.emails.length;
    totalSlackUsers += r.slackUserEmails.length;
    totalSlackChannels += r.slackChannelIds.length;
    sample.push({
      entityName: a.entityName,
      emails: r.emails.length,
      slackUserEmails: r.slackUserEmails.length,
      slackChannels: r.slackChannelIds.length,
    });
  }

  return NextResponse.json({
    matchedAlerts: matched.length,
    totals: {
      emails: totalEmails,
      slackUserEmails: totalSlackUsers,
      slackChannels: totalSlackChannels,
    },
    sample,
  });
}
