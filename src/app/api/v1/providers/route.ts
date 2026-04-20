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

function dbErrorHint(msg: string): string | undefined {
  const m = msg.toLowerCase();
  if (m.includes("password authentication") || m.includes("p1010") || m.includes("p1001")) {
    return "Database connection failed. Check that POSTGRES_PASSWORD in .env matches the running database.";
  }
  if (m.includes("findfirstorthrow") || m.includes("no organization")) {
    return "No organization record found. Migrations may not have run.";
  }
  return undefined;
}

export async function GET(_request: NextRequest) {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load providers";
    return NextResponse.json(
      { error: message, hint: dbErrorHint(message) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let orgId: string;
  try {
    orgId = await getOrgId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to identify organization";
    return NextResponse.json(
      { error: message, hint: dbErrorHint(message) },
      { status: 500 }
    );
  }

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
    let isValid = false;
    try {
      isValid = await adapter.testConnection(api_key);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      return NextResponse.json(
        { error: `Connection test failed: ${message}` },
        { status: 422 }
      );
    }
    if (!isValid) {
      const hints: Record<string, string> = {
        anthropic:
          "Anthropic requires an Admin API key (starts with sk-ant-admin...), not a regular API key. Generate one at console.anthropic.com → Settings → Admin API Keys.",
        anthropic_compliance:
          "Anthropic Compliance requires a Compliance Access Key with read:compliance_activities scope. Generate one at console.anthropic.com → Organization Settings → Data and Privacy → Compliance API. Enterprise plans only.",
        anthropic_analytics:
          "Anthropic Analytics requires an Analytics API key with the read:analytics scope. As a Primary Owner, generate one at claude.ai/analytics/api-keys. Enterprise plans only — data is delayed by 3 days.",
        openai:
          "OpenAI requires an Admin API key with organization-level permissions. Generate one at platform.openai.com → Settings → Admin API keys.",
        gemini:
          "Gemini requires a valid Google AI Studio API key. Generate one at aistudio.google.com/api-keys. Note: usage analytics are not yet available via API.",
        cursor:
          "Cursor requires an Enterprise Analytics API key. Generate one from your team settings at cursor.com/settings.",
        vertex:
          "Vertex AI requires a GCP Service Account JSON key with Monitoring Viewer permissions. Paste the full JSON content.",
        microsoft_copilot:
          "Microsoft 365 Copilot is reached via Microsoft Graph, not a single static vendor key. Use an Entra ID access token (Bearer eyJ…). /me validates the token; Copilot usage reports need Reports.Read.All (see Microsoft Graph documentation).",
        lovable:
          "Lovable uses a Bearer token for api.lovable.dev. Generate or copy an API token from your Lovable workspace settings.",
        n8n:
          "n8n expects JSON in the API key field: {\"v\":1,\"baseUrl\":\"https://your-n8n.example.com\",\"apiKey\":\"…\"} with your instance URL and n8n API key (Settings → API).",
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

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save credential";
    return NextResponse.json(
      { error: message, hint: dbErrorHint(message) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete credential";
    return NextResponse.json(
      { error: message, hint: dbErrorHint(message) },
      { status: 500 }
    );
  }
}
