import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { getDefaultMappings, getSourceFields } from "@/lib/providers/field-definitions";

const VALID_PROVIDERS = ["anthropic", "openai", "cursor", "gemini", "vertex"];

function entityType(provider: string) {
  return `provider:${provider}`;
}

const saveSchema = z.object({
  provider: z.string().min(1),
  mappings: z.array(
    z.object({
      sourceField: z.string().min(1),
      targetField: z.string().min(1),
    })
  ),
});

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const provider = request.nextUrl.searchParams.get("provider");

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const stored = await prisma.fieldMapping.findMany({
    where: { orgId, entityType: entityType(provider) },
    select: { sourceField: true, targetField: true },
  });

  const mappings =
    stored.length > 0 ? stored : getDefaultMappings(provider);

  return NextResponse.json({
    provider,
    sourceFields: getSourceFields(provider),
    mappings,
    isDefault: stored.length === 0,
  });
}

export async function POST(request: NextRequest) {
  const orgId = await getOrgId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { provider, mappings: rawMappings } = parsed.data;

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  // Deduplicate by targetField — last mapping wins (matches UI behavior)
  const deduped = new Map<string, string>();
  for (const m of rawMappings) {
    deduped.set(m.targetField, m.sourceField);
  }
  const mappings = [...deduped.entries()].map(([targetField, sourceField]) => ({
    sourceField,
    targetField,
  }));

  const et = entityType(provider);

  await prisma.fieldMapping.deleteMany({ where: { orgId, entityType: et } });

  if (mappings.length > 0) {
    const ops = mappings.map((m) =>
      prisma.fieldMapping.create({
        data: {
          orgId,
          entityType: et,
          sourceField: m.sourceField,
          targetField: m.targetField,
        },
      })
    );
    await prisma.$transaction(ops);
  }

  return NextResponse.json({ success: true, count: mappings.length });
}
