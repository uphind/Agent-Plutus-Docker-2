import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encodeJwt } from "@/auth";
import { getSamlClient } from "@/lib/saml";
import { sanitizeCallbackUrl } from "@/lib/safe-redirect";

export async function POST(request: NextRequest) {
  const saml = getSamlClient();
  if (!saml) {
    return NextResponse.json({ error: "SAML not configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const samlResponse = formData.get("SAMLResponse") as string;
  const relayState = formData.get("RelayState");
  const callbackUrl = sanitizeCallbackUrl(typeof relayState === "string" ? relayState : null) ?? "/dashboard";
  if (!samlResponse) {
    return NextResponse.json({ error: "Missing SAMLResponse" }, { status: 400 });
  }

  try {
    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });

    if (!profile) {
      return NextResponse.json({ error: "No profile in SAML response" }, { status: 400 });
    }

    const email = String(profile.nameID || profile.email || "");
    const firstName = profile.firstName ? String(profile.firstName) : "";
    const lastName = profile.lastName ? String(profile.lastName) : "";
    const name: string =
      (firstName && lastName ? `${firstName} ${lastName}` : "") ||
      String(profile.displayName || "") ||
      profile.nameID ||
      email;

    if (!email) {
      return NextResponse.json({ error: "No email in SAML assertion" }, { status: 400 });
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "AUTH_SECRET not set" }, { status: 500 });
    }

    const isSecure = process.env.NODE_ENV === "production";
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    const token = await encodeJwt({
      token: { email, name, sub: email },
      secret,
      salt: cookieName,
      maxAge: 30 * 24 * 60 * 60,
    });

    const cookieStore = await cookies();
    cookieStore.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    const baseUrl = process.env.AUTH_URL || "https://localhost";
    return NextResponse.redirect(`${baseUrl}${callbackUrl}`);
  } catch (err) {
    console.error("[SAML ACS] Validation failed:", err);
    const baseUrl = process.env.AUTH_URL || "https://localhost";
    return NextResponse.redirect(`${baseUrl}/login?error=SAMLValidationFailed`);
  }
}
