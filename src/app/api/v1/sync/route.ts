import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { syncProvider, syncAllProviders } from "@/lib/sync/sync-engine";
import { generateNotifications } from "@/lib/notifications";
import { Provider } from "@/generated/prisma/client";

const syncSchema = z.object({
  provider: z.nativeEnum(Provider).optional(),
});

export async function POST(request: NextRequest) {
  const orgId = await getOrgId();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // No body = sync all
  }

  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.provider) {
      const result = await syncProvider(orgId, parsed.data.provider);
      await generateNotifications(orgId).catch(() => {});
      return NextResponse.json({ success: true, provider: parsed.data.provider, recordsCount: result.recordsCount });
    } else {
      const results = await syncAllProviders(orgId);
      await generateNotifications(orgId).catch(() => {});
      return NextResponse.json({ success: true, results });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const logs = await prisma.syncLog.findMany({
    where: { orgId },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ logs });
}
