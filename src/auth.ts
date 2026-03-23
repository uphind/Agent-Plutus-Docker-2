import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { SAML } from "@node-saml/node-saml";
import { encode } from "next-auth/jwt";

function getOIDCProvider() {
  const issuer = process.env.SSO_ISSUER;
  const clientId = process.env.SSO_CLIENT_ID;
  const clientSecret = process.env.SSO_CLIENT_SECRET;

  if (!issuer || !clientId || !clientSecret) {
    return null;
  }

  return {
    id: "oidc",
    name: "SSO",
    type: "oidc" as const,
    issuer,
    clientId,
    clientSecret,
    authorization: { params: { scope: "openid email profile" } },
  };
}

const config: NextAuthConfig = {
  providers: (() => {
    const providers = [];
    const oidc = getOIDCProvider();
    if (oidc) providers.push(oidc);

    providers.push(
      Credentials({
        id: "saml-callback",
        name: "SAML",
        credentials: {
          email: {},
          name: {},
        },
        async authorize(credentials) {
          if (!credentials?.email) return null;
          return {
            id: credentials.email as string,
            email: credentials.email as string,
            name: (credentials.name as string) || (credentials.email as string),
          };
        },
      })
    );

    return providers;
  })(),

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (token.email) {
        session.user.email = token.email as string;
      }
      if (token.name) {
        session.user.name = token.name as string;
      }
      return session;
    },
  },

  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

export function getSamlClient(): SAML | null {
  const entryPoint = process.env.SSO_SAML_ENTRY_POINT;
  const issuer = process.env.SSO_SAML_ISSUER;
  const cert = process.env.SSO_SAML_CERT;

  if (!entryPoint || !issuer || !cert) return null;

  return new SAML({
    entryPoint,
    issuer,
    idpCert: cert,
    callbackUrl: `${process.env.AUTH_URL ?? "https://localhost"}/api/auth/saml/acs`,
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: false,
  });
}

export { encode as encodeJwt };
