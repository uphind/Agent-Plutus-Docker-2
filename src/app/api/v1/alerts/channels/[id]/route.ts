import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import {
  buildSlackBotConfig,
  buildSlackWebhookConfig,
  buildSmtpConfig,
  publicChannelConfig,
} from "@/lib/alerts/channels/config";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  smtp: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    user: z.string().min(1),
    pass: z.string().min(1),
    fromAddress: z.string().email(),
    fromName: z.string().optional(),
  }).optional(),
  slackWebhook: z.object({
    url: z.string().url(),
    channelLabel: z.string().optional(),
  }).optional(),
  slackBot: z.object({
    mode: z.enum(["channel", "dm_by_email"]),
    channelId: z.string().optional(),
    channelName: z.string().optional(),
  }).optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = await getOrgId();
  const channel = await prisma.alertChannel.findFirst({ where: { orgId, id } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  if (parsed.data.smtp) {
    if (channel.kind !== "email_smtp") {
      return NextResponse.json({ error: "smtp body only valid for email_smtp channels" }, { status: 400 });
    }
    updates.config = buildSmtpConfig(parsed.data.smtp) as never;
  }
  if (parsed.data.slackWebhook) {
    if (channel.kind !== "slack_webhook") {
      return NextResponse.json({ error: "slackWebhook body only valid for slack_webhook channels" }, { status: 400 });
    }
    updates.config = buildSlackWebhookConfig(parsed.data.slackWebhook.url, parsed.data.slackWebhook.channelLabel) as never;
  }
  if (parsed.data.slackBot) {
    if (channel.kind !== "slack_bot") {
      return NextResponse.json({ error: "slackBot body only valid for slack_bot channels" }, { status: 400 });
    }
    updates.config = buildSlackBotConfig(parsed.data.slackBot) as never;
  }

  const updated = await prisma.alertChannel.update({ where: { id }, data: updates });
  return NextResponse.json({
    channel: {
      id: updated.id,
      kind: updated.kind,
      name: updated.name,
      isActive: updated.isActive,
      config: publicChannelConfig(updated.config),
      updatedAt: updated.updatedAt,
    },
  });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = await getOrgId();
  const channel = await prisma.alertChannel.findFirst({ where: { orgId, id } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.alertChannel.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
