import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function POST() {
  const orgId = await getOrgId();
  await prisma.slackInstallation.deleteMany({ where: { orgId } });
  return NextResponse.json({ disconnected: true });
}
