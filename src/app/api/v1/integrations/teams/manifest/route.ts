import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

/**
 * Generate the Teams app manifest .zip the user uploads to Teams Admin Center
 * (or sideloads into a single team) to install the Agent Plutus bot. The zip
 * contains:
 *
 *   manifest.json    — schema 1.17 manifest pointing the bot's
 *                      messagingEndpoint at this deployment's
 *                      /api/v1/integrations/teams/messages route.
 *   color.png        — 192x192 brand color icon.
 *   outline.png      — 32x32 transparent outline icon.
 *
 * The org must have Teams credentials configured first (POST /settings).
 */

function baseUrl(override: string | null | undefined): string {
  return (
    override ??
    process.env.APP_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    ""
  ).replace(/\/$/, "");
}

// 192×192 solid square in the brand purple (#1616e7). Pre-generated PNG.
const COLOR_ICON_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAABS3GwHAAAAVklEQVR42u3RAQ0AAAjDMO5fNCCDkE6yc0kBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAdcG6jcQAdtBQEoAAAAASUVORK5CYII=";

// 32×32 outline-style icon (white square with rounded corners), transparent
// background — Teams renders this in monochrome regardless of source colors.
const OUTLINE_ICON_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAAAOEwn5AAAALklEQVR42u3OMQEAAAgDoNk/9DI4iIQyVTFsjRkAAQECBAgQIECAAAECBAj4OFiCALVj4D6PAAAAAElFTkSuQmCC";

function buildColorIcon(): Uint8Array {
  return Buffer.from(COLOR_ICON_BASE64, "base64");
}

function buildOutlineIcon(): Uint8Array {
  return Buffer.from(OUTLINE_ICON_BASE64, "base64");
}

export async function GET() {
  const orgId = await getOrgId();
  const settings = await prisma.teamsBotSettings.findUnique({ where: { orgId } });
  if (!settings) {
    return NextResponse.json(
      { error: "Set up Microsoft App credentials first." },
      { status: 400 },
    );
  }

  const url = baseUrl(settings.publicBaseUrl);
  if (!url) {
    return NextResponse.json(
      {
        error:
          "No public base URL configured. Set 'Public base URL' in Teams settings or APP_BASE_URL on the server.",
      },
      { status: 400 },
    );
  }

  const messagingEndpoint = `${url}/api/v1/integrations/teams/messages`;
  const manifest = {
    $schema:
      "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
    manifestVersion: "1.17",
    version: "1.0.0",
    id: randomUUID(),
    packageName: "com.agentplutus.alerts",
    developer: {
      name: "Agent Plutus",
      websiteUrl: url,
      privacyUrl: `${url}/privacy`,
      termsOfUseUrl: `${url}/terms`,
    },
    icons: { color: "color.png", outline: "outline.png" },
    name: { short: "Agent Plutus", full: "Agent Plutus — AI cost alerts" },
    description: {
      short: "AI spend alerts in Microsoft Teams.",
      full:
        "Agent Plutus posts proactive notifications about your AI spend — over-budget warnings, cost spikes, anomalies — directly into the Teams channels, group chats, and 1:1 chats you choose.",
    },
    accentColor: "#1616E7",
    bots: [
      {
        botId: settings.microsoftAppId,
        scopes: ["personal", "team", "groupChat"],
        supportsFiles: false,
        isNotificationOnly: true,
      },
    ],
    permissions: ["identity", "messageTeamMembers"],
    validDomains: [new URL(url).host],
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("color.png", buildColorIcon());
  zip.file("outline.png", buildOutlineIcon());
  const buf = await zip.generateAsync({ type: "uint8array" });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="agent-plutus-teams.zip"',
      "Cache-Control": "no-store",
    },
  });
}
