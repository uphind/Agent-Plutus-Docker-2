import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

const overrideSchema = z.object({
  overrides: z.array(
    z.object({
      systemTerm: z.string().min(1),
      customTerm: z.string().min(1),
    })
  ),
});

export async function GET() {
  const orgId = await getOrgId();

  const overrides = await prisma.terminologyOverride.findMany({
    where: { orgId },
    select: { systemTerm: true, customTerm: true },
  });

  const map: Record<string, string> = {};
  for (const o of overrides) {
    map[o.systemTerm] = o.customTerm;
  }

  return NextResponse.json({ overrides: map });
}

export async function PUT(request: NextRequest) {
  const orgId = await getOrgId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const ops = parsed.data.overrides.map((o) =>
    prisma.terminologyOverride.upsert({
      where: {
        orgId_systemTerm: { orgId, systemTerm: o.systemTerm },
      },
      update: { customTerm: o.customTerm },
      create: { orgId, systemTerm: o.systemTerm, customTerm: o.customTerm },
    })
  );

  await prisma.$transaction(ops);

  return NextResponse.json({ success: true });
}
