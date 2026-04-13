import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { discoverModels, clearModelCache } from "@/lib/models/discovery";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";

  if (refresh) {
    clearModelCache();
  }

  const credentials = await prisma.providerCredential.findMany({
    where: { orgId, isActive: true },
    select: { provider: true, encryptedApiKey: true },
  });

  if (credentials.length === 0) {
    return NextResponse.json({ models: [], message: "No provider credentials configured" });
  }

  try {
    const models = await discoverModels(
      credentials.map((c) => ({
        provider: c.provider,
        encryptedApiKey: c.encryptedApiKey,
      }))
    );

    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed", models: [] },
      { status: 500 }
    );
  }
}
