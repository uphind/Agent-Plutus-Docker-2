import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

/**
 * Tracks completion of the in-app onboarding wizard. The flag is used by the
 * dashboard to decide whether to auto-redirect first-time users to the
 * /dashboard/onboarding page.
 *
 * GET    -> { completed: boolean, completedAt }
 * POST   -> body: { completed: boolean } — set or clear the flag.
 */

const bodySchema = z.object({
  completed: z.boolean(),
});

export async function GET() {
  try {
    const orgId = await getOrgId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { onboardingCompletedAt: true },
    });
    return NextResponse.json({
      completed: !!org?.onboardingCompletedAt,
      completedAt: org?.onboardingCompletedAt?.toISOString() ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let orgId: string;
  try {
    orgId = await getOrgId();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { onboardingCompletedAt: parsed.data.completed ? new Date() : null },
  });

  return NextResponse.json({ completed: parsed.data.completed });
}
