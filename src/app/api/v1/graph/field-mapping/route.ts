import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

const mappingSchema = z.object({
  mappings: z.array(
    z.object({
      sourceField: z.string().min(1),
      targetField: z.string().min(1),
    })
  ),
});

export async function GET() {
  const orgId = await getOrgId();

  const mappings = await prisma.fieldMapping.findMany({
    where: { orgId, entityType: "user" },
    select: { sourceField: true, targetField: true },
  });

  return NextResponse.json({ mappings });
}

export async function POST(request: NextRequest) {
  const orgId = await getOrgId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mappingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await prisma.fieldMapping.deleteMany({ where: { orgId, entityType: "user" } });

  const ops = parsed.data.mappings.map((m) =>
    prisma.fieldMapping.create({
      data: {
        orgId,
        entityType: "user",
        sourceField: m.sourceField,
        targetField: m.targetField,
      },
    })
  );

  await prisma.$transaction(ops);

  return NextResponse.json({ success: true, count: ops.length });
}
