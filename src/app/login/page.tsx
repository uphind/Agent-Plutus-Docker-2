import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { LoginClient } from "./login-client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session) {
    redirect(params.callbackUrl || "/dashboard");
  }

  const ssoProvider = process.env.SSO_PROVIDER || "oidc";
  const callbackUrl = params.callbackUrl || "/dashboard";
  const error = params.error || null;

  async function signInWithOIDC() {
    "use server";
    await signIn("oidc", { redirectTo: callbackUrl });
  }

  return (
    <LoginClient
      ssoProvider={ssoProvider}
      callbackUrl={callbackUrl}
      error={error}
      signInAction={ssoProvider === "oidc" ? signInWithOIDC : undefined}
      demoMode={process.env.DEMO_MODE === "true"}
    />
  );
}
