import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrgId } from "@/lib/org";
import { sendTestThroughChannel } from "@/lib/alerts/dispatch";

const bodySchema = z.object({
  testRecipient: z.string().optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = await getOrgId();

  let raw: unknown = {};
  try { raw = await request.json(); } catch { /* empty body ok */ }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const attempts = await sendTestThroughChannel(orgId, id, parsed.data.testRecipient);
    const failed = attempts.find((a) => a.status === "failed");
    return NextResponse.json({
      ok: !failed,
      attempts,
      ...(failed ? { error: failed.error ?? "Send failed" } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 },
    );
  }
}
