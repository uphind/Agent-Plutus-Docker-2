import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { listConversations } from "@/lib/alerts/channels/slack-bot";

export async function GET() {
  const orgId = await getOrgId();
  const install = await prisma.slackInstallation.findUnique({ where: { orgId } });
  if (!install) {
    return NextResponse.json({ error: "Slack workspace is not connected" }, { status: 400 });
  }
  try {
    const channels = await listConversations(install.botTokenEncrypted);
    return NextResponse.json({ channels });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list Slack channels" },
      { status: 500 },
    );
  }
}
