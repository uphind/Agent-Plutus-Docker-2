import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { encrypt } from "@/lib/encryption";
import { getAccessToken, fetchFieldDiscovery } from "@/lib/graph/client";
import { buildAvailableFields } from "@/lib/graph/mapper";

const connectSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  graphEndpoint: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  const orgId = await getOrgId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { tenantId, clientId, clientSecret, graphEndpoint } = parsed.data;
  const encryptedSecret = encrypt(clientSecret);
  const endpoint = graphEndpoint || "https://graph.microsoft.com/v1.0";

  try {
    const token = await getAccessToken(tenantId, clientId, encryptedSecret);
    const discovery = await fetchFieldDiscovery(token, endpoint);

    await prisma.graphConfig.upsert({
      where: { orgId },
      update: { tenantId, clientId, encryptedSecret, graphEndpoint: endpoint, isActive: true },
      create: { orgId, tenantId, clientId, encryptedSecret, graphEndpoint: endpoint },
    });

    const availableFields = buildAvailableFields(discovery.bestSample, discovery.unionKeys);

    return NextResponse.json({
      success: true,
      sampleUser: discovery.bestSample,
      availableFields,
      sampledCount: discovery.sampledCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connection failed" },
      { status: 400 }
    );
  }
}
