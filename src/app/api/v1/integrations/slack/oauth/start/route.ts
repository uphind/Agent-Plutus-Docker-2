import { NextResponse } from "next/server";
import { getOrgId } from "@/lib/org";
import { buildState, getSlackOAuthCreds, slackAuthorizeUrl } from "@/lib/alerts/slack-oauth";

export async function GET() {
  const orgId = await getOrgId();
  const creds = await getSlackOAuthCreds(orgId);
  if (!creds) {
    return NextResponse.json(
      {
        error: "Slack OAuth is not configured. Open Settings → Alerts → Setup Slack and paste your Slack App credentials first.",
      },
      { status: 400 },
    );
  }
  const state = buildState(orgId);
  return NextResponse.redirect(slackAuthorizeUrl(creds, state));
}
