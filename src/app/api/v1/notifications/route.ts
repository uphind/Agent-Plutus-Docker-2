import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET() {
  const orgId = await getOrgId();

  const notifications = await prisma.notification.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { orgId, isRead: false },
  });

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      severity: n.severity,
      title: n.title,
      message: n.message,
      entityType: n.entityType,
      entityId: n.entityId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
}
