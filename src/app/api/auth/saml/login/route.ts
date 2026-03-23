import { NextResponse } from "next/server";
import { getSamlClient } from "@/auth";

export async function GET() {
  const saml = getSamlClient();
  if (!saml) {
    return NextResponse.json(
      { error: "SAML is not configured. Set SSO_SAML_ENTRY_POINT, SSO_SAML_ISSUER, and SSO_SAML_CERT." },
      { status: 500 }
    );
  }

  const loginUrl = await saml.getAuthorizeUrlAsync("", undefined, {});
  return NextResponse.redirect(loginUrl);
}
