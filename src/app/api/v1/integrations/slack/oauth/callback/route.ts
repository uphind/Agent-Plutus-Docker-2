import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { exchangeCode, getSlackOAuthCreds, verifyState } from "@/lib/alerts/slack-oauth";

function returnUrl(status: string, error?: string): string {
  const base = process.env.APP_BASE_URL ?? "";
  const params = new URLSearchParams({ tab: "alerts", slack: status });
  if (error) params.set("slack_error", error);
  return `${base}/dashboard/settings?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(returnUrl("error", error));
  }
  if (!code || !state) {
    return NextResponse.redirect(returnUrl("error", "missing_code_or_state"));
  }

  const verified = verifyState(state);
  if (!verified.ok) {
    return NextResponse.redirect(returnUrl("error", "bad_state"));
  }

  const creds = await getSlackOAuthCreds(verified.orgId);
  if (!creds) {
    return NextResponse.redirect(returnUrl("error", "oauth_not_configured"));
  }

  const exchange = await exchangeCode(creds, code);
  if (!exchange.ok || !exchange.access_token || !exchange.bot_user_id || !exchange.team?.id) {
    return NextResponse.redirect(returnUrl("error", exchange.error ?? "exchange_failed"));
  }

  await prisma.slackInstallation.upsert({
    where: { orgId: verified.orgId },
    create: {
      orgId: verified.orgId,
      teamId: exchange.team.id,
      teamName: exchange.team.name ?? exchange.team.id,
      botUserId: exchange.bot_user_id,
      botTokenEncrypted: encrypt(exchange.access_token),
      scopes: exchange.scope ?? "",
    },
    update: {
      teamId: exchange.team.id,
      teamName: exchange.team.name ?? exchange.team.id,
      botUserId: exchange.bot_user_id,
      botTokenEncrypted: encrypt(exchange.access_token),
      scopes: exchange.scope ?? "",
    },
  });

  return NextResponse.redirect(returnUrl("connected"));
}
