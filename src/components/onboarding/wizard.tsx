"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Circle, ChevronRight } from "lucide-react";
import { api } from "@/lib/dashboard-api";
import { StepWelcome } from "./step-welcome";
import { StepAiAssistant } from "./step-ai-assistant";
import { StepAiTools } from "./step-ai-tools";
import { StepAddProvider } from "./step-add-provider";
import { StepConfirmMapping } from "./step-confirm-mapping";
import { StepDone } from "./step-done";

/**
 * Onboarding wizard.
 *
 * Five-step linear flow that gets a brand-new instance from "no providers,
 * no chatbot" to "first provider connected, mappings confirmed, chatbot
 * working". Each step component manages its own state and reports completion
 * back via setStepData; the wizard owns navigation, the progress bar, and
 * the top-level "Skip onboarding" / "Finish" actions.
 */

export type OnboardingStepId =
  | "welcome"
  | "ai-assistant"
  | "ai-tools"
  | "add-provider"
  | "confirm-mapping"
  | "done";

export interface DiscoveredEndpointSummary {
  id: string;
  apiName: string;
  endpointName: string;
  fields: string[];
  body: unknown;
}

export interface OnboardingFlowState {
  /** internal Provider id (anthropic / openai / etc.) selected via Discovery. */
  internalProvider: string | null;
  /** Discovery endpoints that came back ok / no_data for that internal provider. */
  discoveredEndpoints: DiscoveredEndpointSummary[];
  /** Raw API key the user pasted in Add Provider — held in memory only. */
  providerApiKey: string;
  /** Required-target completion check passed in step-confirm-mapping. */
  mappingConfirmed: boolean;
}

const STEPS: Array<{ id: OnboardingStepId; label: string; optional?: boolean }> = [
  { id: "welcome",          label: "Welcome" },
  { id: "ai-assistant",     label: "Chatbot",        optional: true },
  { id: "ai-tools",         label: "AI Tools",       optional: true },
  { id: "add-provider",     label: "Add provider" },
  { id: "confirm-mapping",  label: "Confirm mapping" },
  { id: "done",             label: "Done" },
];

interface OnboardingWizardProps {
  initialStep?: OnboardingStepId;
  /** Called after the user finishes the wizard (or chooses to skip the rest). */
  onComplete: (opts: { skipped: boolean }) => void;
  /** Optional close button — used when the wizard is in a modal. */
  onClose?: () => void;
}

export function OnboardingWizard({ initialStep = "welcome", onComplete, onClose }: OnboardingWizardProps) {
  const [stepId, setStepId] = useState<OnboardingStepId>(initialStep);
  const [flow, setFlow] = useState<OnboardingFlowState>({
    internalProvider: null,
    discoveredEndpoints: [],
    providerApiKey: "",
    mappingConfirmed: false,
  });

  const stepIndex = STEPS.findIndex((s) => s.id === stepId);
  const isLast = stepIndex === STEPS.length - 1;

  const goNext = useCallback(() => {
    setStepId((cur) => {
      const i = STEPS.findIndex((s) => s.id === cur);
      return STEPS[Math.min(i + 1, STEPS.length - 1)].id;
    });
  }, []);

  const goBack = useCallback(() => {
    setStepId((cur) => {
      const i = STEPS.findIndex((s) => s.id === cur);
      return STEPS[Math.max(i - 1, 0)].id;
    });
  }, []);

  const skipRest = useCallback(async () => {
    try {
      await api.setOnboardingState(true);
    } catch {
      // non-fatal — auto-redirect won't fire if providers exist anyway
    }
    onComplete({ skipped: true });
  }, [onComplete]);

  const finish = useCallback(async () => {
    try {
      await api.setOnboardingState(true);
    } catch {
      /* ignore */
    }
    onComplete({ skipped: false });
  }, [onComplete]);

  const updateFlow = useCallback((next: Partial<OnboardingFlowState>) => {
    setFlow((prev) => ({ ...prev, ...next }));
  }, []);

  const stepBody = useMemo(() => {
    switch (stepId) {
      case "welcome":
        return <StepWelcome onNext={goNext} />;
      case "ai-assistant":
        return <StepAiAssistant onNext={goNext} onSkip={goNext} />;
      case "ai-tools":
        return <StepAiTools onNext={goNext} onSkip={goNext} />;
      case "add-provider":
        return (
          <StepAddProvider
            onNext={(args) => {
              updateFlow({
                internalProvider: args.internalProvider,
                discoveredEndpoints: args.discoveredEndpoints,
                providerApiKey: args.apiKey,
              });
              goNext();
            }}
          />
        );
      case "confirm-mapping":
        return (
          <StepConfirmMapping
            internalProvider={flow.internalProvider}
            discoveredEndpoints={flow.discoveredEndpoints}
            providerApiKey={flow.providerApiKey}
            onNext={() => {
              updateFlow({ mappingConfirmed: true });
              goNext();
            }}
          />
        );
      case "done":
        return <StepDone onFinish={finish} />;
      default:
        return null;
    }
  }, [stepId, goNext, updateFlow, flow, finish]);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            {STEPS.filter((s) => s.id !== "done").map((s, i) => {
              const idx = STEPS.findIndex((x) => x.id === s.id);
              const reached = idx <= stepIndex;
              const isCurrent = s.id === stepId;
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  {reached ? (
                    <CheckCircle className={`h-3.5 w-3.5 ${isCurrent ? "text-brand" : "text-emerald-500"}`} />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                  <span
                    className={`text-xs ${
                      isCurrent ? "font-semibold text-foreground" : reached ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                    {s.optional && <span className="text-muted-foreground ml-1">(optional)</span>}
                  </span>
                  {i < STEPS.filter((x) => x.id !== "done").length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 ml-0.5" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isLast && stepId !== "welcome" && (
              <Button variant="ghost" size="sm" onClick={goBack}>Back</Button>
            )}
            {!isLast && (
              <Button variant="ghost" size="sm" onClick={skipRest}>
                Skip onboarding
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </Card>

      {stepBody}
    </div>
  );
}
