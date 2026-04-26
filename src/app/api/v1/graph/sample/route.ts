import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { getAccessToken, fetchFieldDiscovery } from "@/lib/graph/client";
import { buildAvailableFields } from "@/lib/graph/mapper";

export async function GET() {
  const orgId = await getOrgId();

  const config = await prisma.graphConfig.findUnique({ where: { orgId } });
  if (!config) {
    return NextResponse.json(
      { error: "Graph API not configured. Connect first." },
      { status: 404 }
    );
  }

  try {
    const token = await getAccessToken(config.tenantId, config.clientId, config.encryptedSecret);
    const discovery = await fetchFieldDiscovery(token, config.graphEndpoint);
    const availableFields = buildAvailableFields(discovery.bestSample, discovery.unionKeys);

    return NextResponse.json({
      sampleUser: discovery.bestSample,
      availableFields,
      sampledCount: discovery.sampledCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch sample" },
      { status: 500 }
    );
  }
}
