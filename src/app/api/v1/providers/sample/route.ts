import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { decrypt } from "@/lib/encryption";
import { getAdapter } from "@/lib/providers";
import { Provider } from "@/generated/prisma/client";

const VALID_PROVIDERS = new Set(["anthropic", "anthropic_compliance", "anthropic_analytics", "openai", "cursor", "gemini", "vertex"]);

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const provider = request.nextUrl.searchParams.get("provider");

  if (!provider || !VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const credential = await prisma.providerCredential.findUnique({
    where: { orgId_provider: { orgId, provider: provider as Provider } },
  });

  if (!credential || !credential.isActive) {
    return NextResponse.json(
      { error: "Provider not configured. Add an API key first." },
      { status: 404 }
    );
  }

  const adapter = getAdapter(provider as Provider);

  if (!adapter.fetchSample) {
    return NextResponse.json(
      { error: "Sample fetch not supported for this provider" },
      { status: 400 }
    );
  }

  try {
    const apiKey = decrypt(credential.encryptedApiKey);
    const sample = await adapter.fetchSample(apiKey);

    return NextResponse.json({
      provider,
      availableFields: sample.availableFields,
      rows: sample.rows,
      rowCount: sample.rows.length,
    });
  } catch (err) {
    console.error(`[providers/sample] ${provider}:`, err);
    const isAuthError =
      err instanceof Error &&
      (err.message.includes("401") || err.message.includes("403"));
    return NextResponse.json(
      {
        error: isAuthError
          ? "Authentication failed — check your API key"
          : "Failed to fetch sample data from the provider",
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
