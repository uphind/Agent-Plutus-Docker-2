import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { encrypt } from "@/lib/encryption";
import { Provider } from "@/generated/prisma/client";
import { getAdapter } from "@/lib/providers";

const providerSchema = z.object({
  provider: z.nativeEnum(Provider),
  api_key: z.string().min(1),
  label: z.string().optional(),
  skip_test: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const credentials = await prisma.providerCredential.findMany({
    where: { orgId },
    select: {
      id: true,
      provider: true,
      label: true,
      isActive: true,
      lastSyncAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ providers: credentials });
}

export async function POST(request: NextRequest) {
  const orgId = await getOrgId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = providerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { provider, api_key, label, skip_test } = parsed.data;

  // Test connection before saving (unless explicitly skipped)
  if (!skip_test) {
    const adapter = getAdapter(provider);
    const isValid = await adapter.testConnection(api_key);
    if (!isValid) {
      const hints: Record<string, string> = {
        anthropic:
          "Anthropic requires an Admin API key (starts with sk-ant-admin...), not a regular API key. Generate one at console.anthropic.com → Settings → Admin API Keys.",
        openai:
          "OpenAI requires an Admin API key with organization-level permissions. Generate one at platform.openai.com → Settings → Admin API keys.",
        gemini:
          "Gemini requires a valid Google AI Studio API key. Generate one at aistudio.google.com/api-keys. Note: usage analytics are not yet available via API.",
        cursor:
          "Cursor requires an Enterprise Analytics API key. Generate one from your team settings at cursor.com/settings.",
        vertex:
          "Vertex AI requires a GCP Service Account JSON key with Monitoring Viewer permissions. Paste the full JSON content.",
      };

      return NextResponse.json(
        {
          error: "Connection test failed",
          hint: hints[provider] ?? "Check that your API key is correct.",
        },
        { status: 422 }
      );
    }
  }

  const encryptedApiKey = encrypt(api_key);

  const credential = await prisma.providerCredential.upsert({
    where: { orgId_provider: { orgId, provider } },
    create: {
      orgId,
      provider,
      encryptedApiKey,
      label: label ?? null,
    },
    update: {
      encryptedApiKey,
      label: label ?? undefined,
      isActive: true,
    },
  });

  return NextResponse.json({
    success: true,
    provider: {
      id: credential.id,
      provider: credential.provider,
      label: credential.label,
      isActive: credential.isActive,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider") as Provider | null;

  if (!provider || !Object.values(Provider).includes(provider)) {
    return NextResponse.json({ error: "Valid provider query param required" }, { status: 400 });
  }

  await prisma.providerCredential.deleteMany({
    where: { orgId, provider },
  });

  return NextResponse.json({ success: true });
}
