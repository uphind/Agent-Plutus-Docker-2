import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET() {
  const orgId = await getOrgId();
  const conversations = await prisma.teamsConversation.findMany({
    where: { orgId },
    orderBy: [{ conversationType: "asc" }, { lastSeenAt: "desc" }],
    select: {
      id: true,
      conversationId: true,
      conversationType: true,
      displayName: true,
      teamName: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ conversations });
}
