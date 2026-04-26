import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET() {
  const orgId = await getOrgId();
  const [settings, conversationCount] = await Promise.all([
    prisma.teamsBotSettings.findUnique({
      where: { orgId },
      select: {
        microsoftAppId: true,
        tenantId: true,
        publicBaseUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.teamsConversation.count({ where: { orgId } }),
  ]);
  return NextResponse.json({
    configured: Boolean(settings),
    settings,
    conversationCount,
  });
}
