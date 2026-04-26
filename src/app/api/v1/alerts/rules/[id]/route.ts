import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

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

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  filter: z.object({
    departmentIds: z.array(z.string()).optional(),
    teamIds: z.array(z.string()).optional(),
    providers: z.array(z.string()).optional(),
    thresholdPct: z.number().min(0).max(1000).optional(),
  }).optional(),
  channelIds: z.array(z.string()).min(1).optional(),
  recipients: z.array(recipientSchema).optional(),
  throttleHours: z.number().int().min(0).max(720).optional(),
  muteUntil: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = await getOrgId();
  const rule = await prisma.alertRule.findFirst({ where: { orgId, id } });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.filter !== undefined) updates.filter = parsed.data.filter as never;
  if (parsed.data.channelIds !== undefined) updates.channelIds = parsed.data.channelIds;
  if (parsed.data.recipients !== undefined) updates.recipients = parsed.data.recipients as never;
  if (parsed.data.throttleHours !== undefined) updates.throttleHours = parsed.data.throttleHours;
  if (parsed.data.muteUntil !== undefined) {
    updates.muteUntil = parsed.data.muteUntil ? new Date(parsed.data.muteUntil) : null;
  }
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const updated = await prisma.alertRule.update({ where: { id }, data: updates });
  return NextResponse.json({ rule: updated });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = await getOrgId();
  const rule = await prisma.alertRule.findFirst({ where: { orgId, id } });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.alertRule.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
