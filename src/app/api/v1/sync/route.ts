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
  try {
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
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json(
      { error: message, hint: hintForError(message) },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    const orgId = await getOrgId();

    const logs = await prisma.syncLog.findMany({
      where: { orgId },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sync logs";
    return NextResponse.json(
      { error: message, hint: hintForError(message) },
      { status: 500 }
    );
  }
}

function hintForError(msg: string): string | undefined {
  const m = msg.toLowerCase();
  if (m.includes("password authentication") || m.includes("p1010") || m.includes("p1001")) {
    return "Database connection failed. Check that POSTGRES_PASSWORD in .env matches the running database, or run 'docker compose down -v && docker compose up -d' to reset.";
  }
  if (m.includes("findfirstorthrow") || m.includes("no organization")) {
    return "No organization record found. Database may be empty or migrations not applied.";
  }
  if (m.includes("401") || m.includes("invalid_api_key") || m.includes("authentication")) {
    return "Provider API key was rejected. Verify the key type (Anthropic needs an Admin key starting with sk-ant-admin) and that it has not been revoked.";
  }
  if (m.includes("403")) {
    return "Provider API key was accepted but lacks permission for this endpoint. Confirm the key has the right scopes.";
  }
  return undefined;
}
