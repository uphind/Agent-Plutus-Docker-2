import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function PUT() {
  const orgId = await getOrgId();

  await prisma.notification.updateMany({
    where: { orgId, isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({ success: true });
}
