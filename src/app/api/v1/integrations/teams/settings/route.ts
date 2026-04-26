import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { encrypt } from "@/lib/encryption";

const putSchema = z.object({
  microsoftAppId: z
    .string()
    .min(1)
    .regex(
      /^[0-9a-fA-F-]{36}$/,
      "Microsoft App ID must be the GUID from your Azure AD App Registration (8-4-4-4-12 hex)",
    ),
  microsoftAppPassword: z.string().min(1, "Microsoft App password (client secret) is required"),
  tenantId: z.string().optional().nullable(),
  publicBaseUrl: z
    .string()
    .url()
    .optional()
    .nullable()
    .refine((u) => !u || u.startsWith("https://") || u.startsWith("http://localhost"), {
      message: "Public base URL must use HTTPS (or http://localhost for development)",
    }),
});

export async function PUT(request: NextRequest) {
  const orgId = await getOrgId();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { microsoftAppId, microsoftAppPassword, tenantId, publicBaseUrl } = parsed.data;
  const row = await prisma.teamsBotSettings.upsert({
    where: { orgId },
    create: {
      orgId,
      microsoftAppId,
      microsoftAppPasswordEncrypted: encrypt(microsoftAppPassword),
      tenantId: tenantId ?? null,
      publicBaseUrl: publicBaseUrl ?? null,
    },
    update: {
      microsoftAppId,
      microsoftAppPasswordEncrypted: encrypt(microsoftAppPassword),
      tenantId: tenantId ?? null,
      publicBaseUrl: publicBaseUrl ?? null,
    },
  });

  return NextResponse.json({
    configured: true,
    settings: {
      microsoftAppId: row.microsoftAppId,
      tenantId: row.tenantId,
      publicBaseUrl: row.publicBaseUrl,
      updatedAt: row.updatedAt,
    },
  });
}

export async function DELETE() {
  const orgId = await getOrgId();
  await prisma.teamsBotSettings.deleteMany({ where: { orgId } });
  await prisma.teamsConversation.deleteMany({ where: { orgId } });
  return NextResponse.json({ configured: false });
}
