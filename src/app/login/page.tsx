"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const ssoProvider = process.env.NEXT_PUBLIC_SSO_PROVIDER || "oidc";

  const handleSignIn = () => {
    if (ssoProvider === "saml") {
      window.location.href = "/api/auth/saml/login";
    } else {
      window.location.href = `/api/auth/signin/oidc?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 rounded-xl bg-indigo-500 flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tokenear</h1>
          <p className="text-sm text-gray-500 mt-1">AI Usage Analytics</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">
                {error === "SAMLValidationFailed"
                  ? "SAML authentication failed. Please contact your IT administrator."
                  : "Authentication failed. Please try again."}
              </p>
            </div>
          )}

          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 transition-colors"
          >
            Sign in with SSO
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            You will be redirected to your organization&apos;s identity provider.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
