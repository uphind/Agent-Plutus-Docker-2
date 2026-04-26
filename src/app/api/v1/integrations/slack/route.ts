import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { getSlackOAuthCreds } from "@/lib/alerts/slack-oauth";

export async function GET() {
  const orgId = await getOrgId();
  const [install, creds] = await Promise.all([
    prisma.slackInstallation.findUnique({
      where: { orgId },
      select: {
        teamId: true,
        teamName: true,
        botUserId: true,
        scopes: true,
        installedAt: true,
        updatedAt: true,
      },
    }),
    getSlackOAuthCreds(orgId),
  ]);
  return NextResponse.json({
    connected: Boolean(install),
    install,
    oauthConfigured: Boolean(creds),
    oauthSource: creds?.source ?? null,
  });
}
