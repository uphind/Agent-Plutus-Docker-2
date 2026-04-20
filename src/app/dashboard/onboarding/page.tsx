"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export default function OnboardingPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <Header
        title="Get started"
        description="A short setup wizard to wire Agent-Plutus into your AI providers."
      />
      <OnboardingWizard
        onComplete={() => router.push("/dashboard")}
      />
    </div>
  );
}
