import { NextResponse } from "next/server";
import { getOrgId } from "@/lib/org";
import { evaluateAlerts, summarizeAlerts } from "@/lib/alerts/evaluate";

export async function GET() {
  const orgId = await getOrgId();
  const alerts = await evaluateAlerts(orgId);
  return NextResponse.json({ alerts, summary: summarizeAlerts(alerts) });
}
