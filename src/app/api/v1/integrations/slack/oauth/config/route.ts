import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { encrypt } from "@/lib/encryption";

const putSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url().refine(
    (u) => u.startsWith("https://") || u.startsWith("http://localhost"),
    { message: "Redirect URI must use HTTPS (Slack rejects HTTP except for localhost)" },
  ),
});

export async function GET() {
  const orgId = await getOrgId();
  const row = await prisma.slackOAuthSettings.findUnique({
    where: { orgId },
    select: { clientId: true, redirectUri: true, updatedAt: true },
  });
  return NextResponse.json({
    configured: Boolean(row),
    clientId: row?.clientId ?? null,
    redirectUri: row?.redirectUri ?? null,
    updatedAt: row?.updatedAt ?? null,
    envFallbackAvailable: Boolean(
      process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET && process.env.SLACK_REDIRECT_URI,
    ),
  });
}

export async function PUT(request: NextRequest) {
  const orgId = await getOrgId();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { clientId, clientSecret, redirectUri } = parsed.data;
  const row = await prisma.slackOAuthSettings.upsert({
    where: { orgId },
    create: {
      orgId,
      clientId,
      clientSecretEncrypted: encrypt(clientSecret),
      redirectUri,
    },
    update: {
      clientId,
      clientSecretEncrypted: encrypt(clientSecret),
      redirectUri,
    },
  });
  return NextResponse.json({
    configured: true,
    clientId: row.clientId,
    redirectUri: row.redirectUri,
    updatedAt: row.updatedAt,
  });
}

export async function DELETE() {
  const orgId = await getOrgId();
  await prisma.slackOAuthSettings.deleteMany({ where: { orgId } });
  return NextResponse.json({ configured: false });
}
