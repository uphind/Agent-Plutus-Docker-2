"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Circle, ChevronRight } from "lucide-react";
import { api } from "@/lib/dashboard-api";
import { StepWelcome } from "./step-welcome";
import { StepDirectory, type DirectoryStepResult } from "./step-directory";
import { StepDirectoryMapping } from "./step-directory-mapping";
import { StepTerminology } from "./step-terminology";
import { StepSelectProviders, type ProviderSelection } from "./step-select-providers";
import { StepAi } from "./step-ai";
import { StepProviderDiscovery, type ProviderDiscoveryResult } from "./step-provider-discovery";
import { StepConfirmMapping } from "./step-confirm-mapping";
import { StepDone } from "./step-done";

/**
 * Onboarding wizard.
 *
 * 1. Welcome
 * 2. Active Directory connect + sync frequency
 * 3. Confirm AD field mapping
 * 4. Confirm terminology
 * 5. Select providers (multi-select tile grid)
 * 6. AI Assistant (single combined key for chatbot + AI Tools)
 * 7. Per-provider loop:
 *      a. Filtered Discovery for that provider
 *      b. Confirm mapping (with the AI suggest button if AI Tools is set)
 * 8. Done
 *
 * The progress bar collapses the per-provider loop into one segment with a
 * subtle "X of Y" subtitle so the header stays compact.
 */

export type OnboardingStepId =
  | "welcome"
  | "directory"
  | "directory-mapping"
  | "terminology"
  | "select-providers"
  | "ai"
  | "provider-discovery"
  | "provider-mapping"
  | "done";

export interface DiscoveredEndpointSummary {
  id: string;
  apiName: string;
  endpointName: string;
  fields: string[];
  body: unknown;
}

export interface OnboardingFlowState {
  /** Multi-select picks from step 5. */
  selectedProviders: ProviderSelection[];
  /** Index into selectedProviders for the current loop iteration. */
  currentProviderIndex: number;
  /** Cached AD result so the mapping step doesn't re-fetch the sample. */
  directoryResult: DirectoryStepResult | null;
  /** Discovered endpoints for the CURRENT provider in the loop. */
  discoveredEndpoints: DiscoveredEndpointSummary[];
  /** Internal provider id matched in this loop iteration. */
  internalProvider: string | null;
  /** Provider key the user pasted in the loop's discovery step. */
  providerApiKey: string;
}

const STEP_LABELS: Record<OnboardingStepId, { label: string; optional?: boolean }> = {
  welcome:             { label: "Welcome" },
  directory:           { label: "Directory",         optional: true },
  "directory-mapping": { label: "AD mapping",        optional: true },
  terminology:         { label: "Terminology",       optional: true },
  "select-providers":  { label: "Providers" },
  ai:                  { label: "AI Assistant",      optional: true },
  "provider-discovery":{ label: "Discover" },
  "provider-mapping":  { label: "Map fields" },
  done:                { label: "Done" },
};

const HEADER_STEPS: OnboardingStepId[] = [
  "welcome",
  "directory",
  "directory-mapping",
  "terminology",
  "select-providers",
  "ai",
  "provider-discovery",
  "provider-mapping",
];

export type OnboardingWizardVariant = "full" | "add-provider";

interface OnboardingWizardProps {
  initialStep?: OnboardingStepId;
  /** `add-provider` hides the full progress header and streamlines copy for Settings → Add provider. */
  variant?: OnboardingWizardVariant;
  onComplete: (opts: { skipped: boolean }) => void;
  onClose?: () => void;
}

export function OnboardingWizard({
  initialStep = "welcome",
  variant = "full",
  onComplete,
  onClose,
}: OnboardingWizardProps) {
  const [stepId, setStepId] = useState<OnboardingStepId>(initialStep);
  const [flow, setFlow] = useState<OnboardingFlowState>({
    selectedProviders: [],
    currentProviderIndex: 0,
    directoryResult: null,
    discoveredEndpoints: [],
    internalProvider: null,
    providerApiKey: "",
  });

  const updateFlow = useCallback((next: Partial<OnboardingFlowState>) => {
    setFlow((prev) => ({ ...prev, ...next }));
  }, []);

  const advanceToNextProviderOrDone = useCallback(() => {
    setFlow((prev) => {
      const nextIndex = prev.currentProviderIndex + 1;
      if (nextIndex >= prev.selectedProviders.length) {
        // No providers left — fall through to Done.
        setStepId("done");
        return { ...prev, currentProviderIndex: 0 };
      }
      // Restart the loop on the next provider.
      setStepId("provider-discovery");
      return {
        ...prev,
        currentProviderIndex: nextIndex,
        discoveredEndpoints: [],
        internalProvider: null,
        providerApiKey: "",
      };
    });
  }, []);

  const skipRest = useCallback(async () => {
    try {
      await api.setOnboardingState(true);
    } catch {
      /* ignore */
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

  const currentSelection: ProviderSelection | null =
    flow.selectedProviders[flow.currentProviderIndex] ?? null;

  const stepBody = useMemo(() => {
    switch (stepId) {
      case "welcome":
        return <StepWelcome onNext={() => setStepId("directory")} />;

      case "directory":
        return (
          <StepDirectory
            onNext={(result) => {
              updateFlow({ directoryResult: result });
              setStepId("directory-mapping");
            }}
            onSkip={() => {
              updateFlow({ directoryResult: { graphConnected: false, availableFields: [], sampleUser: null } });
              setStepId("directory-mapping");
            }}
          />
        );

      case "directory-mapping":
        return (
          <StepDirectoryMapping
            directoryResult={flow.directoryResult}
            onNext={() => setStepId("terminology")}
            onSkip={() => setStepId("terminology")}
          />
        );

      case "terminology":
        return (
          <StepTerminology
            onNext={() => setStepId("select-providers")}
            onSkip={() => setStepId("select-providers")}
          />
        );

      case "select-providers":
        return (
          <StepSelectProviders
            mode={variant === "add-provider" ? "add-provider" : "onboarding"}
            initiallySelected={flow.selectedProviders.map((p) => p.id)}
            onNext={(selection) => {
              updateFlow({ selectedProviders: selection, currentProviderIndex: 0 });
              if (variant === "add-provider") {
                setStepId("provider-discovery");
              } else {
                setStepId("ai");
              }
            }}
            onSkip={() => {
              if (variant === "add-provider") {
                onComplete({ skipped: true });
                return;
              }
              updateFlow({ selectedProviders: [] });
              setStepId("ai");
            }}
          />
        );

      case "ai":
        return (
          <StepAi
            onNext={() => {
              if (flow.selectedProviders.length > 0) setStepId("provider-discovery");
              else setStepId("done");
            }}
            onSkip={() => {
              if (flow.selectedProviders.length > 0) setStepId("provider-discovery");
              else setStepId("done");
            }}
          />
        );

      case "provider-discovery":
        if (!currentSelection) {
          // Defensive: shouldn't happen, fall through to Done.
          setStepId("done");
          return null;
        }
        return (
          <StepProviderDiscovery
            selection={currentSelection}
            positionLabel={`Provider ${flow.currentProviderIndex + 1} of ${flow.selectedProviders.length}`}
            onNext={(result: ProviderDiscoveryResult) => {
              updateFlow({
                internalProvider: result.internalProvider,
                discoveredEndpoints: result.discoveredEndpoints,
                providerApiKey: result.apiKey,
              });
              setStepId("provider-mapping");
            }}
            onSkip={advanceToNextProviderOrDone}
          />
        );

      case "provider-mapping":
        if (!currentSelection || !flow.internalProvider) {
          advanceToNextProviderOrDone();
          return null;
        }
        return (
          <StepConfirmMapping
            internalProvider={flow.internalProvider}
            discoveredEndpoints={flow.discoveredEndpoints}
            providerApiKey={flow.providerApiKey}
            onNext={advanceToNextProviderOrDone}
            onSkip={advanceToNextProviderOrDone}
            positionLabel={`Provider ${flow.currentProviderIndex + 1} of ${flow.selectedProviders.length}`}
          />
        );

      case "done":
        return <StepDone variant={variant} onFinish={finish} />;

      default:
        return null;
    }
  }, [stepId, flow, currentSelection, updateFlow, advanceToNextProviderOrDone, finish, variant, onComplete]);

  return (
    <div className="space-y-6">
      {variant === "full" && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              {HEADER_STEPS.map((id, idx) => {
                const meta = STEP_LABELS[id];
                const headerIdx = HEADER_STEPS.indexOf(stepId);
                const reached = headerIdx >= idx;
                const isCurrent = stepId === id;
                const isLoopStep = id === "provider-discovery" || id === "provider-mapping";
                const subtitle =
                  isLoopStep && flow.selectedProviders.length > 0
                    ? `(${Math.min(flow.currentProviderIndex + 1, flow.selectedProviders.length)} of ${flow.selectedProviders.length})`
                    : null;
                return (
                  <div key={id} className="flex items-center gap-1.5">
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
                      {meta.label}
                      {meta.optional && <span className="text-muted-foreground ml-1">(optional)</span>}
                      {subtitle && <span className="text-muted-foreground ml-1">{subtitle}</span>}
                    </span>
                    {idx < HEADER_STEPS.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/30 ml-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {stepId !== "done" && (
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
      )}

      {variant === "add-provider" && onClose && stepId !== "done" && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      )}

      {stepBody}
    </div>
  );
}
