import { NextRequest, NextResponse } from "next/server";
import { getSamlClient } from "@/lib/saml";
import { sanitizeCallbackUrl } from "@/lib/safe-redirect";

export async function GET(request: NextRequest) {
  const saml = getSamlClient();
  if (!saml) {
    return NextResponse.json(
      { error: "SAML is not configured. Set SSO_SAML_ENTRY_POINT, SSO_SAML_ISSUER, and SSO_SAML_CERT." },
      { status: 500 }
    );
  }

  const callbackUrl = sanitizeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"));
  const relayState = callbackUrl ?? "";

  const loginUrl = await saml.getAuthorizeUrlAsync(relayState, undefined, {});
  return NextResponse.redirect(loginUrl);
}
