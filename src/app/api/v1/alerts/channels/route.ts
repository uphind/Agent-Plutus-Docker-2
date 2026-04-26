import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { AlertChannelKind } from "@/generated/prisma/client";
import {
  buildSlackBotConfig,
  buildSlackWebhookConfig,
  buildSmtpConfig,
  publicChannelConfig,
} from "@/lib/alerts/channels/config";

const smtpSchema = z.object({
  kind: z.literal("email_smtp"),
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().min(1),
  fromAddress: z.string().email(),
  fromName: z.string().optional(),
});

const slackWebhookSchema = z.object({
  kind: z.literal("slack_webhook"),
  name: z.string().min(1),
  url: z.string().url().refine((u) => u.startsWith("https://hooks.slack.com/"), {
    message: "Must be a Slack incoming webhook URL (https://hooks.slack.com/...)",
  }),
  channelLabel: z.string().optional(),
});

const slackBotSchema = z.object({
  kind: z.literal("slack_bot"),
  name: z.string().min(1),
  mode: z.enum(["channel", "dm_by_email"]),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
}).refine(
  (data) => data.mode === "dm_by_email" || Boolean(data.channelId),
  { message: "channelId is required when mode is 'channel'", path: ["channelId"] },
);

const createSchema = z.discriminatedUnion("kind", [smtpSchema, slackWebhookSchema, slackBotSchema]);

export async function GET() {
  try {
    const orgId = await getOrgId();
    const channels = await prisma.alertChannel.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      channels: channels.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        isActive: c.isActive,
        config: publicChannelConfig(c.config),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load channels" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let orgId: string;
  try {
    orgId = await getOrgId();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to identify organization" },
      { status: 500 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  let config: object;
  let kind: AlertChannelKind;

  if (data.kind === "email_smtp") {
    kind = AlertChannelKind.email_smtp;
    config = buildSmtpConfig({
      host: data.host,
      port: data.port,
      secure: data.secure,
      user: data.user,
      pass: data.pass,
      fromAddress: data.fromAddress,
      fromName: data.fromName,
    });
  } else if (data.kind === "slack_webhook") {
    kind = AlertChannelKind.slack_webhook;
    config = buildSlackWebhookConfig(data.url, data.channelLabel);
  } else {
    kind = AlertChannelKind.slack_bot;
    config = buildSlackBotConfig({
      mode: data.mode,
      channelId: data.channelId,
      channelName: data.channelName,
    });
  }

  const created = await prisma.alertChannel.create({
    data: {
      orgId,
      kind,
      name: data.name,
      config: config as never,
    },
  });

  return NextResponse.json({
    channel: {
      id: created.id,
      kind: created.kind,
      name: created.name,
      isActive: created.isActive,
      config: publicChannelConfig(created.config),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });
}
