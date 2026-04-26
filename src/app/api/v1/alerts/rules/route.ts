import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { AlertTriggerKind } from "@/generated/prisma/client";

const TRIGGER_VALUES = Object.values(AlertTriggerKind) as [AlertTriggerKind, ...AlertTriggerKind[]];

const recipientSchema = z.object({
  kind: z.enum([
    "static_emails",
    "ad_users",
    "ad_department",
    "ad_team",
    "entity_owner",
    "slack_channel",
    "slack_user_email",
  ]),
  value: z.string().optional(),
});

const filterSchema = z.object({
  departmentIds: z.array(z.string()).optional(),
  teamIds: z.array(z.string()).optional(),
  providers: z.array(z.string()).optional(),
  thresholdPct: z.number().min(0).max(1000).optional(),
}).default({});

const createSchema = z.object({
  name: z.string().min(1),
  trigger: z.enum(TRIGGER_VALUES),
  filter: filterSchema.optional(),
  channelIds: z.array(z.string()).min(1, "Select at least one channel"),
  recipients: z.array(recipientSchema).default([]),
  throttleHours: z.number().int().min(0).max(720).default(24),
  muteUntil: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    const orgId = await getOrgId();
    const rules = await prisma.alertRule.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ rules });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load rules" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const orgId = await getOrgId();

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const rule = await prisma.alertRule.create({
    data: {
      orgId,
      name: data.name,
      trigger: data.trigger,
      filter: (data.filter ?? {}) as never,
      channelIds: data.channelIds,
      recipients: data.recipients as never,
      throttleHours: data.throttleHours,
      muteUntil: data.muteUntil ? new Date(data.muteUntil) : null,
      isActive: data.isActive,
    },
  });
  return NextResponse.json({ rule });
}
