"use client";

import Image from "next/image";
import { Shield, BarChart3, Users, Zap } from "lucide-react";

interface LoginClientProps {
  ssoProvider: string;
  callbackUrl: string;
  error: string | null;
  signInAction?: () => Promise<void>;
}

const features = [
  { icon: BarChart3, title: "Usage Analytics", desc: "Track AI spend across teams and departments" },
  { icon: Users, title: "Team Management", desc: "Monitor per-user and per-team consumption" },
  { icon: Shield, title: "Budget Controls", desc: "Set limits and alerts before costs spike" },
  { icon: Zap, title: "Real-time Sync", desc: "Automated data sync with AI providers" },
];

export function LoginClient({ ssoProvider, callbackUrl, error, signInAction }: LoginClientProps) {
  const handleSAMLSignIn = () => {
    window.location.href = `/api/auth/saml/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] relative flex-col justify-between p-10 text-white overflow-hidden bg-[#0f172a]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(22,22,231,0.15),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(22,22,231,0.1),transparent_60%)]" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-16">
            <Image src="/logo/symbol.svg" alt="Agent Plutus" width={36} height={36} className="brightness-0 invert" />
            <Image src="/logo/text-white.svg" alt="Agent Plutus" width={140} height={28} />
          </div>

          <h2 className="text-2xl font-bold mb-3">Enterprise AI Cost Intelligence</h2>
          <p className="text-sm text-gray-400 mb-10 leading-relaxed">
            Monitor, manage, and optimise your organisation&apos;s AI spending across every provider, team, and user.
          </p>

          <div className="space-y-5">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  <f.icon className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-xs text-gray-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-gray-500">&copy; {new Date().getFullYear()} Agent Plutus</p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-10">
            <Image src="/logo/symbol.svg" alt="Agent Plutus" width={32} height={32} />
            <Image src="/logo/text-black.svg" alt="Agent Plutus" width={130} height={26} />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to your account to continue</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">
                  {error === "SAMLValidationFailed"
                    ? "SAML authentication failed. Please contact your IT administrator."
                    : error === "OAuthAccountNotLinked"
                      ? "This account is already linked to another sign-in method."
                      : "Authentication failed. Please try again."}
                </p>
              </div>
            )}

            {ssoProvider === "saml" ? (
              <button
                type="button"
                onClick={handleSAMLSignIn}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: "#1616e7" }}
              >
                <Shield className="h-4 w-4" />
                Sign in with SSO
              </button>
            ) : signInAction ? (
              <form action={signInAction}>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: "#1616e7" }}
                >
                  <Shield className="h-4 w-4" />
                  Sign in with SSO
                </button>
              </form>
            ) : null}

            <p className="text-xs text-gray-400 text-center mt-4">
              You will be redirected to your organisation&apos;s identity provider.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
